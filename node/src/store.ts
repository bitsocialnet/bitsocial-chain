import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { RegistryState } from "@bitsocial/bso-network-protocol";

/** Reference to the last L1 block whose intents are reflected in the state. */
export interface ProcessedBlockRef {
  number: number;
  hash: string;
}

/** Everything the node persists. Plain JSON on disk for the POC. */
export interface NodeState {
  chainId: number;
  /** First block (inclusive) the registry is derived from. */
  startBlock: number;
  intentAddress: string;
  lastProcessed: ProcessedBlockRef | null;
  registry: RegistryState;
}

export interface StateStore {
  load(): NodeState | undefined;
  save(state: NodeState): void;
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
