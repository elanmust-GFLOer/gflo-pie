// Csak az ethers-t használjuk, a toolbox-ot nem!
require("@nomicfoundation/hardhat-ethers");

module.exports = {
  solidity: "0.8.28",
  networks: {
    sepolia: {
      url: "https://ethereum-sepolia-rpc.publicnode.com",
    }
  }
};
