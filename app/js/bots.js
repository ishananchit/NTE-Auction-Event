// Placeholder bot bidding — just enough randomness to exercise the round/threshold/payout
// logic end-to-end without requiring 4 humans. Not meant to be "smart"; replace/expand later.

import { currentEstimate } from "./auctionEngine.js";

const PASS_CHANCE = 0.3;
const BLIND_PASS_CHANCE = 0.1; // still a guess, but bots shouldn't fold blind most of the time

export function botDecideBid(match, playerId) {
  const player = match.players.find((p) => p.id === playerId);
  const estimate = currentEstimate(match, playerId); // this bot's own Current Estimate — Assistant/Device reveals are private per §8

  if (estimate > 0) {
    if (Math.random() < PASS_CHANCE) return 0; // pass
    const multiplier = 1 + Math.random(); // 1x - 2x of the current estimate
    return clampToBalance(Math.round(estimate * multiplier), player.balance);
  }

  // Nothing revealed to THIS player yet (bots don't use devices, and may not have an assistant
  // with an early schedule entry) — Current Estimate itself must stay 0 to match the real game's
  // "estimate starts near-zero" behavior, but a bot still has *some* rough intuition for what
  // an average lot is worth (same "pool-wide averages are public knowledge" reasoning as
  // poolStats.js), so it isn't stuck always folding. Deliberately more cautious/lower-multiplier
  // than the informed case above, since it really is a guess.
  if (Math.random() < BLIND_PASS_CHANCE) return 0; // pass
  const blindEstimate = match.poolStats.poolAverage * match.lot.items.length;
  const multiplier = 0.1 + Math.random() * 0.7; // 0.1x - 0.8x of the blind guess
  return clampToBalance(Math.round(blindEstimate * multiplier), player.balance);
}

function clampToBalance(amount, balance) {
  return Math.max(0, Math.min(amount, balance));
}
