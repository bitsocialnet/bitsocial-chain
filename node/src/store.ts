import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { RegistryState } from "@bitsocial/bso-chain-protocol";
import { connect } from "@tursodatabase/database";
import type { Database } from "@tursodatabase/database";

/** Reference to the last L1 block whose intents are reflected in the state. */
export interface ProcessedBlockRef {
  number: number;
  hash: string;
}

/** Everything the node persists. Stores serialize this as canonical JSON. */
export interface NodeState {
  chainId: number;
  /** First block (inclusive) the registry is derived from. */
  startBlock: number;
  intentAddress: string;
  lastProcessed: ProcessedBlockRef | null;
  registry: RegistryState;
}

type MaybePromise<T> = T | Promise<T>;

export interface StateStore {
  load(): MaybePromise<NodeState | undefined>;
  save(state: NodeState): MaybePromise<void>;
  close?(): MaybePromise<void>;
}

/** Keeps state in memory only. Used for re-derivation checks and tests. */
export class MemoryStateStore implements StateStore {
  private state: NodeState | undefined;

  load(): NodeState | undefined {
    return this.state;
  }

  save(state: NodeState): void {
    this.state = state;
  }
}

/**
 * Atomic single-file JSON persistence: write to a temp file, then rename.
 * Good enough for a POC registry; see POC_LIMITATIONS.md for why a real
 * deployment would use a proper database.
 */
export class FileStateStore implements StateStore {
  constructor(private readonly filePath: string) {}

  load(): NodeState | undefined {
    let raw: string;
    try {
      raw = readFileSync(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
    return JSON.parse(raw) as NodeState;
  }

  save(state: NodeState): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(state));
    renameSync(tmpPath, this.filePath);
  }
}

export interface TursoStateStoreOptions {
  /** Optional low-level Turso database options, e.g. encryption or timeouts. */
  databaseOptions?: Parameters<typeof connect>[1];
  /** Row key for this node state; useful if a database hosts multiple states. */
  key?: string;
}

/**
 * Local Turso Database persistence for the derivation node.
 *
 * The POC still persists a single canonical NodeState blob. Turso gives the
 * node a real SQLite-compatible database file now, while leaving room to move
 * hot paths into indexed tables later.
 */
export class TursoStateStore implements StateStore {
  private dbPromise: Promise<Database> | undefined;
  private readonly key: string;

  constructor(
    private readonly dbPath: string,
    private readonly options: TursoStateStoreOptions = {},
  ) {
    this.key = options.key ?? "node-state";
  }

  async load(): Promise<NodeState | undefined> {
    const db = await this.db();
    const row = await db.get("SELECT state_json FROM node_state WHERE key = ?", this.key);
    if (row === undefined || row === null) {
      return undefined;
    }
    if (typeof row !== "object" || !("state_json" in row)) {
      throw new Error("invalid Turso node_state row");
    }
    const stateJson = (row as { state_json: unknown }).state_json;
    if (typeof stateJson !== "string") {
      throw new Error("invalid Turso node_state.state_json value");
    }
    return JSON.parse(stateJson) as NodeState;
  }

  async save(state: NodeState): Promise<void> {
    const db = await this.db();
    await db.run(
      `INSERT INTO node_state (key, state_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         state_json = excluded.state_json,
         updated_at = excluded.updated_at`,
      this.key,
      JSON.stringify(state),
      Math.floor(Date.now() / 1000),
    );
  }

  async close(): Promise<void> {
    if (this.dbPromise === undefined) {
      return;
    }
    const db = await this.dbPromise;
    this.dbPromise = undefined;
    await db.close();
  }

  private async db(): Promise<Database> {
    if (this.dbPromise === undefined) {
      if (this.dbPath !== ":memory:") {
        mkdirSync(dirname(this.dbPath), { recursive: true });
      }
      this.dbPromise = this.open();
    }
    return this.dbPromise;
  }

  private async open(): Promise<Database> {
    const db =
      this.options.databaseOptions === undefined
        ? await connect(this.dbPath)
        : await connect(this.dbPath, this.options.databaseOptions);
    await db.exec(
      `CREATE TABLE IF NOT EXISTS node_state (
        key TEXT PRIMARY KEY,
        state_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
    );
    return db;
  }
}
