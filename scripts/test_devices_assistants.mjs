// Regression tests for devices/assistants/intel (Stage 3), including the private-vs-public
// reveal split (§8 "information privacy"). Run with:
//   node scripts/test_devices_assistants.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(__dirname, "..", "app");
const j = (p) => pathToFileURL(path.join(appDir, "js", p));

const { createMatch, makePlayers, useDevice, resolveRound, placeBid, eligiblePlayerIds, currentEstimate } = await import(j("auctionEngine.js"));
const { DEVICE_DEFINITIONS, DEVICE_SETS, instantiateDevices } = await import(j("deviceCatalog.js"));
const { ASSISTANTS, findAssistant } = await import(j("assistantCatalog.js"));
const { EFFECT_HANDLERS } = await import(j("effects.js"));
const { effectiveReveal, omniscientReveal } = await import(j("revealAccess.js"));
const { generateAuctioneerIntel } = await import(j("auctioneerIntel.js"));
const { generateLot } = await import(j("lotGenerator.js"));
const { LOT_MIN_ITEMS, LOT_MAX_ITEMS } = await import(j("config.js"));

const pool = JSON.parse(fs.readFileSync(path.join(appDir, "data", "collectibles.json"), "utf-8"));

let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) passed++;
  else { failed++; console.error("FAIL:", name); }
}

function freshMatch(assistantAssignments = {}, balance = 10_000_000) {
  const players = makePlayers(4, balance);
  for (const [idx, assistantName] of Object.entries(assistantAssignments)) {
    players[idx].assistant = findAssistant(assistantName);
  }
  return createMatch(pool, players, { minSize: LOT_MIN_ITEMS, maxSize: LOT_MAX_ITEMS });
}

function knownTo(lot, playerId, flag) {
  return lot.items.filter((it) => effectiveReveal(it, playerId)[flag]);
}

// --- Catalog integrity ---
{
  let allTypesValid = true;
  for (const [name, def] of Object.entries(DEVICE_DEFINITIONS)) {
    if (!EFFECT_HANDLERS[def.effectType]) { allTypesValid = false; console.error("Bad effectType for", name, def.effectType); }
  }
  check("Catalog: every device's effectType exists in EFFECT_HANDLERS", allTypesValid);

  let allNamesResolve = true;
  for (const set of DEVICE_SETS) {
    for (const deviceName of set.devices) {
      if (!DEVICE_DEFINITIONS[deviceName]) { allNamesResolve = false; console.error("Missing definition for", deviceName, "in", set.name); }
    }
  }
  check("Catalog: every DEVICE_SETS device name resolves to a DEVICE_DEFINITIONS entry", allNamesResolve);
  check("Catalog: 17 device sets", DEVICE_SETS.length === 17);
  check("Catalog: 8 assistants", ASSISTANTS.length === 8);
}

// --- instantiateDevices ---
{
  const devices = instantiateDevices(["Basic General-Purpose Device Set"]);
  check("instantiateDevices: correct count", devices.length === 3);
  check("instantiateDevices: all unused", devices.every((d) => d.used === false));
  check("instantiateDevices: unique ids", new Set(devices.map((d) => d.id)).size === 3);

  const twoSets = instantiateDevices(["Basic General-Purpose Device Set", "Basic Data Device Set"]);
  check("instantiateDevices: combines multiple sets", twoSets.length === 7);
}

// --- useDevice: private to the owner, invisible to everyone else ---
{
  const m = freshMatch();
  m.players[0].devices = instantiateDevices(["Basic General-Purpose Device Set"]);
  const evalDevice = m.players[0].devices.find((d) => d.name === "Micro Evaluation Device");

  const p1BeforeKnown = knownTo(m.lot, "p1", "rarityKnown").length;
  const p2BeforeKnown = knownTo(m.lot, "p2", "rarityKnown").length;
  useDevice(m, "p1", evalDevice.id);
  const p1AfterKnown = knownTo(m.lot, "p1", "rarityKnown").length;
  const p2AfterKnown = knownTo(m.lot, "p2", "rarityKnown").length;

  check("useDevice: revealed up to 2 rarities to the owner", p1AfterKnown - p1BeforeKnown > 0 && p1AfterKnown - p1BeforeKnown <= 2);
  check("useDevice: reveals nothing to a different player", p2AfterKnown === p2BeforeKnown);
  check("useDevice: marks device used", evalDevice.used === true);
  check("useDevice: logs to the owner's PRIVATE log, not the shared one", m.privateLogs.p1.some((e) => e.kind === "deviceUse" && e.deviceName === "Micro Evaluation Device"));
  check("useDevice: does NOT appear in the shared public log", !m.log.some((e) => e.kind === "deviceUse"));

  let threw = false;
  try { useDevice(m, "p1", evalDevice.id); } catch { threw = true; }
  check("useDevice: rejects reuse of an already-used device", threw);

  threw = false;
  try { useDevice(m, "p1", "not-a-real-id"); } catch { threw = true; }
  check("useDevice: rejects unknown device id", threw);
}

