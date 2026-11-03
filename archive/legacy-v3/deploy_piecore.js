import { ethers } from "ethers";
import fs from "fs";
import readlineSync from "readline-sync";

async function main() {
    const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");
    
    const mnemonic = readlineSync.question("Mnemonic: ", { hideEchoBack: true });
    const wallet = ethers.Wallet.fromPhrase(mnemonic, provider);
    console.log(`Telepítő tárca: ${wallet.address}`);

    // Fájlnevek beolvasása (a solcjs generálta őket)
    const abi = JSON.parse(fs.readFileSync("./contracts_PIECore_sol_PIECore.abi", "utf8"));
    const binary = fs.readFileSync("./contracts_PIECore_sol_PIECore.bin", "utf8");

    // A GFLO tokened címe a Sepolián
    const gfloAddress = "0x563b2e3b499818a2f84c472efb3169a2667807fe";

    console.log("PIECore telepítése folyamatban...");
    const factory = new ethers.ContractFactory(abi, binary, wallet);
    
    // Itt adjuk át a GFLO címet a constructor-nak
    const contract = await factory.deploy(gfloAddress);
    
    console.log(`Várakozás a bányászatra...`);
    await contract.waitForDeployment();

    const address = await contract.getAddress();
    console.log(`\nSIKER! PIECore telepítve ide: ${address}`);
    console.log(`Összekapcsolva a GFLO-val: ${gfloAddress}`);
}

main().catch((error) => {
    console.error(error);
});
