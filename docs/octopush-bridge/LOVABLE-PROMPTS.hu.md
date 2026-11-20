# OctoPush ⇄ GFLO híd — Lovable feladatleírások

Forrás: `docs/DESIGN-005-octopush-bridge.md`. Minden feladat **külön üzenetként** küldendő a
Lovable-nek, ebben a sorrendben: L0 → L1 → L2 → L3 → L4. Mindegyik után ellenőrizd a diffet,
mielőtt a következőt elküldöd.

Közös szabályok, ezek minden üzenet végére odakerülnek:
- Nincs fizetős inference és nincs publikálás. Az éles adatbázist csak a tulajdonos jóváhagyásával módosítod.
- Kulcs, token vagy privát kulcs soha nem kerülhet kódba vagy kliensoldalra, csak szerveroldali titokba.
- Az új táblákhoz a böngésző (`anon`, `authenticated`) semmilyen jogot nem kap.
- Minden új logikához tesztet írsz. A roadmap.md-be pipálható lépéseket veszel fel.

---

## L0 — A Rooms review migráció alkalmazása

```
Alkalmazd a már becommitolt database/migrations/20261115093000_room_task_reviews.sql migrációt,
a tulajdonos jóváhagyásával. Előtte futtasd le a meglévő room-task-review teszteket
(room-task-review.test.ts, room-task-review-db.test.ts) helyi/eldobható adatbázison.
Elfogadás: a Rooms-ban egy megosztott feladat elfogadható / változtatást kérhet; a szerző a sajátját
nem bírálhatja; a "migration_missing" állapot megszűnik. Semmi más nem változik.
```

## L1 — GFLO tárca-kötés (OctoPass)

```
Építs egy "GFLO tárca összekötése" funkciót az OctoPass beállításokba. A meglévő, átnézett
protokollt használd, ne találj ki újat:
1) SIWE (EIP-4361) üzenet a tárca-irányítás bizonyítására (csak EOA; ERC-1271 / smart wallet:
   elutasítás "ERC1271_NOT_SUPPORTED" kóddal).
2) Külön EIP-712 aláírás a hozzájárulásra:
   domain = { name: "OctoPush GFLO Binding", version: "1", chainId: 84532,
              salt: keccak256("gflo:octopush:binding:v1") }  (verifyingContract NINCS)
   type BindingConsent = { principal, profile, wallet, chainId, scopes, generation, nonce,
     challengeId, requestId, siweMessageHash, expiresAt, consentVersion, consentTextDigest }
   scope: "gflo.xp.recipient", consentVersion: "octopush/1".
   A hozzájárulás szövege mondja ki egyértelműen: az elfogadott Rooms-bírálatok nyilvánosan,
   láncon igazolódnak erre a címre; a kötés bármikor visszavonható.
3) Szerver adja a 32 bájtos véletlen nonce-t, 5 perc lejárattal; egy profil + lánc = egy aktív kötés;
   visszavonáskor a "generation/epoch" nő, és minden régebbi kihívás érvénytelen.
   Idegen profil nem fogyaszthatja/vonhatja vissza más kihívását.
Táblák: gflo_wallet_links (profile_id, chain_id, address, scopes, generation, consent_*, created_at,
revoked_at), gflo_wallet_link_challenges. RLS: a felhasználó csak a SAJÁT aktív kötésének
címét olvashatja; írni csak szerverfüggvény ír (service role).
Ellenőrzés viem-mel szerveroldalon (verifyMessage + verifyTypedData), kanonikus 65 bájtos low-s aláírás.
Tesztek: helyes kötés; lejárt nonce; rossz lánc; más profil nonce-a; visszavonás után régi kihívás;
smart wallet elutasítás; dupla aktív kötés tiltása.
```

## L1-javítás — az L1 review-ja után (OctoPush commit `665fdf8`)

Az L1 elkészült (18 teszt, migráció becommitolva, de nem alkalmazva). A review három pontot talált:

```
Kis biztonsági javítás az L1 GFLO tárca-kötéshez (src/lib/gflo-binding.functions.ts és
src/lib/gflo-binding.ts). Csak ezt a hármat csináld, mást ne:
1) SIWE domain és URI fix, konfigurált érték legyen, ne a kérés fejléce. Most a x-forwarded-host /
   host fejlécből jön, octopushhub.com alapértelmezéssel; ezt egy hamisított fejléc felülírhatja.
   Legyen szerveroldali env: GFLO_SIWE_DOMAIN. Ha hiányzik, a kihívás-kérés BINDING_UNAVAILABLE-lel
   álljon le (fail closed), ne essen vissza alapértelmezésre. URI: https://<GFLO_SIWE_DOMAIN>/octopass.
   Megerősítéskor ellenőrizd, hogy a tárolt SIWE-üzenet domainje és URI-je egyezik a konfigurálttal.
2) Rate limit a createGfloChallenge hívásra a meglévő src/lib/rate-limit.server.ts mintájára
   (profilonként legfeljebb 5 kihívás / 10 perc). Túllépéskor RATE_LIMITED kód.
3) Nonce-kódolás a meglévő protokoll szerint: a SIWE-üzenetben 0x előtag NÉLKÜLI hex (64 karakter),
   a BindingConsent-ben ugyanaz a 32 bájt 0x előtaggal. Az adatbázisban tárolt bájtok ne változzanak.
Tesztek: hamis Host fejléc nem kerül az üzenetbe; hiányzó GFLO_SIWE_DOMAIN → BINDING_UNAVAILABLE;
a 6. kihívás 10 percen belül → RATE_LIMITED; a SIWE-nonce 0x nélküli, a hozzájárulásé 0x-szel, és
ugyanaz a bájtsor. A meglévő 18 tesztnek továbbra is át kell mennie.
Nincs fizetős inference, nincs publikálás, a migrációt ne alkalmazd. A roadmap.md L1 részébe vedd fel.
```