// --- Category-filtered device with no matching category data (known current limitation) ---
{
  const m = freshMatch();
  m.players[0].devices = instantiateDevices(["Antique Device Set"]);
  const antiqueDevice = m.players[0].devices.find((d) => d.name === "Antique Evaluation Device");
  let threw = false;
  try {
    useDevice(m, "p1", antiqueDevice.id);
  } catch {
    threw = true;
  }
  check("useDevice: category-filtered device with 0 matches doesn't throw", !threw);
  const logEntry = m.privateLogs.p1.find((e) => e.deviceName === "Antique Evaluation Device");
  check("useDevice: category-filtered device logs 0 collectibles", logEntry && logEntry.text.includes("0 collectible"));
}

// --- Assistant: private to the owner, invisible to everyone else, logged privately ---
{
  const m = freshMatch({ 0: "Haniel" });
  const p1BothKnown = m.lot.items.filter((it) => {
    const r = effectiveReveal(it, "p1");
    return r.rarityKnown && r.shapeKnown;
  }).length;
  const p2BothKnown = m.lot.items.filter((it) => {
    const r = effectiveReveal(it, "p2");
    return r.rarityKnown && r.shapeKnown;
  }).length;
  check("Haniel round1: exactly 5 items known to the owner (p1)", p1BothKnown === 5);
  check("Haniel round1: none of that is visible to a non-owner (p2)", p2BothKnown === 0);
  check("Haniel round1: logged in p1's PRIVATE log with correct attribution", m.privateLogs.p1.some((e) => e.kind === "assistantReveal" && e.assistantName === "Haniel"));
  check("Haniel round1: nothing about it in the shared public log", !m.log.some((e) => e.kind === "assistantReveal"));
}

// --- Assistant text now names the rarity for byRarity-selection effects (fixes the ambiguous "duplicate-looking" log lines) ---
{
  const m = freshMatch({ 0: "Adler" });
  const round1Entries = m.privateLogs.p1.filter((e) => e.round === 1);
  const mentionsRarity = round1Entries.length > 0 && round1Entries.every((e) => /White-rarity/.test(e.text));
  check("Adler round1 log text explicitly names the targeted rarity (White)", mentionsRarity);
}

// --- Assistant: Adler (round1: White rarity gets both flags, for the owner only; others untouched) ---
{
  const m = freshMatch({ 0: "Adler" });
  const whiteUntouched = m.lot.items.filter((it) => {
    const r = effectiveReveal(it, "p1");
    return it.rarity === "White" && (!r.rarityKnown || !r.shapeKnown);
  });
  check("Adler round1: every White item fully flagged for the owner", whiteUntouched.length === 0);
  const nonWhiteBothFlagsForOwner = m.lot.items.filter((it) => {
    const r = effectiveReveal(it, "p1");
    return it.rarity !== "White" && r.rarityKnown && r.shapeKnown;
  });
  check("Adler round1: no non-White item got both flags (Adler's signature) for the owner", nonWhiteBothFlagsForOwner.length === 0);
}

// --- Assistant: Hathor (round5: ALL items get rarityKnown, for the owner only) ---
{
  const m = freshMatch({ 0: "Hathor" });
  let guard = 0;
  while (m.status === "bidding" && m.round < 5 && guard < 10) {
    resolveRound(m);
    guard++;
  }
  check("Hathor: reached round 5", m.round === 5 || m.status !== "bidding");
  if (m.round === 5) {
    const allKnownToOwner = m.lot.items.every((it) => effectiveReveal(it, "p1").rarityKnown);
    // Note: driving through rounds 1/3/5 also rolls Auctioneer Intel each time, which can
    // *publicly* reveal a couple of items' rarity to everyone — that's expected and unrelated
    // to Hathor. What must NOT happen is Hathor's private reveal leaking to a non-owner, i.e.
    // p2's effective view should never exceed what's already public.
    const noPrivateLeakToOthers = m.lot.items.every((it) => effectiveReveal(it, "p2").rarityKnown === it.publicReveal.rarityKnown);
    check("Hathor round5: every item's rarity revealed to the owner", allKnownToOwner);
    check("Hathor round5: no private leakage to a non-owner beyond what's already public", noPrivateLeakToOthers);
  } else {
    check("Hathor round5: (match ended before round5 unexpectedly)", false);
  }
}

