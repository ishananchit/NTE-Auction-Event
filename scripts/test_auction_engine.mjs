// Regression tests for app/js/auctionEngine.js — pure logic, no browser needed. Rerun after
// any change to auctionEngine.js / poolStats.js / auctioneerIntel.js:
//   node scripts/test_auction_engine.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(__dirname, "..", "app");

const { createMatch, placeBid, resolveRound, makePlayers, eligiblePlayerIds } = await import(
  pathToFileURL(path.join(appDir, "js", "auctionEngine.js"))
);
const { LOT_MIN_ITEMS, LOT_MAX_ITEMS, OVERPAY_SPILLOVER_RATE } = await import(
  pathToFileURL(path.join(appDir, "js", "config.js"))
);

const pool = JSON.parse(fs.readFileSync(path.join(appDir, "data", "collectibles.json"), "utf-8"));

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error("FAIL:", name);
  }
}

function freshMatch(balance = 2_000_000) {
  const players = makePlayers(4, balance);
  return createMatch(pool, players, { minSize: LOT_MIN_ITEMS, maxSize: LOT_MAX_ITEMS });
}

// --- Test 1: Round 1 instant win when bid clears 2.0x second-highest ---
{
  const m = freshMatch();
  placeBid(m, "p1", 200000);
  placeBid(m, "p2", 100000); // exactly 2.0x -> should win
  resolveRound(m);
  check("T1: round1 2.0x exact clears threshold -> sold", m.status === "sold");
  check("T1: correct winner", m.result?.winnerId === "p1");
  check("T1: correct final sale price", m.result?.finalSalePrice === 200000);
}

// --- Test 2: Round 1 fails to clear threshold -> advances ---
{
  const m = freshMatch();
  placeBid(m, "p1", 150000);
  placeBid(m, "p2", 100000); // 1.5x < 2.0x -> should NOT win
  resolveRound(m);
  check("T2: below threshold -> still bidding", m.status === "bidding");
  check("T2: round advanced to 2", m.round === 2);
  // Auctioneer Intel only fires on the configured rounds (default [1,3,5], see config.js) — round
  // 2 not getting a new entry is correct, not a bug.
  check("T2: log has exactly the round1 intel so far (round2 not in AUCTIONEER_INTEL_ROUNDS)", m.log.length === 1 && m.log[0].round === 1);
}

// --- Test 3: Single bidder (no second bid) auto-wins any positive bid ---
{
  const m = freshMatch();
  placeBid(m, "p1", 1); // trivially small bid, nobody else bid
  resolveRound(m);
  check("T3: sole bidder wins even with tiny bid", m.status === "sold" && m.result.winnerId === "p1");
}

// --- Test 4: Tie in round 1-4 does not end the auction (ratio == 1.0 < threshold) ---
{
  const m = freshMatch();
  placeBid(m, "p1", 100000);
  placeBid(m, "p2", 100000);
  resolveRound(m);
  check("T4: exact tie does not resolve round 1-4", m.status === "bidding" && m.round === 2);
}

// --- Test 5: Round 5 highest-bid-wins, no tie ---
{
  const m = freshMatch();
  m.round = 5;
  placeBid(m, "p1", 500000);
  placeBid(m, "p2", 400000);
  resolveRound(m);
  check("T5: round5 highest wins outright", m.status === "sold" && m.result.winnerId === "p1" && m.result.finalSalePrice === 500000);
}

// --- Test 6: Round 5 tie -> Round 6 tiebreak restricted to tied players ---
{
  const m = freshMatch();
  m.round = 5;
  placeBid(m, "p1", 500000);
  placeBid(m, "p2", 500000);
  placeBid(m, "p3", 100000);
  resolveRound(m);
  check("T6: tie at top -> still bidding, moved to round 6", m.status === "bidding" && m.round === 6);
  check("T6: tiebreak set contains exactly the tied players",
    m.tiebreakPlayerIds && m.tiebreakPlayerIds.length === 2 &&
    m.tiebreakPlayerIds.includes("p1") && m.tiebreakPlayerIds.includes("p2"));
  check("T6: eligiblePlayerIds reflects tiebreak restriction",
    JSON.stringify(eligiblePlayerIds(m).sort()) === JSON.stringify(["p1","p2"]));

  let threw = false;
  try { placeBid(m, "p3", 1000); } catch { threw = true; }
  check("T6: non-tied player rejected from tiebreak round", threw);

  placeBid(m, "p1", 600000);
  placeBid(m, "p2", 550000);
  resolveRound(m);
  check("T6: tiebreak resolves to a winner", m.status === "sold" && m.result.winnerId === "p1" && m.result.finalSalePrice === 600000);
}

