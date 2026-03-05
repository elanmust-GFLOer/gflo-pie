import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
  const tokenAddress = "0x563b2e3b499818a2f84c472efb3169a2667807fe";
  
  const abi = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function totalSupply() view returns (uint256)",
    "function decimals() view returns (uint8)"
  ];

  const provider = ethers.provider;
  const tokenContract = new ethers.Contract(tokenAddress, abi, provider);

  try {
    const name = await tokenContract.name();
    const symbol = await tokenContract.symbol();
    const decimals = await tokenContract.decimals();
    const supply = await tokenContract.totalSupply();

    console.log("------------------------------------");
    console.log(`Token neve: ${name}`);
    console.log(`Token szimbóluma: ${symbol}`);
    console.log(`Összes mennyiség: ${ethers.formatUnits(supply, decimals)} ${symbol}`);
    console.log("------------------------------------");

  } catch (error) {
    console.error("Hiba: Nem sikerült elérni a szerződést.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