## L2 — Review outbox, jogosultság és kibocsátói aláírás

```
Amikor egy room_task_reviews sor "accepted" döntéssel jön létre, UGYANABBAN a tranzakcióban
(review_room_task függvényben vagy AFTER INSERT triggerben) hozz létre egy sort a
gflo_review_outbox táblában. A "changes_requested" döntés nem hoz létre semmit.
Oszlopok: id, review_id UNIQUE, room_message_id, content_fingerprint, version, author_id,
reviewer_id, author_wallet, reviewer_wallet, room_visibility, status, ineligible_reason,
issuer_signature, lease_until, attempts, attestation_uid, tx_hash, reject_reason, created_at, updated_at.
status: ready | ineligible | leased | attested | rejected | failed.
Jogosultság beszúráskor (ha nem teljesül: status = ineligible + ok):
  - a szoba láthatósága "open" (ellenőrizd a valódi oszlopnevet) → különben room_not_open
  - a szerzőnek és a bírálónak is van aktív gflo.xp.recipient kötése → author_wallet_missing /
    reviewer_wallet_missing
  - ugyanaz a bíráló → ugyanaz a szerző: legfeljebb 3 "ready" vagy "attested" sor 7 nap alatt → pair_cap
RLS bekapcsolva, policy NINCS: a böngésző semmit nem lát és nem ír; csak service_role.
"ready" soroknál a szerver EIP-712 aláírást készít a GFLO_ISSUER_PRIVATE_KEY titokkal:
  domain = { name: "OctoPush GFLO Issuer", version: "1", chainId: 84532 }
  OctoPushReviewEvent(bytes32 reviewId, bytes32 roomMessageId, bytes32 contentFingerprint,
    string version, address author, address reviewer, uint64 reviewedAt)
  ahol reviewId/roomMessageId = keccak256(az uuid UTF-8 szövege), contentFingerprint = 0x + a tárolt hex.
Az aláírás az issuer_signature mezőbe kerül. Általános "írd alá ezt" végpont NEM készülhet.
Tesztek: elfogadott bírálat → ready + aláírás; changes_requested → nincs sor; zárt szoba → ineligible;
hiányzó tárca → ineligible; 4. bírálat ugyanattól a bírálótól ugyanannak a szerzőnek 7 napon belül
→ pair_cap; böngésző szerepkör nem olvashatja a táblát; a review és az outbox atomikusan jön létre.
```

## L3 — Híd API (szerver útvonalak)

```
Készíts két szerver útvonalat a GFLO híd számára. Böngészőből nem használhatók.
Hitelesítés: "Authorization: Bearer <GFLO_BRIDGE_TOKEN>", konstans idejű összehasonlítással, rate limittel.
1) POST /api/gflo/outbox/lease  body: { limit ≤ 20 }
   → "ready" vagy lejárt bérletű "leased" sorok, FOR UPDATE SKIP LOCKED, status = leased,
   lease_until = now + 5 perc, attempts++. Válasz: az esemény mezői + issuer_signature.
2) POST /api/gflo/outbox/{id}/result  body: { status: attested|rejected|failed,
   attestationUid?, txHash?, reason? }
   Idempotens: ugyanaz a jelentés másodszor no-op; ellentmondó jelentés 409.
Tesztek: rossz/hiányzó token → 401; két párhuzamos lease nem kapja meg ugyanazt a sort;
lejárt bérlet újra kiadható; idempotens és ütköző eredmény-jelentés; nem létező id → 404.
```

## L4 — Kiérdemelt csomag (olvasás és megjelenítés)

```
Szerverfüggvény: getEarnedPlan(userId).
- Ha van aktív gflo.xp.recipient kötés: EffectiveTierGateV01.effectiveTier(wallet) olvasása viem-mel
  Base Sepolia RPC-n. A cím szerveroldali env: GFLO_CHAIN_ID, GFLO_EFFECTIVE_TIER_GATE.
  Alapértelmezett cím NINCS; ezek a régi v3 címek tiltottak (kis/nagybetűtől függetlenül):
  0x9CF55d0b9D61Dc28EF3cb10765CF4b861Cd0991e, 0x414DEDcf9264614Fd087BDa58bE27a0B698CcC54,
  0xd2C926F67080D6315b5dbBc7D621d729Cfe8A9C7, 0x563b2e3b499818a2f84c472efb3169a2667807fe.
- tier 0 → free, 1 → builder, 2 → orchestrator. BÁRMILYEN hiba vagy hiányzó env → free +
  status "unavailable" (sosem ad magasabbat hibából). Gyorsítótár legfeljebb 10 perc.
- effectivePlan = max(paidPlan, earnedPlan); fizetés még nincs, így ma ez a kiérdemelt csomag.
UI: a /pricing oldalon a megfelelő kártyán "Kiérdemelve a GFLO-n keresztül" jelzés; az OctoPass
profilon a jelenlegi Path (Sovereign / Reformer / Praxis) és egy mondat: "A kiérdemelt csomag az
aktuális szintet követi; ha a szint csökken, a csomag is."
Kreditet NEM ad (az egy későbbi lépés). Funkció-kapcsoló: GFLO_EARNED_PLANS=off alapból.
Tesztek: tier 0/1/2 leképezés; RPC hiba → free/unavailable; tiltott v3 cím → free/unavailable;
hiányzó env → free/unavailable; paidPlan > earnedPlan esetén a paid nyer.
```
