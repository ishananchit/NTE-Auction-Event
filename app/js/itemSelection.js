// Shared item-selection strategies used by devices, assistants, and Auctioneer Intel reveal
// cards. Keeping these as a small reusable set (instead of bespoke logic per device/assistant)
// is what lets ~38 unique devices + 8 assistants + a couple of intel cards share ~7 effect
// handlers (see effects.js) instead of needing one function each.
//
// "isKnown(item)" throughout is a caller-supplied predicate (see effects.js's fireEffect),
// since what counts as "already known" depends on *who's* looking (see revealAccess.js) —
// selection logic here doesn't know or care about the public/private distinction itself.

const RARITY_ORDER = ["White", "Green", "Blue", "Purple", "Gold", "Red"];

function shuffledCopy(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Random items, optionally restricted so the effect isn't wasted on items that are already
 * known (to whichever audience `isKnown` represents) and/or restricted to a category.
 */
export function selectRandom(lot, count, { isKnown = null, category = null } = {}) {
  let pool = lot.items;
  if (isKnown) pool = pool.filter((it) => !isKnown(it));
  if (category) pool = pool.filter((it) => it.category === category);
  return shuffledCopy(pool).slice(0, count);
}

/** All items of an exact rarity (used by Adler/Edgar's "reveal this whole tier" effects). */
export function selectByRarity(lot, rarity) {
  return lot.items.filter((it) => it.rarity === rarity);
}

/** The single largest-footprint item among eligible candidates (ties broken randomly). */
export function selectLargestSlot(lot, { isKnown = null } = {}) {
  let pool = lot.items;
  if (isKnown) pool = pool.filter((it) => !isKnown(it));
  if (pool.length === 0) return [];
  const maxSlots = Math.max(...pool.map((it) => it.sizeX * it.sizeY));
  const tied = pool.filter((it) => it.sizeX * it.sizeY === maxSlots);
  return [shuffledCopy(tied)[0]];
}

/** One random item from the highest rarity tier present among eligible candidates. */
export function selectHighestRarity(lot, { isKnown = null } = {}) {
  let pool = lot.items;
  if (isKnown) pool = pool.filter((it) => !isKnown(it));
  if (pool.length === 0) return [];
  for (let i = RARITY_ORDER.length - 1; i >= 0; i--) {
    const atTier = pool.filter((it) => it.rarity === RARITY_ORDER[i]);
    if (atTier.length > 0) return [shuffledCopy(atTier)[0]];
  }
  return [];
}

/**
 * Single entry point every effect handler (effects.js) uses to pick its targets — dispatches
 * to one of the strategies above by name, so a device/assistant/intel-card definition just
 * says *which* strategy + params it wants instead of each effect reimplementing selection.
 * @param target - the {isKnown(item,flag), setFlag(item,flag)} accessor for this effect's
 *   audience (public or a specific player's private view — see revealAccess.js).
 * @param flagName - which reveal flag this effect is about to set (null for effects, like
 *   "highestRarityUntouched", that check across all three flags instead of just one).
 */
export function resolveTargets(lot, params, target, flagName) {
  const isKnown = flagName ? (it) => target.isKnown(it, flagName) : null;
  const isAnyKnown = (it) => target.isKnown(it, "rarityKnown") || target.isKnown(it, "shapeKnown") || target.isKnown(it, "fullyRevealed");

  const strategy = params.selection || "random";
  switch (strategy) {
    case "random":
      return selectRandom(lot, params.count ?? 1, { isKnown, category: params.category ?? null });
    case "byRarity":
      return selectByRarity(lot, params.rarity);
    case "largestSlot":
      return selectLargestSlot(lot, { isKnown });
    case "highestRarity":
      return selectHighestRarity(lot, { isKnown });
    case "highestRarityUntouched":
      return selectHighestRarity(lot, { isKnown: isAnyKnown });
    case "knownRarityUnknownShape":
      return lot.items.filter((it) => target.isKnown(it, "rarityKnown") && !target.isKnown(it, "shapeKnown"));
    case "all":
      return isKnown ? lot.items.filter((it) => !isKnown(it)) : lot.items;
    default:
      throw new Error(`Unknown selection strategy: ${strategy}`);
  }
}
