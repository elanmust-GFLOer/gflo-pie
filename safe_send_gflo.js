import { ethers } from "ethers";
import readlineSync from "readline-sync";

async function main() {
  const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");

  // 1. Biztonságos bekérés - a karakterek csillagozva jelennek meg
  const mnemonic = readlineSync.question("Add meg a mnemonic szavakat (hidden): ", {
    hideEchoBack: true 
  });

  if (!mnemonic) {
    console.log("Hiba: A mnemonic nem lehet üres!");
    return;
  }

  try {
    const wallet = ethers.Wallet.fromPhrase(mnemonic, provider);
    console.log(`\nBejelentkezve: ${wallet.address}`);

    const tokenAddress = "0x563b2e3b499818a2f84c472efb3169a2667807fe";
    const abi = [
      "function transfer(address to, uint256 amount) returns (bool)",
      "function decimals() view returns (uint8)",
      "function balanceOf(address) view returns (uint256)"
    ];

    const tokenContract = new ethers.Contract(tokenAddress, abi, wallet);

    // 2. Adatok bekérése az utaláshoz
    const targetAddress = readlineSync.question("Cimzett cime: ");
    const amount = readlineSync.question("Mennyiseget kuldesz (GFLO): ");

    const decimals = await tokenContract.decimals();
    const balance = await tokenContract.balanceOf(wallet.address);
    const amountToUnits = ethers.parseUnits(amount, decimals);

    if (balance < amountToUnits) {
      console.log("Hiba: Nincs elegendo GFLO tokened!");
      return;
    }

    console.log(`\nInditas: ${amount} GFLO -> ${targetAddress}`);
    const confirm = readlineSync.keyInYN("Biztosan elkuldod?");

    if (confirm) {
      const tx = await tokenContract.transfer(targetAddress, amountToUnits);
      console.log(`Tranzakcio elkuldve! Hash: ${tx.hash}`);
      console.log("Varakozas a visszaigazolasra...");
      await tx.wait();
      console.log("Sikeres utalas! Ellenorizheted a Sepolia Etherscan-en.");
    } else {
      console.log("Tranzakcio megszakitva.");
    }

  } catch (error) {
    console.error("\nHiba tortent:", error.message);
  }
}

main();
