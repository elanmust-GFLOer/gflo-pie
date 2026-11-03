import { ethers } from "ethers";

async function main() {
  // Sepolia RPC szolgáltató (nyilvános)
  const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");

  // A GFLO tokened címe a Sepolián
  const tokenAddress = "0x563b2e3b499818a2f84c472efb3169a2667807fe";

  // Minimális ABI a lekérdezéshez
  const abi = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function totalSupply() view returns (uint256)",
    "function decimals() view returns (uint8)"
  ];

  const tokenContract = new ethers.Contract(tokenAddress, abi, provider);

  try {
    console.log("Kapcsolódás a Sepolia hálózathoz...");
    const name = await tokenContract.name();
    const symbol = await tokenContract.symbol();
    const decimals = await tokenContract.decimals();
    const supply = await tokenContract.totalSupply();

    console.log("------------------------------------");
    console.log(`Siker! Token adatai:`);
    console.log(`Név: ${name}`);
    console.log(`Szimbólum: ${symbol}`);
    console.log(`Összes készlet: ${ethers.formatUnits(supply, decimals)} ${symbol}`);
    console.log("------------------------------------");
  } catch (error) {
    console.error("Hiba történt a lekérdezés során:");
    console.error(error.message);
  }
}

main();
