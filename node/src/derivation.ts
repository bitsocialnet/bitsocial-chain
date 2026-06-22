import {
  applyDecodedIntent,
  BSO_INTENT_ADDRESS,
  computeStateHash,
  createGenesisState,
  decodeIntentCalldata,
  resolveName,
  type DerivedTxContext,
  type RegistryState,
  type ResolveOutcome,
} from "@bitsocial/bso-network-protocol";
import { createPublicClient, http, type PublicClient } from "viem";
import { MemoryStateStore, type NodeState, type StateStore } from "./store.js";

export interface NodeLogger {
  info(message: string): void;
  warn(message: string): void;
}

export const silentLogger: NodeLogger = { info: () => {}, warn: () => {} };

export interface DerivationNodeOptions {
  /** Ethereum L1 JSON-RPC endpoint to derive from. */
  rpcUrl: string;
  /** Where derived state is persisted. Defaults to memory only. */
  store?: StateStore;
  /** First L1 block (inclusive) intents are derived from. Default 0. */
  startBlock?: number;
  /**
   * Blocks behind head to lag, as a cheap reorg buffer. Default 0 so a local
   * dev chain demos instantly; a real deployment would lag finality instead.
   */
  confirmations?: number;
  /** Intent inbox address. Default {@link BSO_INTENT_ADDRESS}. */
  intentAddress?: string;
  /** Poll interval for {@link DerivationNode.start}. Default 1000ms. */
  pollIntervalMs?: number;
  logger?: NodeLogger;
}

export interface SyncResult {
  /** Highest block reflected in state after this sync, or null if none. */
  processedTo: number | null;
  /** Number of blocks applied during this sync (including re-derivation). */
  blocksApplied: number;
  /** True if a reorg was detected and state was re-derived from genesis. */
  reorged: boolean;
}

export interface NodeStatus {
  chainId: number;
  startBlock: number;
  intentAddress: string;
  lastProcessedBlock: { number: number; hash: string } | null;
  stateHash: string;
  names: number;
  acceptedIntents: number;
  rejectedIntents: number;
}

/**
 * Deterministic .bso derivation node.
 *
 * Watches an Ethereum L1 JSON-RPC endpoint for transactions to the intent
 * address, applies the protocol state transition rules in L1 order
 * (block number, then transaction index), and persists derived state.
 *
 * Determinism: state is a pure function of (chain history, startBlock,
 * intentAddress). Any node following the same L1 with the same configuration
 * derives byte-identical state — verify with {@link DerivationNode.stateHash}.
 *
 * Reorg handling (POC rule, documented in SPEC.md): the node remembers the
 * hash of the last processed block. If the chain head moves backwards or the
 * next block's parentHash no longer matches, the node discards derived state
 * and re-derives from the start block. Registries are small, so full
 * re-derivation is acceptable here; checkpointing is future work.
 */
export class DerivationNode {
  private readonly client: PublicClient;
  private readonly store: StateStore;
  private readonly startBlock: number;
  private readonly confirmations: number;
  private readonly intentAddress: string;
  private readonly pollIntervalMs: number;
  private readonly logger: NodeLogger;

  private state: NodeState | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private syncing: Promise<SyncResult> | null = null;

  constructor(options: DerivationNodeOptions) {
    // cacheTime: 0 — the node's poll loop sets its own cadence; a cached
    // eth_blockNumber would make freshly mined blocks invisible to syncOnce().
    this.client = createPublicClient({ transport: http(options.rpcUrl), cacheTime: 0 });
    this.store = options.store ?? new MemoryStateStore();
    this.startBlock = options.startBlock ?? 0;
    this.confirmations = options.confirmations ?? 0;
    this.intentAddress = (options.intentAddress ?? BSO_INTENT_ADDRESS).toLowerCase();
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.logger = options.logger ?? silentLogger;
  }

  /** Connect to L1 and load (or initialize) persisted state. */
  async init(): Promise<void> {
    const chainId = await this.client.getChainId();
    const persisted = await this.store.load();
    if (
      persisted !== undefined &&
      persisted.chainId === chainId &&
      persisted.startBlock === this.startBlock &&
      persisted.intentAddress === this.intentAddress
    ) {
      this.state = persisted;
      this.logger.info(
        `resuming from persisted state at block ${persisted.lastProcessed?.number ?? "genesis"}`,
      );
    } else {
      if (persisted !== undefined) {
        this.logger.warn("persisted state does not match configuration; re-deriving from genesis");
      }
      this.state = this.freshState(chainId);
    }
  }

  private freshState(chainId: number): NodeState {
    return {
      chainId,
      startBlock: this.startBlock,
      intentAddress: this.intentAddress,
      lastProcessed: null,
      registry: createGenesisState(),
    };
  }

  private requireState(): NodeState {
    if (this.state === null) {
      throw new Error("DerivationNode not initialized. Call init() first.");
    }
    return this.state;
  }

  /**
   * Process every available block up to head minus confirmations.
   * Serialized: concurrent callers share the same in-flight sync.
   */
  syncOnce(): Promise<SyncResult> {
    if (this.syncing === null) {
      this.syncing = this.doSync().finally(() => {
        this.syncing = null;
      });
    }
    return this.syncing;
  }

