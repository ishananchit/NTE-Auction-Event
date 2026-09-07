// Pool-wide statistics (average price per rarity, overall average) — these are things a
// player could plausibly know from browsing the always-available Collectibles Index (§5e),
// as opposed to lot-specific facts, which are hidden until revealed. Used to compute the
// live "Current Estimate" (§5a) from partial reveals.

import { effectiveReveal } from "./revealAccess.js";

export function computePoolStats(pool) {
  const byRarity = {};
  let total = 0;

  for (const item of pool) {
    if (!byRarity[item.rarity]) byRarity[item.rarity] = { sum: 0, count: 0 };
    byRarity[item.rarity].sum += item.basePrice;
    byRarity[item.rarity].count += 1;
    total += item.basePrice;
  }

  const rarityAverages = {};
  for (const [rarity, { sum, count }] of Object.entries(byRarity)) {
    rarityAverages[rarity] = sum / count;
  }

  return { rarityAverages, poolAverage: total / pool.length };
}

/**
 * "Current Estimate" (§5a): sum of what `playerId` specifically knows about the lot so far —
 * this is a per-player number, not a single shared truth, since Assistant/Device reveals are
 * private to whoever triggered them (only Auctioneer Public Intel is shared — see §8
 * "information privacy" and revealAccess.js).
 * - fullyRevealed (to this player) items contribute their exact price.
 * - rarityKnown-only items contribute the pool average for that rarity (a reasonable guess
 *   given only the tier is known).
 * - shapeKnown-only items contribute the flat pool-wide average (size doesn't narrow value
 *   down on its own without a rarity to go with it).
 * - Items this player knows nothing about contribute 0.
 * This is why the estimate runs low early on (most items are still worth 0 to the formula)
 * and only approaches Actual Value as reveals pile up — matching the confirmed in-game behavior.
 */
export function computeCurrentEstimate(lot, poolStats, playerId) {
  let total = 0;
  for (const item of lot.items) {
    const { rarityKnown, shapeKnown, fullyRevealed } = effectiveReveal(item, playerId);
    if (fullyRevealed) {
      total += item.basePrice;
    } else if (rarityKnown) {
      total += poolStats.rarityAverages[item.rarity] ?? poolStats.poolAverage;
    } else if (shapeKnown) {
      total += poolStats.poolAverage;
    }
  }
  return Math.round(total);
}
