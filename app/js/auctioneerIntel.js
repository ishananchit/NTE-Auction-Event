// Auctioneer Public Intel (§5b) — fires on a configurable subset of rounds (AUCTIONEER_INTEL_ROUNDS
// in config.js; confirmed in-game as sparse, not every round), drawn from a pool of 5 equally-
// likely card types. The first 3 are pure aggregate stats (no item flags touched); the last 2
// are genuine item reveals (rarity of 2 / silhouette of 2, confirmed by the user from in-game
// intel cards) and reuse the exact same evaluation/size effect handlers devices and assistants
// use — not a bespoke reveal implementation.
//
// Confirmed in-game phrasing patterns for the aggregate ones:
//   "Total number of collectibles this round: 47."
//   "Total number of Gold-rarity collectibles this round: 6."
//   "Average value of all Blue-rarity collectibles this round: 0."

import { fireEffect } from "./effects.js";
import { publicRevealTarget } from "./revealAccess.js";

const RARITIES = ["White", "Green", "Blue", "Purple", "Gold", "Red"];
const CARD_TYPES = ["totalCount", "rarityCount", "rarityAverage", "revealRarity", "revealSilhouette"];

export function generateAuctioneerIntel(lot, round) {
  const type = CARD_TYPES[Math.floor(Math.random() * CARD_TYPES.length)];

  if (type === "totalCount") {
    return { round, kind: "auctioneerIntel", text: `Total number of collectibles this round: ${lot.items.length}.` };
  }

  if (type === "revealRarity") {
    const { text } = fireEffect(lot, "evaluation", { count: 2 }, {}, publicRevealTarget());
    return { round, kind: "auctioneerIntel", text };
  }

  if (type === "revealSilhouette") {
    const { text } = fireEffect(lot, "size", { count: 2 }, {}, publicRevealTarget());
    return { round, kind: "auctioneerIntel", text };
  }

  const rarity = RARITIES[Math.floor(Math.random() * RARITIES.length)];
  const matching = lot.items.filter((it) => it.rarity === rarity);

  if (type === "rarityCount") {
    return { round, kind: "auctioneerIntel", text: `Total number of ${rarity}-rarity collectibles this round: ${matching.length}.` };
  }

  const avg = matching.length ? Math.round(matching.reduce((s, it) => s + it.basePrice, 0) / matching.length) : 0;
  return { round, kind: "auctioneerIntel", text: `Average value of all ${rarity}-rarity collectibles this round: ${avg}.` };
}
