// Lot generation — weighted random sampling with replacement.
// See going-going-gone-mechanics.md §8 "Lot randomization algorithm".

import { packGrid } from "./gridPacker.js";
import { GRID_WIDTH, LOT_MIN_ITEMS, LOT_MAX_ITEMS } from "./config.js";

/**
 * Build a cumulative-weight lookup table for weighted random sampling.
 * @param {Array<{weight:number}>} pool
 * @returns {{cumulative:number[], total:number}}
 */
function buildCumulativeWeights(pool) {
  const cumulative = [];
  let running = 0;
  for (const item of pool) {
    running += item.weight > 0 ? item.weight : 0;
    cumulative.push(running);
  }
  return { cumulative, total: running };
}

/** Binary search for the first index whose cumulative weight >= target. */
function pickIndex(cumulative, target) {
  let lo = 0;
  let hi = cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] < target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/**
 * Draw N items from the pool via weighted random sampling with replacement.
 * @param {Array} pool - collectible definitions, each with a `weight`.
 * @param {number} n - number of draws.
 * @returns {Array} n collectible definitions (references into pool, may repeat).
 */
export function drawWeighted(pool, n) {
  const { cumulative, total } = buildCumulativeWeights(pool);
  if (total <= 0) throw new Error("Collectible pool has no positive weight to sample from.");

  const drawn = [];
  for (let i = 0; i < n; i++) {
    const target = Math.random() * total;
    const idx = pickIndex(cumulative, target);
    drawn.push(pool[idx]);
  }
  return drawn;
}

/**
 * Generate a full lot: random size in [minSize, maxSize], then weighted-draw that many items.
 * Each drawn item becomes a lot instance with a unique instanceId (items can repeat).
 */
export function generateLot(pool, { minSize = LOT_MIN_ITEMS, maxSize = LOT_MAX_ITEMS } = {}) {
  const size = minSize + Math.floor(Math.random() * (maxSize - minSize + 1));
  const drawnDefs = drawWeighted(pool, size);

  const items = drawnDefs.map((def, i) => ({
    instanceId: `lot-${i}`,
    collectibleId: def.id,
    name: def.name,
    rarity: def.rarity,
    category: def.category, // currently null for every item — category data hasn't been filled into the spreadsheet yet, so category-filtered devices are no-ops for now (known limitation)
    basePrice: def.basePrice,
    sizeX: def.sizeX,
    sizeY: def.sizeY,
    // Which single cell within this item's footprint shows the "rarity-only" reveal dot.
    // Chosen once at lot generation (not at render time) so it doesn't jump around on re-render.
    rarityDotOffset: {
      dx: Math.floor(Math.random() * def.sizeX),
      dy: Math.floor(Math.random() * def.sizeY),
    },
    // Reveals are split by audience: publicReveal is set only by Auctioneer Public Intel (visible
    // to everyone); privateReveal[playerId] is set only by that player's own Assistant/Devices
    // (visible only to them). See going-going-gone-mechanics.md §8 "information privacy".
    publicReveal: {
      rarityKnown: false,
      shapeKnown: false,
      fullyRevealed: false,
    },
    privateReveal: {}, // lazily populated per playerId — see revealAccess.js
  }));

  const { gridWidth, gridHeight, placements } = packGrid(items, GRID_WIDTH);

  return {
    size,
    items,
    actualValue: items.reduce((sum, it) => sum + it.basePrice, 0),
    gridWidth,
    gridHeight,
    placements, // {[instanceId]: {x,y}} — computed once here so every synced player sees the same layout (Stage 4)
  };
}
