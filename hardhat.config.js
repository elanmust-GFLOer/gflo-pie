// Ideiglenes hardhat.config.js a teszteléshez
import "@nomicfoundation/hardhat-ethers";

export default {
  solidity: "0.8.28",
  networks: {
    sepolia: {
      url: "https://ethereum-sepolia-rpc.publicnode.com",
    }
  }
};
