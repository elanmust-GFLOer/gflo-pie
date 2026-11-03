import { ethers } from "ethers";
import readlineSync from "readline-sync";
import fs from "fs";

async function main() {
  console.log("=== GFLO TERMINAL WALLET & IDENTITY (Sepolia) ===");
  
  const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");
  const tokenAddress = "0x563b2e3b499818a2f84c472efb3169a2667807fe";
  const pieCoreAddress = "0xDa3BdF42006a2d90E14aB58a202C6bedBB6865ba";

  const tokenAbi = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)"
  ];
  
  const pieCoreAbi = JSON.parse(fs.readFileSync("./contracts_PIECore_sol_PIECore.abi", "utf8"));

  const mnemonic = readlineSync.question("Mnemonic szavak (hidden): ", { hideEchoBack: true });
  if (!mnemonic) return console.log("Hiba: Mnemonic szukseges!");

  try {
    const wallet = ethers.Wallet.fromPhrase(mnemonic, provider);
    const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, wallet);
    const pieContract = new ethers.Contract(pieCoreAddress, pieCoreAbi, wallet);

    const decimals = await tokenContract.decimals();
    const symbol = await tokenContract.symbol();

    let exit = false;
    while (!exit) {
      console.log(`\n--- MENU (Tarca: ${wallet.address.slice(0,6)}...${wallet.address.slice(-4)}) ---`);
      const options = [
        'Egyenlegem & XP',                // 0
        'Ut Valasztas (Choose Path)',     // 1
        'PIECore Jovahagyas (Approve)',   // 2
        'Upgrade to Reformer (Burn 5000)',// 3
        'Upgrade to Praxis (Burn 10000)', // 4
        'XP Szerzese (Teszt)',            // 5
        'Token kuldes',                   // 6
        'Kilepes'                         // 7
      ];
      
      const index = readlineSync.keyInSelect(options, 'Valassz funkciot:');

      if (index === 0) { // Egyenleg és XP
        const bal = await tokenContract.balanceOf(wallet.address);
        const id = await pieContract.identities(wallet.address);
        const pathNames = ["None", "Sovereign", "Reformer", "Praxis"];
        console.log(`\nEgyenleg: ${ethers.formatUnits(bal, decimals)} ${symbol}`);
        console.log(`XP: ${id.xp.toString()}`);
        console.log(`Aktualis Ut: ${pathNames[id.path]}`);
      }
      else if (index === 1) { // Path választás
        console.log("\n1: Sovereign, 2: Reformer, 3: Praxis");
        const pathChoice = readlineSync.questionInt("Valassz utat (szam): ");
        const tx = await pieContract.choosePath(pathChoice);
        console.log("Ut valasztasa folyamatban...");
        await tx.wait();
        console.log("Sikeres ut valasztas!");
      }
      else if (index === 2) { // Approve
        console.log(`\nJovahagyas (25k GFLO) folyamatban...`);
        const tx = await tokenContract.approve(pieCoreAddress, ethers.parseUnits("25000", decimals));
        await tx.wait();
        console.log("Sikeres jovahagyas!");
      }
      else if (index === 3) { // Upgrade to Reformer
        console.log("Reformer szintlepes inditasa...");
        const tx = await pieContract.upgradeToReformer();
        await tx.wait();
        console.log("Gratulalok! Reformer vagy.");
      }
      else if (index === 4) { // Upgrade to Praxis
        console.log("Praxis felemelkedes inditasa...");
        const tx = await pieContract.upgradeToPraxis();
        await tx.wait();
        console.log("Gratulalok! Elerted a PRAXIS szintet.");
      }
      else if (index === 5) { // XP Szerzése
        const amount = readlineSync.questionInt("Mennyi XP-t adsz magadnak? ");
        const tx = await pieContract.gainXP(amount);
        console.log("XP jovairasa...");
        await tx.wait();
        console.log(`Sikeresen kaptal ${amount} XP-t!`);
      }
      else if (index === 6) { // Küldés
        const target = readlineSync.question("Cimzett: ");
        const amount = readlineSync.question("Mennyiseg: ");
        const tx = await tokenContract.transfer(target, ethers.parseUnits(amount, decimals));
        await tx.wait();
        console.log("Sikeres utalas!");
      }
      else { exit = true; }
    }
  } catch (err) { 
    console.error("\nHiba tortent:");
    console.error("Uzenet:", err.reason || err.message);
  }
}
main();



