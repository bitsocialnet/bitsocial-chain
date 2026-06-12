// Minimal Hardhat config. This POC has no Solidity contracts to compile;
// Hardhat is used only as an npm-installable local Ethereum L1 dev chain
// (`npx hardhat node`). Any other dev chain (e.g. Anvil) works too — the
// derivation node only needs a standard Ethereum JSON-RPC endpoint.
module.exports = {
  solidity: "0.8.28",
};
