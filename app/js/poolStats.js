// Pool-wide statistics (average price per rarity, overall average) — these are things a
// player could plausibly know from browsing the always-available Collectibles Index (§5e),
// as opposed to lot-specific facts, which are hidden until revealed. Used to compute the
// live "Current Estimate" (§5a) from partial reveals.

import { effectiveReveal } from "./revealAccess.js";

export function computePoolStats(pool) {
  const byRarity = {};
  let total = 0;

  // Cheapest pool item matching just a rarity, just an exact (sizeX,sizeY), or both at once —
  // used by computeCurrentEstimate below for the "minimum possible value" reading, kept
  // separate from the averages above (which are only for bots.js's own blind-guess heuristic,
  // an unrelated calculation from the player-facing Current Estimate).
  const minByRarity = {};
  const minBySize = {};
  const minBySizeRarity = {};

  for (const item of pool) {
    if (!byRarity[item.rarity]) byRarity[item.rarity] = { sum: 0, count: 0 };
    byRarity[item.rarity].sum += item.basePrice;
    byRarity[item.rarity].count += 1;
    total += item.basePrice;

    const sizeKey = `${item.sizeX}x${item.sizeY}`;
    const sizeRarityKey = `${sizeKey}|${item.rarity}`;
    if (minByRarity[item.rarity] === undefined || item.basePrice < minByRarity[item.rarity]) {
      minByRarity[item.rarity] = item.basePrice;
    }
    if (minBySize[sizeKey] === undefined || item.basePrice < minBySize[sizeKey]) {
      minBySize[sizeKey] = item.basePrice;
    }
    if (minBySizeRarity[sizeRarityKey] === undefined || item.basePrice < minBySizeRarity[sizeRarityKey]) {
      minBySizeRarity[sizeRarityKey] = item.basePrice;
    }
  }

  const rarityAverages = {};
  for (const [rarity, { sum, count }] of Object.entries(byRarity)) {
    rarityAverages[rarity] = sum / count;
  }

  return { rarityAverages, poolAverage: total / pool.length, minByRarity, minBySize, minBySizeRarity };
}

/**
 * "Current Estimate" (§5a): sum of the *minimum* value `playerId` can be sure of, item by item,
 * from what's revealed on the grid alone (rarity/silhouette) — no aggregate intel (Auctioneer
 * Intel counts/averages, device count/valuation/average-value effects) factors in here, only the
 * per-item rarityKnown/shapeKnown/fullyRevealed flags. This is a per-player number, not a single
 * shared truth, since Assistant/Device reveals are private to whoever triggered them (§8).
 * - fullyRevealed items contribute their exact price (no uncertainty left).
 * - rarity AND shape both known (but not identified) contribute the cheapest pool item that's
 *   exactly that size *and* that rarity (the tightest guaranteed-safe floor).
 * - rarity known only contributes the cheapest pool item of that rarity.
 * - shape known only contributes the cheapest pool item of that exact size.
 * - Items this player knows nothing about contribute 0.
 * This is why the estimate runs low early on (most items are still worth 0, and even "known"
 * items only count for their cheapest possible match) and only approaches Actual Value as
 * reveals pile up.
 */
export function computeCurrentEstimate(lot, poolStats, playerId) {
  let total = 0;
  for (const item of lot.items) {
    const { rarityKnown, shapeKnown, fullyRevealed } = effectiveReveal(item, playerId);
    const sizeKey = `${item.sizeX}x${item.sizeY}`;
    if (fullyRevealed) {
      total += item.basePrice;
    } else if (rarityKnown && shapeKnown) {
      total += poolStats.minBySizeRarity[`${sizeKey}|${item.rarity}`] ?? 0;
    } else if (rarityKnown) {
      total += poolStats.minByRarity[item.rarity] ?? 0;
    } else if (shapeKnown) {
      total += poolStats.minBySize[sizeKey] ?? 0;
    }
  }
  return Math.round(total);
}
