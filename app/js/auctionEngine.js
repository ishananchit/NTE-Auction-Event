// Core round/bidding/resolution logic (§3, §4, §7). Deliberately UI-independent and driven
// entirely by explicit calls (no timers, no DOM) so it can be unit-tested directly and reused
// by any front-end (hotseat UI now, networked UI later).

import { generateLot } from "./lotGenerator.js";
import { computePoolStats, computeCurrentEstimate } from "./poolStats.js";
import { generateAuctioneerIntel } from "./auctioneerIntel.js";
import { fireEffect } from "./effects.js";
import { privateRevealTarget } from "./revealAccess.js";
import { STARTING_BALANCE, AUCTIONEER_INTEL_ROUNDS, OVERPAY_SPILLOVER_RATE, ROUND_THRESHOLDS } from "./config.js";

export function makePlayers(count = 4, startingBalance = STARTING_BALANCE) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    balance: startingBalance,
    isBot: i > 0, // Player 1 human by default, rest bots — flip via UI toggle.
    assistant: null, // {name, skillName, schedule} from assistantCatalog.js — set by the caller/UI setup step, not here.
    devices: [], // instantiateDevices() output from deviceCatalog.js — set by the caller/UI setup step, not here.
  }));
}

export function createMatch(pool, players, lotOpts) {
  const lot = generateLot(pool, lotOpts);
  const match = {
    lot,
    players,
    poolStats: computePoolStats(pool),
    round: 1,
    bids: {}, // bids[round][playerId] = amount (0 means passed)
    tiebreakPlayerIds: null,
    log: [], // PUBLIC entries only (Auctioneer Intel) — visible to everyone.
    privateLogs: {}, // privateLogs[playerId] — that player's own Assistant/Device reveals, nobody else's (§8 "information privacy")
    status: "bidding", // "bidding" | "sold" | "unsold"
    result: null,
    assistantMemory: {}, // per-player remember/recall store for effects like Chiz's (see effects.js)
  };
  for (const player of players) {
    match.assistantMemory[player.id] = {};
    match.privateLogs[player.id] = [];
  }

  if (AUCTIONEER_INTEL_ROUNDS.includes(1)) match.log.push(generateAuctioneerIntel(lot, 1));
  for (const player of players) fireAssistantSchedule(match, player, 1);
  return match;
}

function fireAssistantSchedule(match, player, round) {
  if (!player.assistant) return;
  const entries = player.assistant.schedule.filter((e) => e.round === round);
  for (const entry of entries) {
    const memory = match.assistantMemory[player.id];
    const { text } = fireEffect(match.lot, entry.effectType, entry.params, memory, privateRevealTarget(player.id));
    match.privateLogs[player.id].push({
      round,
      kind: "assistantReveal",
      playerId: player.id,
      playerName: player.name,
      assistantName: player.assistant.name,
      skillName: player.assistant.skillName,
      text,
    });
  }
}

/**
 * Trigger one of a player's owned devices (single-use — each device can only ever be used
 * once per match, but can be used during any round, not just the round it was "meant" for).
 * Like Assistant reveals, the result is private to this player only (§8).
 */
export function useDevice(match, playerId, deviceId) {
  if (match.status !== "bidding") throw new Error("Match has already ended.");
  const player = match.players.find((p) => p.id === playerId);
  if (!player) throw new Error(`Unknown player: ${playerId}`);
  const device = (player.devices || []).find((d) => d.id === deviceId);
  if (!device) throw new Error("Unknown device.");
  if (device.used) throw new Error(`${device.name} has already been used.`);
  const usedThisRound = (match.privateLogs[player.id] || []).some(
    (e) => e.kind === "deviceUse" && e.round === match.round
  );
  if (usedThisRound) throw new Error("Only one device can be used per round.");

  const { text } = fireEffect(match.lot, device.effectType, device.params, {}, privateRevealTarget(playerId));
  device.used = true;
  match.privateLogs[player.id].push({
    round: match.round,
    kind: "deviceUse",
    playerId: player.id,
    playerName: player.name,
    deviceName: device.name,
    text,
  });
  return match;
}

/** Current Estimate as `playerId` specifically sees it (private reveals are per-player — see §8). */
export function currentEstimate(match, playerId) {
  return computeCurrentEstimate(match.lot, match.poolStats, playerId);
}

export function eligiblePlayerIds(match) {
  if (match.round === 6 && match.tiebreakPlayerIds) return match.tiebreakPlayerIds;
  return match.players.map((p) => p.id);
}

