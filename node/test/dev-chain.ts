import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

export interface DevChainHandle {
  rpcUrl: string;
  stop(): Promise<void>;
}

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

/** Spawn a Hardhat dev chain for integration tests. See demo/src/dev-chain.ts. */
export async function startDevChain(): Promise<DevChainHandle> {
  const rpcPort = 20000 + Math.floor(Math.random() * 20000);
  const rpcUrl = `http://127.0.0.1:${rpcPort}`;

  const child: ChildProcess = spawn(
    "npx",
    ["hardhat", "node", "--hostname", "127.0.0.1", "--port", String(rpcPort)],
    { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] },
  );

  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`hardhat node exited early (code ${child.exitCode}):\n${output}`);
    }
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      if (response.ok) {
        return {
          rpcUrl,
          stop: () =>
            new Promise<void>((resolve) => {
              child.once("exit", () => resolve());
              child.kill("SIGINT");
              setTimeout(() => child.kill("SIGKILL"), 5000).unref();
            }),
        };
      }
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  child.kill("SIGKILL");
  throw new Error(`timed out waiting for hardhat node on port ${rpcPort}:\n${output}`);
}
