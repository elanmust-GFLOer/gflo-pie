# PIE v0.2 → Sepolia telepítés

A kanonikus v0.2 vonal telepítése: `PIECoreIgnitionV01`, `XPPolicyV03`, `TrustedXPSourceRegistryV02`,
`GFLOFixedSupplyV01`, `GFLOIgnitionV01`, `EffectiveTierGateV01`. A szkript össze is köti őket,
ellenőrzi az eredményt, és előkészíti az Etherscan-verifikációt.

**Rögzített paraméterek (2026-11-03):** 1 000 000 000 GFLO fix készlet (utólag nincs mint),
Reformer-égetés 5 000 GFLO, Praxis-égetés 10 000 GFLO. Fordító: solc `0.8.34`, optimizer 200, evm `cancun`.

## Futtatás (Termux)

```sh
cd gflo-pie/deploy-v02
npm ci
node deploy.mjs
```

A szkript kéri:
1. **Mnemonic**: rejtett bekérés, nem kerül fájlba és nem megy sehová, csak az RPC-re aláírt tranzakció.
2. **Owner / governance cím**: lásd lent. Enter = a deployer címe.
3. Megerősítés: `IGEN`.

Szükséges: kb. 0.01–0.03 Sepolia ETH a deployer címen. Ha a futás megszakad, futtasd újra:
a már kész lépéseket átugorja (`deployments/sepolia-v02.json`).

## Owner: deployer vagy Safe?

- **Deployer** = a saját tárcacímed (a mnemonicodból), ami a régi szerződéseket is telepítette (`0xF80a…`).
  Ez nem okosszerződés. A GFLO token egy külön szerződés.
- **Safe** = többaláírásos tárca-szerződés (pl. 3 kulcsból 2 kell). A tesztek és a doksik ezt feltételezik.
  Létrehozás: app.safe.global → Sepolia → 3 owner, threshold 2. A kapott Safe-címet add meg ownerként.

Az `XPPolicyV03` ownerje **végleges**. Ő regisztrál szabályokat, attestorokat, és ő vonhat vissza XP-t.
A teljes GFLO készlet is az ownerhez kerül. Safe esetén a szkript a Registry governance-ét felajánlja a Safe-nek;
ezt a Safe-ből egy `acceptGovernance()` hívással kell elfogadni.

## Verifikáció

```sh
ETHERSCAN_API_KEY=... node verify.mjs
```

API-kulcs nélkül az `out/verify/` mappába írja a webes űrlaphoz szükséges adatokat
(Solidity Standard-Json-Input, contract name, constructor args).

## Telepítés után

- Commitold a `deployments/sepolia-v02.json` fájlt (csak címek és tx-hashek, titok nincs benne).
- Frissítsd a gyökér `deployed_addresses.json` `v02` részét.
- Az XP-szabályok, verifier és attestor beállítása (`registerRule`, `setVerifierRole`, `setAttestor`)
  külön, owner-oldali lépés; a telepítő szándékosan nem végzi el.

Helyi próbafuttatás (Hardhat node, chainId 31337):
`RPC_URL=http://127.0.0.1:8545 EXPECT_CHAIN_ID=31337 PRIVATE_KEY=<teszt kulcs> node deploy.mjs`
