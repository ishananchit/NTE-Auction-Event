// The ~7 reveal-effect handlers every device, assistant schedule entry, and Auctioneer Intel
// reveal-card is built from (see mechanics doc §5d glossary). This is the "few handlers, lots
// of data" structure — individual devices/assistants never get their own bespoke function,
// just a params object naming one of these.
//
// Item-targeting handlers (evaluation/size/rarityAndSize/appraisal/valuationSingle) receive an
// already-resolved `targets` list (see fireEffect below) rather than picking their own targets,
// so the one place that needs to special-case "reveal the same items I picked earlier"
// (Chiz's assistant ability) can do so without every handler needing to know about it. They
// also receive `target`, the public/private accessor to write flags through (see
// revealAccess.js) — the handlers themselves stay ignorant of *who* can see the result.

import { resolveTargets } from "./itemSelection.js";

const REQUIRES_FLAG = {
  evaluation: "rarityKnown",
  size: "shapeKnown",
  rarityAndSize: "shapeKnown",
  appraisal: "fullyRevealed",
};

const ITEM_TARGETING_TYPES = new Set(["evaluation", "size", "rarityAndSize", "appraisal", "valuationSingle"]);

export const EFFECT_HANDLERS = {
  evaluation(lot, params, targets, target) {
    for (const it of targets) target.setFlag(it, "rarityKnown");
    return { text: describeCategory(params) + `Reveals the rarity of ${targets.length}${describeRarity(params)} collectible(s).`, count: targets.length };
  },

  size(lot, params, targets, target) {
    for (const it of targets) target.setFlag(it, "shapeKnown");
    return { text: `Reveals the silhouette${targets.length === 1 ? "" : "s"} of ${targets.length}${describeRarity(params)} collectible(s).`, count: targets.length };
  },

  // "Both flags at once" — used by effects whose in-game text says "rarity and silhouette(s)"
  // (§5a: this is a combined grant of the two independent flags, not a distinct third flag).
  rarityAndSize(lot, params, targets, target) {
    for (const it of targets) {
      target.setFlag(it, "rarityKnown");
      target.setFlag(it, "shapeKnown");
    }
    return { text: `Reveals the rarity and silhouette${targets.length === 1 ? "" : "s"} of ${targets.length}${describeRarity(params)} collectible(s).`, count: targets.length };
  },

  appraisal(lot, params, targets, target) {
    for (const it of targets) {
      target.setFlag(it, "rarityKnown");
      target.setFlag(it, "shapeKnown");
      target.setFlag(it, "fullyRevealed");
    }
    const names = targets.map((it) => it.name).join(", ");
    return { text: `Fully reveals ${targets.length} collectible(s)${names ? `: ${names}` : ""}.`, count: targets.length };
  },

  // Edge case: "Special Valuation Device" reveals the *price* of one targeted item without
  // identifying it (no matching state exists in our reveal model for "price known, identity
  // not" — see going-going-gone-mechanics.md §8) — implemented as text-only, like the aggregate
  // valuation/count/average-value effects below, just scoped to a single targeted item.
  valuationSingle(lot, params, targets) {
    const [target] = targets;
    if (!target) return { text: "No eligible collectible to appraise.", count: 0 };
    return { text: `The largest collectible in this lot is worth ${target.basePrice.toLocaleString()}.`, count: 1 };
  },

  count(lot, params) {
    const n = lot.items.filter((it) => it.rarity === params.rarity).length;
    return { text: `Total number of ${params.rarity}-rarity collectibles: ${n}.`, count: n };
  },

  // Daffodill's ability: one combined line covering several rarities at once, rather than a
  // single-rarity Count Device repeated three times.
  countMultiRarity(lot, params) {
    const parts = params.rarities.map((r) => `${r}: ${lot.items.filter((it) => it.rarity === r).length}`);
    return { text: `Total number of collectibles by rarity — ${parts.join(", ")}.`, count: null };
  },

  valuation(lot, params) {
    const matching = lot.items.filter((it) => it.rarity === params.rarity);
    const total = matching.reduce((s, it) => s + it.basePrice, 0);
    return { text: `Combined value of all ${params.rarity}-rarity collectibles: ${total.toLocaleString()}.`, count: matching.length };
  },

  averageValue(lot, params) {
    const matching = params.rarity
      ? lot.items.filter((it) => it.rarity === params.rarity)
      : lot.items.filter((it) => it.sizeX * it.sizeY === params.bySlotSize);
    const avg = matching.length ? Math.round(matching.reduce((s, it) => s + it.basePrice, 0) / matching.length) : 0;
    const label = params.rarity ? `${params.rarity}-rarity` : `${params.bySlotSize}-slot`;
    return { text: `Average value of all ${label} collectibles: ${avg.toLocaleString()}.`, count: matching.length };
  },

  slot(lot, params) {
    const matching = lot.items.filter((it) => it.rarity === params.rarity);
    const totalSlots = matching.reduce((s, it) => s + it.sizeX * it.sizeY, 0);
    return { text: `Total slots occupied by all ${params.rarity}-rarity collectibles: ${totalSlots}.`, count: matching.length };
  },
};

function describeCategory(params) {
  return params.category ? `[${params.category}] ` : "";
}

// Only append a rarity label when the selection strategy actually restricted by rarity
// (byRarity) — otherwise the same-looking "Reveals rarity+silhouette of N collectibles" text
// for two different rarity tiers with the same count is genuinely ambiguous in the log.
function describeRarity(params) {
  return params.selection === "byRarity" ? ` ${params.rarity}-rarity` : "";
}

/**
 * Central entry point for every reveal-granting thing in the game (devices, assistant schedule
 * entries, Auctioneer Intel reveal-cards). Resolves targets (with `memory`/`ownerKey` support
 * for "reveal the same items as before" callbacks like Chiz's), applies the effect through
 * `target` (public or a specific player's private accessor — see revealAccess.js), and — for
 * item-targeting effects with `params.rememberAs` set — records the chosen instanceIds so a
 * later `params.recallFrom` can retarget the exact same items.
 *
 * @param lot - the match's lot.
 * @param effectType - one of the EFFECT_HANDLERS keys.
 * @param params - device/assistant/intel-card params (count, rarity, category, selection, ...).
 * @param memory - a plain object used as the remember/recall store, scoped by the caller
 *   (e.g. one per player, since two players' assistants shouldn't share callback memory).
 * @param target - {isKnown(item,flag), setFlag(item,flag)} from revealAccess.js — determines
 *   who this reveal is visible to. Required for item-targeting effect types; ignored otherwise.
 */
export function fireEffect(lot, effectType, params, memory, target) {
  const handler = EFFECT_HANDLERS[effectType];
  if (!handler) throw new Error(`Unknown effect type: ${effectType}`);

  if (!ITEM_TARGETING_TYPES.has(effectType)) {
    return handler(lot, params);
  }

  let targets;
  if (params.recallFrom) {
    const ids = memory[params.recallFrom] || [];
    targets = ids.map((id) => lot.items.find((it) => it.instanceId === id)).filter(Boolean);
  } else {
    targets = resolveTargets(lot, params, target, REQUIRES_FLAG[effectType] ?? null);
  }

  if (params.rememberAs) {
    memory[params.rememberAs] = targets.map((it) => it.instanceId);
  }

  return handler(lot, params, targets, target);
}