// --- Assistant: Chiz (round1 remembers 8, round3 fully reveals the SAME 8, private to owner) ---
{
  const m = freshMatch({ 0: "Chiz" });
  const chizBatch = [...(m.assistantMemory.p1.chizBatch || [])].sort();
  check("Chiz round1: remembered exactly 8 items", chizBatch.length === 8);
  check(
    "Chiz round1: all 8 remembered items are shape-known to the owner",
    chizBatch.every((id) => effectiveReveal(m.lot.items.find((it) => it.instanceId === id), "p1").shapeKnown)
  );

  resolveRound(m); // round1 -> round2
  resolveRound(m); // round2 -> round3
  check("Chiz: reached round 3", m.round === 3);

  const fullyRevealedToOwner = m.lot.items.filter((it) => effectiveReveal(it, "p1").fullyRevealed).map((it) => it.instanceId).sort();
  const fullyRevealedToOther = m.lot.items.filter((it) => effectiveReveal(it, "p2").fullyRevealed);
  check("Chiz round3: exactly 8 items fully revealed to the owner", fullyRevealedToOwner.length === 8);
  check("Chiz round3: the SAME 8 items as round1's remembered batch", JSON.stringify(fullyRevealedToOwner) === JSON.stringify(chizBatch));
  check("Chiz round3: nothing fully revealed to a non-owner", fullyRevealedToOther.length === 0);
}

// --- Current Estimate is per-player ---
{
  const m = freshMatch({ 0: "Haniel" });
  const p1Estimate = currentEstimate(m, "p1");
  const p2Estimate = currentEstimate(m, "p2");
  check("Current Estimate: owner's estimate is higher than a non-owner's after a private reveal", p1Estimate > p2Estimate);
}

// --- Omniscient view sees both public and all private reveals (debug tool only) ---
{
  const m = freshMatch({ 0: "Haniel" });
  const anyPrivateVisible = m.lot.items.some((it) => omniscientReveal(it).rarityKnown || omniscientReveal(it).shapeKnown);
  check("omniscientReveal: sees Haniel's private reveals even though no player 'owns' the debug view", anyPrivateVisible);
}

// --- New Auctioneer Intel reveal-cards fire, mutate PUBLIC state, and are visible to everyone ---
{
  let revealingSamples = 0;
  const trials = 300;
  for (let i = 0; i < trials; i++) {
    const lot = generateLot(pool, { minSize: LOT_MIN_ITEMS, maxSize: LOT_MAX_ITEMS });
    generateAuctioneerIntel(lot, 1);
    if (lot.items.some((it) => it.publicReveal.rarityKnown || it.publicReveal.shapeKnown)) revealingSamples++;
  }
  const fraction = revealingSamples / trials;
  check(`Auctioneer Intel: reveal-type cards fire a healthy fraction of the time and hit publicReveal (got ${(fraction * 100).toFixed(0)}%, expect roughly 40%)`, fraction > 0.2 && fraction < 0.6);

  // And confirm it's visible identically to every player via effectiveReveal too.
  const m = freshMatch();
  const publicHits = m.lot.items.filter((it) => it.publicReveal.rarityKnown || it.publicReveal.shapeKnown);
  if (publicHits.length > 0) {
    const item = publicHits[0];
    const visibleToAll = ["p1", "p2", "p3", "p4"].every((pid) => {
      const r = effectiveReveal(item, pid);
      return r.rarityKnown === item.publicReveal.rarityKnown && r.shapeKnown === item.publicReveal.shapeKnown;
    });
    check("Public Auctioneer Intel reveal is visible identically to all 4 players", visibleToAll);
  }
}

// --- Full randomized matches with random assistants/devices for all 4 players never crash ---
{
  let allOk = true;
  const setNames = DEVICE_SETS.map((s) => s.name);
  for (let trial = 0; trial < 60; trial++) {
    const players = makePlayers(4, 10_000_000);
    for (const p of players) {
      p.assistant = ASSISTANTS[Math.floor(Math.random() * ASSISTANTS.length)];
      const someSets = setNames.filter(() => Math.random() < 0.3);
      p.devices = instantiateDevices(someSets);
    }
    try {
      const m = createMatch(pool, players, { minSize: LOT_MIN_ITEMS, maxSize: LOT_MAX_ITEMS });
      let guard = 0;
      while (m.status === "bidding" && guard < 10) {
        guard++;
        for (const id of eligiblePlayerIds(m)) {
          const player = m.players.find((p) => p.id === id);
          const unused = (player.devices || []).filter((d) => !d.used);
          if (unused.length && Math.random() < 0.5) {
            useDevice(m, id, unused[Math.floor(Math.random() * unused.length)].id);
          }
          const bid = Math.random() < 0.5 ? Math.round(Math.random() * player.balance) : 0;
          placeBid(m, id, bid);
        }
        resolveRound(m);
      }
      if (m.status === "bidding") { allOk = false; console.error("Match never terminated"); }
    } catch (e) {
      allOk = false;
      console.error("Crash in randomized full-feature match:", e.message);
    }
  }
  check("60 randomized matches with random assistants+devices for all players never crash", allOk);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
