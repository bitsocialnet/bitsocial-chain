import {
  type Address,
  type Hash,
  type Hex,
  isAddressEqual,
  TransactionNotFoundError,
  type TransactionReceipt,
  TransactionReceiptNotFoundError,
} from "viem";

type SentTransaction = {
  hash: Hash;
  from: Address;
  nonce: number;
  to: Address | null;
  value: bigint;
  input: Hex;
};

/** The reads following a transaction takes; the page's public client provides them. */
export type FollowReads = {
  getTransactionReceipt(args: { hash: Hash }): Promise<TransactionReceipt>;
  getTransaction(args: { hash: Hash }): Promise<SentTransaction>;
  getBlockNumber(): Promise<bigint>;
  getTransactionCount(args: { address: Address; blockNumber: bigint }): Promise<number>;
  getBlock(args: {
    blockNumber: bigint;
    includeTransactions: true;
  }): Promise<{ transactions: readonly SentTransaction[] }>;
};

/**
 * A sent transaction, followed by its sender and nonce. A wallet speeds up or cancels a pending
 * transaction by sending another with the same nonce, and the RPC can forget the original once it
 * is replaced or dropped, so what the first sighting showed is kept for every later check.
 */
export type Followed = {
  hash: Hash;
  // A block at which the transaction's nonce was still unused: at first one read before sending.
  openAt: bigint;
  // The transaction as the RPC first showed it.
  sent?: SentTransaction;
};

/**
 * How a followed transaction ended: the receipt of the transaction that used its nonce, and
 * whether that was another call (a cancel or replacement) rather than it or a speed-up of it.
 */
export type Settled = { receipt: TransactionReceipt; replaced: boolean };

function missing(error: unknown): null {
  if (error instanceof TransactionReceiptNotFoundError || error instanceof TransactionNotFoundError)
    return null;
  throw error;
}

/**
 * One check: how the transaction ended, or null while a transaction with its sender and nonce can
 * still be mined. Until the RPC has shown the transaction its nonce is unknown, so only its own
 * receipt settles it.
 */
export async function checkFollowed(
  reads: FollowReads,
  followed: Followed,
): Promise<Settled | null> {
  const receipt = await reads.getTransactionReceipt({ hash: followed.hash }).catch(missing);
  if (receipt) return { receipt, replaced: false };
  followed.sent ??=
    (await reads.getTransaction({ hash: followed.hash }).catch(missing)) ?? undefined;
  const sent = followed.sent;
  if (!sent) return null;

  const usedBy = async (blockNumber: bigint) =>
    (await reads.getTransactionCount({ address: sent.from, blockNumber })) > sent.nonce;
  const head = await reads.getBlockNumber();
  // A node behind the one that answered before can return an older head.
  if (head <= followed.openAt) return null;
  if (!(await usedBy(head))) {
    followed.openAt = head;
    return null;
  }

  // The nonce was used in a block after `openAt`, usually the next one: find the first.
  let low = followed.openAt;
  let high = head;
  while (high - low > 1n) {
    const middle = (low + high) / 2n;
    if (await usedBy(middle)) high = middle;
    else low = middle;
  }
  const block = await reads.getBlock({ blockNumber: high, includeTransactions: true });
  const used = block.transactions.find(
    (tx) => isAddressEqual(tx.from, sent.from) && tx.nonce === sent.nonce,
  );
  if (!used) return null;
  // As viem tells them apart: a speed-up is the same call at a higher fee.
  const sameCall =
    used.to?.toLowerCase() === sent.to?.toLowerCase() &&
    used.value === sent.value &&
    used.input.toLowerCase() === sent.input.toLowerCase();
  return {
    receipt: await reads.getTransactionReceipt({ hash: used.hash }),
    replaced: !sameCall,
  };
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const stop = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", stop);
      resolve();
    }, ms);
    signal?.addEventListener("abort", stop, { once: true });
  });
}

/**
 * Checks every `pollMs` until the transaction is settled. An RPC error is retried rather than
 * reported, since reporting a transaction that may still be mined as failed would offer the
 * visitor the same action again. Only `signal` ends the wait early.
 */
export async function settleFollowed(
  reads: FollowReads,
  followed: Followed,
  { pollMs, signal }: { pollMs: number; signal?: AbortSignal },
): Promise<Settled> {
  for (;;) {
    signal?.throwIfAborted();
    let settled: Settled | null = null;
    try {
      settled = await checkFollowed(reads, followed);
    } catch (error) {
      if (!signal?.aborted) console.warn("Could not check the transaction; checking again.", error);
    }
    signal?.throwIfAborted();
    if (settled) return settled;
    await sleep(pollMs, signal);
  }
}
