require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
const path = require("node:path");
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

// Use the lockfile-bound compiler. No remote compiler download or deployment config.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async ({ solcVersion }) => {
  const solc = require("solc");
  if (solcVersion !== "0.8.28" || !solc.version().startsWith("0.8.28+")) {
    throw new Error("Unexpected Solidity compiler: " + solcVersion + " / " + solc.version());
  }
  return { compilerPath: require.resolve("solc/soljson.js"), isSolcJs: true,
    version: solcVersion, longVersion: solc.version() };
});

// Isolated testing: no deployment mnemonics, external RPC or Sepolia.
module.exports = {
  solidity: { version: "0.8.28",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" } },
  networks: { hardhat: { chainId: 31337, hardfork: "cancun" } },
  paths: {
    root: __dirname,
    sources: path.join(__dirname, ".sources/contracts"),
    tests: path.join(__dirname, "test"),
    cache: path.join(__dirname, ".cache"),
    artifacts: path.join(__dirname, ".artifacts")
  }
};