  private async doSync(): Promise<SyncResult> {
    const state = this.requireState();
    const head = Number(await this.client.getBlockNumber());
    const target = head - this.confirmations;
    let reorged = false;
    let blocksApplied = 0;

    // Head moved backwards past our cursor: reorg on a dev chain
    // (e.g. evm_revert) or an RPC pointing at a different history.
    if (state.lastProcessed !== null && target < state.lastProcessed.number) {
      this.logger.warn(
        `reorg detected: target block ${target} < last processed ${state.lastProcessed.number}; re-deriving`,
      );
      await this.resetDerivedState();
      reorged = true;
    }

    // Anchor check: the block we processed last must still be canonical.
    // Catches reorgs that rebuilt the chain to the same (or greater) height,
    // which neither the regression check above nor the parentHash check
    // below would see.
    const anchor = this.state!.lastProcessed;
    if (anchor !== null && target >= anchor.number) {
      const block = await this.client.getBlock({ blockNumber: BigInt(anchor.number) });
      if (block.hash !== anchor.hash) {
        this.logger.warn(
          `reorg detected: block ${anchor.number} is now ${block.hash}, expected ${anchor.hash}; re-deriving`,
        );
        await this.resetDerivedState();
        reorged = true;
      }
    }

    let cursor = this.state!.lastProcessed === null ? this.startBlock : this.state!.lastProcessed.number + 1;

    while (cursor <= target) {
      const block = await this.client.getBlock({
        blockNumber: BigInt(cursor),
        includeTransactions: true,
      });

      const lastProcessed = this.state!.lastProcessed;
      if (lastProcessed !== null && block.parentHash !== lastProcessed.hash) {
        this.logger.warn(
          `reorg detected: block ${cursor} parent ${block.parentHash} != processed ${lastProcessed.hash}; re-deriving`,
        );
        await this.resetDerivedState();
        reorged = true;
        cursor = this.startBlock;
        continue;
      }

      this.applyBlock(this.state!.registry, block);
      this.state!.lastProcessed = { number: cursor, hash: block.hash ?? "" };
      await this.store.save(this.state!);
      blocksApplied += 1;
      cursor += 1;
    }

    return { processedTo: this.state!.lastProcessed?.number ?? null, blocksApplied, reorged };
  }

  private async resetDerivedState(): Promise<void> {
    const state = this.requireState();
    this.state = this.freshState(state.chainId);
    await this.store.save(this.state);
  }

  private applyBlock(
    registry: RegistryState,
    block: {
      number: bigint | null;
      timestamp: bigint;
      transactions: unknown[];
    },
  ): void {
    type MinimalTx = {
      to: string | null;
      from: string;
      input: string;
      hash: string;
      transactionIndex: number | null;
    };

    const transactions = (block.transactions as MinimalTx[])
      .filter((tx) => tx.to !== null && tx.to.toLowerCase() === this.intentAddress)
      .sort((a, b) => Number(a.transactionIndex ?? 0) - Number(b.transactionIndex ?? 0));

    for (const tx of transactions) {
      const decoded = decodeIntentCalldata(tx.input);
      const ctx: DerivedTxContext = {
        from: tx.from.toLowerCase(),
        blockNumber: Number(block.number ?? 0),
        txIndex: Number(tx.transactionIndex ?? 0),
        txHash: tx.hash,
        timestamp: Number(block.timestamp),
      };
      const result = applyDecodedIntent(registry, decoded, ctx);
      if (result.outcome === "accepted") {
        this.logger.info(
          `block ${ctx.blockNumber}: accepted ${decoded.kind === "intent" ? decoded.intent.op : "?"} for ${result.record.name} (v${result.record.version})`,
        );
      } else if (result.outcome === "rejected") {
        this.logger.info(`block ${ctx.blockNumber}: rejected intent (${result.reason}) from ${ctx.from}`);
      }
    }
  }

  /** Start polling L1. Errors are logged and retried on the next tick. */
  start(): void {
    this.stopped = false;
    const tick = async () => {
      if (this.stopped) {
        return;
      }
      try {
        await this.syncOnce();
      } catch (error) {
        this.logger.warn(`sync failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (!this.stopped) {
        this.pollTimer = setTimeout(tick, this.pollIntervalMs);
      }
    };
    void tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async close(): Promise<void> {
    this.stop();
    await this.store.close?.();
  }

  /** Wait until the node has processed at least `blockNumber`. */
  async waitForBlock(blockNumber: number, timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const last = this.requireState().lastProcessed;
      if (last !== null && last.number >= blockNumber) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`timed out waiting for block ${blockNumber}`);
  }

  getRegistry(): RegistryState {
    return this.requireState().registry;
  }

  resolve(name: string): ResolveOutcome {
    return resolveName(this.requireState().registry, name);
  }

  stateHash(): string {
    return computeStateHash(this.requireState().registry);
  }

  getStatus(): NodeStatus {
    const state = this.requireState();
    return {
      chainId: state.chainId,
      startBlock: state.startBlock,
      intentAddress: state.intentAddress,
      lastProcessedBlock: state.lastProcessed,
      stateHash: this.stateHash(),
      names: Object.keys(state.registry.names).length,
      acceptedIntents: state.registry.acceptedIntents,
      rejectedIntents: state.registry.rejected.length,
    };
  }
}
