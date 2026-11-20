import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const baseEnv = { ...process.env, BITSOCIAL_PINNED_NODE_REEXEC: "1", BROWSER: "none" };
for (const name of ["PORTLESS", "PORTLESS_URL", "PORT", "HOST"]) {
  delete baseEnv[name];
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntil(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await delay(50);
  }
  return false;
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function groupAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

// Each script runs in its own process group so a test can signal exactly one PID, and cleanup
// still reaches every descendant it left behind.
function launch(t, script, env = {}, root = repoRoot) {
  const child = spawn(process.execPath, [path.join(root, "scripts", script)], {
    cwd: root,
    env: { ...baseEnv, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  t.after(() => {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      /* Already gone. */
    }
  });
  return {
    pid: child.pid,
    output: () => output,
    async waitForOutput(text, timeoutMs = 30_000) {
      const seen = await waitUntil(() => output.includes(text), timeoutMs);
      assert.ok(seen, `${script} never printed "${text}":\n${output}`);
    },
  };
}

test("start-chain.mjs stops its dev server when only the launcher is signalled", async (t) => {
  const port = await freePort();
  const run = launch(t, "start-chain.mjs", {
    PORTLESS: "0",
    PORT: String(port),
    HOST: "127.0.0.1",
  });
  await run.waitForOutput("Host URL");

  process.kill(run.pid, "SIGTERM");

  const stopped = await waitUntil(() => !groupAlive(run.pid), 10_000);
  assert.ok(stopped, `start-chain.mjs left its server running:\n${run.output()}`);
});