// --- Test 7: Round 6 still tied -> unsold ---
{
  const m = freshMatch();
  m.round = 5;
  placeBid(m, "p1", 500000);
  placeBid(m, "p2", 500000);
  resolveRound(m);
  placeBid(m, "p1", 700000);
  placeBid(m, "p2", 700000);
  resolveRound(m);
  check("T7: still tied after round 6 -> unsold", m.status === "unsold");
  check("T7: no winner recorded", m.result.winnerId === null);
}

// --- Test 8: Nobody ever bids -> unsold by round 5, never reaches round 6 ---
{
  const m = freshMatch();
  for (let r = 1; r <= 5; r++) {
    resolveRound(m);
    if (m.status !== "bidding") break;
  }
  check("T8: fully passive match ends unsold", m.status === "unsold");
  check("T8: never touched round 6", m.round <= 5);
}

// --- Test 9: Payout math — positive earnings, no spillover ---
{
  const m = freshMatch(2_000_000);
  const winnerBefore = m.players.find((p) => p.id === "p1").balance;
  placeBid(m, "p1", 1);
  resolveRound(m);
  const earnings = m.result.actualValue - 1;
  const winnerAfter = m.players.find((p) => p.id === "p1").balance;
  check("T9: winner balance += earnings", winnerAfter === winnerBefore + earnings);
  check("T9: earnings positive here (actualValue always > 1)", earnings > 0);
  check("T9: no spillover recorded when earnings positive", Object.keys(m.result.spillover).length === 0);
  for (const p of m.players) {
    if (p.id === "p1") continue;
    check(`T9: non-winner ${p.id} balance unchanged`, p.balance === 2_000_000);
  }
}

// --- Test 10: Payout math — negative earnings, OVERPAY_SPILLOVER_RATE spillover to the other 3 ---
{
  // Balance is sized relative to this specific lot's actualValue (not a fixed guess), so the
  // overpay bid is guaranteed affordable regardless of which items — including the rare
  // extreme-outlier collectibles — happened to land in this random lot.
  const m = freshMatch(1);
  const startBalance = m.lot.actualValue * 10 + 1000;
  for (const p of m.players) p.balance = startBalance;

  const overpay = m.lot.actualValue * 3;
  placeBid(m, "p1", overpay);
  resolveRound(m);
  const earnings = m.result.earnings;
  check("T10: earnings negative", earnings < 0);
  const expectedShare = Math.round(Math.abs(earnings) * OVERPAY_SPILLOVER_RATE);
  for (const p of m.players) {
    if (p.id === "p1") continue;
    check(`T10: ${p.id} got exactly OVERPAY_SPILLOVER_RATE of overpay`, p.balance === startBalance + expectedShare);
    check(`T10: spillover recorded for ${p.id}`, m.result.spillover[p.id] === expectedShare);
  }
  const winner = m.players.find((p) => p.id === "p1");
  check("T10: winner balance reflects negative earnings", winner.balance === startBalance + earnings);
}

// --- Test 11: placeBid validation ---
{
  const m = freshMatch(1000);
  let threw = false;
  try { placeBid(m, "p1", 5000); } catch { threw = true; }
  check("T11: over-balance bid rejected", threw);

  threw = false;
  try { placeBid(m, "p1", -5); } catch { threw = true; }
  check("T11: negative bid rejected", threw);

  threw = false;
  try { placeBid(m, "ghost", 100); } catch { threw = true; }
  check("T11: unknown player rejected", threw);
}

// --- Test 12: full randomized matches always terminate cleanly within 6 rounds ---
{
  let allOk = true;
  for (let trial = 0; trial < 200; trial++) {
    const m = freshMatch(Math.round(500_000 + Math.random() * 5_000_000));
    let guard = 0;
    while (m.status === "bidding" && guard < 10) {
      guard++;
      for (const id of eligiblePlayerIds(m)) {
        const wantsToBid = Math.random() < 0.6;
        const amount = wantsToBid ? Math.round(Math.random() * m.players.find((p) => p.id === id).balance) : 0;
        placeBid(m, id, amount);
      }
      resolveRound(m);
    }
    if (m.status === "bidding" || guard >= 10) { allOk = false; console.error("Match did not terminate:", m.round, m.status); }
    if (m.status === "sold") {
      const expectedEarnings = m.result.actualValue - m.result.finalSalePrice;
      if (m.result.earnings !== expectedEarnings) { allOk = false; console.error("Bad earnings math"); }
    }
  }
  check("T12: 200 randomized matches all terminate within bounds with correct math", allOk);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
