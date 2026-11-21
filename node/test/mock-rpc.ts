import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export interface MockRpcHandle {
  rpcUrl: string;
  /** Highest block number reported and served. */
  head: number;
  /** Changing it gives every block another hash, like a reorg to a new history. */
  fork: number;
  /**
   * Runs before each eth_getBlockByNumber answer. Return "missing" to answer
   * null (block not found); return a pending promise to hold the answer.
   */
  onGetBlock: (blockNumber: number) => "serve" | "missing" | Promise<"serve" | "missing">;
  close(): Promise<void>;
}

const toHex = (value: number) => `0x${value.toString(16)}`;

/**
 * Minimal Ethereum JSON-RPC server serving empty blocks 0..head, for RPC
 * behavior a Hardhat dev chain cannot produce on demand: a block that is
 * briefly missing, or a call that does not answer.
 */
export async function startMockRpc(): Promise<MockRpcHandle> {
  const blockHash = (fork: number, blockNumber: number) =>
    `0x${fork.toString(16).padStart(8, "0")}${(blockNumber + 1).toString(16).padStart(56, "0")}`;

  const block = (blockNumber: number) => ({
    number: toHex(blockNumber),
    hash: blockHash(handle.fork, blockNumber),
    parentHash: blockNumber === 0 ? `0x${"0".repeat(64)}` : blockHash(handle.fork, blockNumber - 1),
    timestamp: toHex(1_700_000_000 + blockNumber),
    transactions: [],
  });

  const answer = async (method: string, params: unknown[]): Promise<unknown> => {
    switch (method) {
      case "eth_chainId":
        return "0x7a69";
      case "eth_blockNumber":
        return toHex(handle.head);
      case "eth_getBlockByNumber": {
        const blockNumber = Number(params[0]);
        if ((await handle.onGetBlock(blockNumber)) === "missing" || blockNumber > handle.head) {
          return null;
        }
        return block(blockNumber);
      }
      default:
        throw new Error(`mock RPC does not support ${method}`);
    }
  };

  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      const request = JSON.parse(body) as { id: number; method: string; params?: unknown[] };
      const reply = (payload: Record<string, unknown>) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: request.id, ...payload }));
      };
      answer(request.method, request.params ?? []).then(
        (result) => reply({ result }),
        (error: unknown) => reply({ error: { code: -32601, message: String(error) } }),
      );
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  const handle: MockRpcHandle = {
    rpcUrl: `http://127.0.0.1:${port}`,
    head: 0,
    fork: 0,
    onGetBlock: () => "serve",
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
  return handle;
}
