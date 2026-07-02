#!/usr/bin/env node
import { parseArgs } from "node:util";
import { DerivationNode, type NodeLogger } from "./derivation.js";
import { startReadApi } from "./server.js";
import { FileStateStore, TursoStateStore, type StateStore } from "./store.js";

const consoleLogger: NodeLogger = {
  info: (message) => console.log(`[bso-chain-node] ${message}`),
  warn: (message) => console.warn(`[bso-chain-node] ${message}`),
};

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "rpc-url": { type: "string", default: "http://127.0.0.1:8545" },
      port: { type: "string", default: "4150" },
      db: { type: "string", default: ".bso-chain-data/state.json" },
      store: { type: "string", default: "file" },
      "start-block": { type: "string", default: "0" },
      confirmations: { type: "string", default: "0" },
      "poll-interval": { type: "string", default: "1000" },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help) {
    console.log(`bso-chain-node — deterministic .bso derivation node

Options:
  --rpc-url <url>        Ethereum L1 JSON-RPC endpoint (default http://127.0.0.1:8545)
  --port <port>          Read API port (default 4150)
  --db <path>            State file/database path (default .bso-chain-data/state.json)
  --store <file|turso>   State storage backend (default file)
  --start-block <n>      First L1 block to derive from (default 0)
  --confirmations <n>    Blocks to lag behind head (default 0)
  --poll-interval <ms>   L1 poll interval (default 1000)`);
    return;
  }

  const storeBackend = values.store ?? "file";
  if (storeBackend !== "file" && storeBackend !== "turso") {
    throw new Error(`unknown --store value "${storeBackend}"; expected "file" or "turso"`);
  }
  const store: StateStore =
    storeBackend === "turso" ? new TursoStateStore(values.db) : new FileStateStore(values.db);

  const node = new DerivationNode({
    rpcUrl: values["rpc-url"],
    store,
    startBlock: Number(values["start-block"]),
    confirmations: Number(values.confirmations),
    pollIntervalMs: Number(values["poll-interval"]),
    logger: consoleLogger,
  });

  await node.init();
  node.start();
  const api = await startReadApi(node, { port: Number(values.port) });
  consoleLogger.info(`following L1 at ${values["rpc-url"]}`);
  consoleLogger.info(`using ${storeBackend} state store at ${values.db}`);
  consoleLogger.info(`read API listening at ${api.endpoint}`);

  const shutdown = async () => {
    consoleLogger.info("shutting down");
    await node.close();
    await api.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
