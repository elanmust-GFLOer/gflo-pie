#!/bin/bash
set -e

echo "🟦 Starting GFLO dev environment setup..."

# 1️⃣ Frissítés
sudo apt update && sudo apt upgrade -y

# 2️⃣ Telepítés alapcsomagok
sudo apt install -y curl git build-essential software-properties-common

# 3️⃣ NodeSource Node18 LTS telepítés
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v

# 4️⃣ Globális npm frissítés
sudo npm install -g npm@latest

# 5️⃣ Projekt könyvtár létrehozása
mkdir -p ~/gflo-pie
cd ~/gflo-pie

# 6️⃣ Node modulok init (package.json)
npm init -y

# 7️⃣ Hardhat és kiegészítők telepítése
npm install --save-dev hardhat
npm install --save-dev @nomicfoundation/hardhat-toolbox @nomicfoundation/hardhat-ignition ethers dotenv

# 8️⃣ Hardhat projekt inicializálása (interaktív prompt nélkül)
npx hardhat init --force

# 9️⃣ MNEMONIC és Sepolia setup (.env fájl)
cat <<EOT > .env
MNEMONIC="tedd ide a saját 12 szavas mnemonic-od"
SEPOLIA_RPC_URL="https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID"
EOT

#  🔹 Hardhat config példa
cat <<EOT > hardhat.config.js
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: "0.8.20",
  defaultNetwork: "sepolia",
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL,
      accounts: {
        mnemonic: process.env.MNEMONIC
      }
    }
  }
};
EOT

# 10️⃣ gflo-pie repo klón (ha van github link)
# git clone https://github.com/yourusername/gflo-pie.git .  # uncomment és állítsd be a saját repo-t

# 11️⃣ Compile pipeline teszt
npx hardhat compile

echo "✅ GFLO dev environment ready!"
echo "📃 CD into ~/gflo-pie and run your scripts: npx hardhat run scripts/deploy.js --network sepolia"
