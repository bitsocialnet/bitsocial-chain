import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "protocol/test/**/*.test.ts",
      "node/test/**/*.test.ts",
      "resolver/test/**/*.test.ts",
    ],
    // The node integration tests spawn a local Ethereum dev chain.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
