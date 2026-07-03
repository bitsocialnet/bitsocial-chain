#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { createServer as createViteServer } from "vite";
import { repoRoot, resolvePort } from "./dev-server-utils.mjs";

function fail(message) {
  console.error(message);
  process.exit(1);
}

const fallbackPort = Number(process.env.CHAIN_PORT || 5173);
const requestedPort = Number(process.env.PORT || fallbackPort);
const host = process.env.HOST || "127.0.0.1";
const usingPortless = Boolean(process.env.PORTLESS_URL);

if (!Number.isInteger(requestedPort) || requestedPort <= 0) {
  fail(`Invalid chain port: ${process.env.PORT || process.env.CHAIN_PORT || "undefined"}`);
}

const port = usingPortless ? requestedPort : await resolvePort(requestedPort);
const vite = await createViteServer({
  configFile: path.join(repoRoot, "chain/vite.config.ts"),
  server: {
    host,
    port,
    strictPort: true,
  },
});

const forwardSignal = (signal) => {
  vite.close().finally(() => {
    process.kill(process.pid, signal);
  });
};

const onSigint = () => forwardSignal("SIGINT");
const onSigterm = () => forwardSignal("SIGTERM");

process.on("SIGINT", onSigint);
process.on("SIGTERM", onSigterm);

await vite.listen();

console.log("");
console.log(`Starting chain Vite dev server from ${repoRoot}`);
if (usingPortless) {
  console.log(`Public URL: ${process.env.PORTLESS_URL}`);
}
console.log(`Host URL: http://${host}:${port}`);
if (!usingPortless && port !== requestedPort) {
  console.log(`Preferred port ${requestedPort} is busy, so this run will use ${port}.`);
}
console.log("");
