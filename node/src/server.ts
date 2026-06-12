import { createServer, type Server } from "node:http";
import type { DerivationNode } from "./derivation.js";

export interface ReadApiOptions {
  /** Port to listen on. 0 picks an ephemeral port. */
  port: number;
  host?: string;
}

export interface ReadApiHandle {
  server: Server;
  /** Actual bound port (useful when `port: 0` was requested). */
  port: number;
  endpoint: string;
  close(): Promise<void>;
}

/**
 * Minimal JSON read API over derived state. Zero dependencies (node:http).
 *
 *   GET /v1/status        — derivation status + state hash
 *   GET /v1/names         — all records (active and revoked), sorted by name
 *   GET /v1/names/:name   — resolve one name
 *   GET /v1/rejected      — deterministically rejected intents
 *
 * Responses for /v1/names/:name:
 *   200 record            — active name
 *   400 INVALID_NAME      — not a well-formed .bso name
 *   404 NAME_NOT_REGISTERED
 *   410 NAME_REVOKED      — tombstoned record included for transparency
 */
export function startReadApi(node: DerivationNode, options: ReadApiOptions): Promise<ReadApiHandle> {
  const host = options.host ?? "127.0.0.1";

  const server = createServer((req, res) => {
    const sendJson = (status: number, body: unknown) => {
      res.writeHead(status, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      });
      res.end(JSON.stringify(body));
    };

    if (req.method !== "GET") {
      sendJson(405, { error: "METHOD_NOT_ALLOWED" });
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const segments = url.pathname.split("/").filter((segment) => segment.length > 0);

    if (segments[0] !== "v1") {
      sendJson(404, { error: "NOT_FOUND" });
      return;
    }

    if (segments[1] === "status" && segments.length === 2) {
      sendJson(200, node.getStatus());
      return;
    }

    if (segments[1] === "names" && segments.length === 2) {
      const registry = node.getRegistry();
      const names = Object.keys(registry.names)
        .sort()
        .map((name) => registry.names[name]);
      sendJson(200, { names });
      return;
    }

    if (segments[1] === "names" && segments.length === 3) {
      const outcome = node.resolve(decodeURIComponent(segments[2] ?? ""));
      switch (outcome.status) {
        case "active":
          sendJson(200, outcome.record);
          return;
        case "revoked":
          sendJson(410, { error: "NAME_REVOKED", record: outcome.record });
          return;
        case "unregistered":
          sendJson(404, { error: "NAME_NOT_REGISTERED", name: outcome.name });
          return;
        case "invalid_name":
          sendJson(400, { error: "INVALID_NAME" });
          return;
      }
    }

    if (segments[1] === "rejected" && segments.length === 2) {
      sendJson(200, { rejected: node.getRegistry().rejected });
      return;
    }

    sendJson(404, { error: "NOT_FOUND" });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, host, () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : options.port;
      resolve({
        server,
        port,
        endpoint: `http://${host}:${port}`,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            server.close((error) => (error ? rejectClose(error) : resolveClose()));
          }),
      });
    });
  });
}
