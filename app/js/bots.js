// Placeholder bot bidding — just enough randomness to exercise the round/threshold/payout
// logic end-to-end without requiring 4 humans. Not meant to be "smart"; replace/expand later.

import { currentEstimate } from "./auctionEngine.js";

const PASS_CHANCE = 0.3;

export function botDecideBid(match, playerId) {
  const player = match.players.find((p) => p.id === playerId);
  const estimate = currentEstimate(match, playerId); // this bot's own Current Estimate — Assistant/Device reveals are private per §8

  // Nothing revealed to THIS player yet (bots don't use devices, and may not have an assistant
  // with an early schedule entry) — no basis to bid on, so just pass. (Previously this fell back
  // to a "blind guess" off match.poolStats.poolAverage, but that average is badly skewed by a
  // couple of extreme-outlier items in the pool, making blind bids wildly disconnected from any
  // given lot's real value — e.g. multi-million-currency bids on a lot worth a few hundred
  // thousand. Simpler and safer to just pass with zero information.)
  if (estimate === 0) return 0;

  if (Math.random() < PASS_CHANCE) return 0; // pass
  const multiplier = 1 + Math.random(); // 1x - 2x of the current estimate
  return clampToBalance(Math.round(estimate * multiplier), player.balance);
}

function clampToBalance(amount, balance) {
  return Math.max(0, Math.min(amount, balance));
}
