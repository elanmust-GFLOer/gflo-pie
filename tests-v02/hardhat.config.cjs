require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
const path = require("node:path");

// Isolated testing: does NOT read deployment mnemonics or use Sepolia.
module.exports = {
  solidity: { version: "0.8.28", settings: { optimizer: { enabled: true, runs: 200 } } },
  networks: { hardhat: { chainId: 31337 } },
  paths: {
    sources: path.resolve(__dirname, "../contracts"),
    tests: path.resolve(__dirname, "test"),
    cache: path.resolve(__dirname, ".cache"),
    artifacts: path.resolve(__dirname, ".artifacts")
  }
};