export function allEligiblePlayersActed(match) {
  const roundBids = match.bids[match.round] || {};
  return eligiblePlayerIds(match).every((id) => Object.hasOwn(roundBids, id));
}

/**
 * Record a player's action for the current round. amount 0/null/undefined = Pass.
 * Throws on an invalid actor or an over-balance bid — callers (UI/bots) should validate
 * against player.balance themselves for a nicer error, but this is the hard backstop.
 */
export function placeBid(match, playerId, amount) {
  if (match.status !== "bidding") throw new Error("Match has already ended.");
  const player = match.players.find((p) => p.id === playerId);
  if (!player) throw new Error(`Unknown player: ${playerId}`);
  if (!eligiblePlayerIds(match).includes(playerId)) {
    throw new Error(`${player.name} is not eligible to act in the Round 6 tiebreak.`);
  }
  const bid = amount || 0;
  if (bid < 0) throw new Error("Bid cannot be negative.");
  if (bid > player.balance) throw new Error(`Bid exceeds ${player.name}'s balance.`);

  match.bids[match.round] = match.bids[match.round] || {};
  match.bids[match.round][playerId] = bid;
  return match;
}

/** Ranked, filtered-to-real-bids view of the current round's bids. */
function rankedBids(match) {
  const roundBids = match.bids[match.round] || {};
  return eligiblePlayerIds(match)
    .map((id) => ({ id, amount: roundBids[id] || 0 }))
    .filter((e) => e.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Resolve the current round given whatever bids have been submitted (unsubmitted players are
 * treated as having passed). Either ends the match (sold/unsold) or advances to the next round.
 */
export function resolveRound(match) {
  if (match.status !== "bidding") throw new Error("Match has already ended.");
  const round = match.round;
  const entries = rankedBids(match);

  if (round <= 4) {
    if (entries.length >= 1) {
      const [top, second] = entries;
      const threshold = ROUND_THRESHOLDS[round];
      // No second bidder this round -> second defaults to 0 -> any positive bid trivially clears
      // the threshold (nobody contested it), matching real-auction intuition.
      if (top.amount >= threshold * (second ? second.amount : 0)) {
        return endMatchSold(match, top.id, top.amount);
      }
    }
    advanceRound(match);
    return match;
  }

  if (round === 5) {
    if (entries.length === 0) return endMatchUnsold(match);
    const [top] = entries;
    const tiedForTop = entries.filter((e) => e.amount === top.amount);
    if (tiedForTop.length === 1) return endMatchSold(match, top.id, top.amount);
    match.tiebreakPlayerIds = tiedForTop.map((e) => e.id);
    match.round = 6; // no new Auctioneer Intel for the tiebreak round — it's a special case, not a normal info round.
    return match;
  }

  // round === 6 (tiebreak)
  if (entries.length === 0) return endMatchUnsold(match);
  const [top] = entries;
  const tiedForTop = entries.filter((e) => e.amount === top.amount);
  if (tiedForTop.length === 1) return endMatchSold(match, top.id, top.amount);
  return endMatchUnsold(match); // still tied after the tiebreak round -> lot goes unsold.
}

function advanceRound(match) {
  match.round += 1;
  if (AUCTIONEER_INTEL_ROUNDS.includes(match.round)) {
    match.log.push(generateAuctioneerIntel(match.lot, match.round));
  }
  for (const player of match.players) fireAssistantSchedule(match, player, match.round);
}

function endMatchSold(match, winnerId, finalSalePrice) {
  const actualValue = match.lot.actualValue;
  const earnings = actualValue - finalSalePrice;
  const winner = match.players.find((p) => p.id === winnerId);

  // Instant cash-out (§7 design decision): apply the net Earnings straight to the winner's
  // balance, rather than modeling a separate pay-then-sell-items step.
  winner.balance += earnings;

  const spillover = {};
  if (earnings < 0) {
    const share = Math.round(Math.abs(earnings) * OVERPAY_SPILLOVER_RATE);
    for (const p of match.players) {
      if (p.id === winnerId) continue;
      p.balance += share;
      spillover[p.id] = share;
    }
  }

  match.status = "sold";
  match.result = { winnerId, finalSalePrice, actualValue, earnings, spillover };
  return match;
}

function endMatchUnsold(match) {
  match.status = "unsold";
  match.result = { winnerId: null, finalSalePrice: null, actualValue: match.lot.actualValue, earnings: null, spillover: {} };
  return match;
}
