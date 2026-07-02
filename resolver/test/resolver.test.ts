import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BsoChainResolver } from "@bitsocial/bso-chain-resolver";

const RECORD = {
  name: "alice.bso",
  owner: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
  publicKey: "12D3KooWN5rLmRJ8fWMwTtkDN7w2RgPPGRM4mtWTnfbjpi1Sh7zR",
  metadataUri: "ipfs://m1",
  version: 2,
  status: "active",
  internalDetail: "should not leak into resolver results",
};

let server: Server;
let endpoint: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    switch (url.pathname) {
      case "/v1/names/alice.bso":
        send(200, RECORD);
        return;
      case "/v1/names/bare.bso": {
        const { metadataUri: _unused, ...withoutMetadata } = RECORD;
        send(200, { ...withoutMetadata, name: "bare.bso" });
        return;
      }
      case "/v1/names/revoked.bso":
        send(410, { error: "NAME_REVOKED" });
        return;
      case "/v1/names/broken.bso":
        send(500, { error: "BOOM" });
        return;
      case "/v1/names/slow.bso":
        // Never responds; used for abort tests.
        return;
      default:
        send(404, { error: "NAME_NOT_REGISTERED" });
    }
  });
  endpoint = await new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
});

afterAll(() => {
  server.closeAllConnections();
  return new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("BsoChainResolver", () => {
  it("canResolve accepts well-formed .bso names only", () => {
    const resolver = new BsoChainResolver({ endpoint });
    expect(resolver.canResolve({ name: "alice.bso" })).toBe(true);
    expect(resolver.canResolve({ name: "ALICE.bso" })).toBe(true);
    expect(resolver.canResolve({ name: "alice.eth" })).toBe(false);
    expect(resolver.canResolve({ name: "sub.alice.bso" })).toBe(false);
    expect(resolver.canResolve({ name: "-alice.bso" })).toBe(false);
  });

  it("resolves an active name to the documented result shape", async () => {
    const resolver = new BsoChainResolver({ endpoint });
    const result = await resolver.resolve({ name: "alice.bso" });
    expect(result).toEqual({
      name: "alice.bso",
      owner: RECORD.owner,
      publicKey: RECORD.publicKey,
      metadataUri: "ipfs://m1",
      version: 2,
    });
  });

  it("omits metadataUri when the record has none", async () => {
    const resolver = new BsoChainResolver({ endpoint });
    const result = await resolver.resolve({ name: "bare.bso" });
    expect(result).toBeDefined();
    expect(result && "metadataUri" in result).toBe(false);
  });

  it("returns undefined for unregistered and revoked names", async () => {
    const resolver = new BsoChainResolver({ endpoint });
    expect(await resolver.resolve({ name: "missing.bso" })).toBeUndefined();
    expect(await resolver.resolve({ name: "revoked.bso" })).toBeUndefined();
  });

  it("throws on unexpected node errors", async () => {
    const resolver = new BsoChainResolver({ endpoint });
    await expect(resolver.resolve({ name: "broken.bso" })).rejects.toThrow(/500/);
  });

  it("honors caller abort signals", async () => {
    const resolver = new BsoChainResolver({ endpoint });
    const aborted = AbortSignal.abort();
    await expect(resolver.resolve({ name: "alice.bso", abortSignal: aborted })).rejects.toThrow(
      /aborted/i,
    );

    const controller = new AbortController();
    const pending = resolver.resolve({ name: "slow.bso", abortSignal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow();
  });

  it("destroy aborts in-flight resolutions and blocks further use", async () => {
    const resolver = new BsoChainResolver({ endpoint });
    const pending = resolver.resolve({ name: "slow.bso" });
    await resolver.destroy();
    await expect(pending).rejects.toThrow();
    await expect(resolver.resolve({ name: "alice.bso" })).rejects.toThrow(/destroy/);
  });

  it("uses the bso-resolver key convention", () => {
    expect(new BsoChainResolver({ endpoint }).key).toBe("bso-chain");
    expect(new BsoChainResolver({ endpoint, key: "custom" }).key).toBe("custom");
  });
});
