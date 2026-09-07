// Structured version of assistants-and-devices.json's auctionAssistants — each assistant's
// free-text ability turned into a schedule of { round, effectType, params } entries, built
// from the same effects.js handlers devices use (see deviceCatalog.js for the same pattern).
// "Round 1" entries fire at match creation (auction start); rounds 2-5 fire when the match
// advances into that round. Nothing is scheduled for Round 6 (tiebreak) — a special case, not
// a normal round.

export const ASSISTANTS = [
  {
    name: "Adler",
    flavorQuote: "Those without sight are not always blind to the truth.",
    skillName: "Blindsense",
    ability: "Reveals collectible silhouettes by rarity: White in Round 1, Green in Round 2, Blue in Round 3, and Purple in Round 4.",
    schedule: [
      { round: 1, effectType: "rarityAndSize", params: { selection: "byRarity", rarity: "White" } },
      { round: 2, effectType: "rarityAndSize", params: { selection: "byRarity", rarity: "Green" } },
      { round: 3, effectType: "rarityAndSize", params: { selection: "byRarity", rarity: "Blue" } },
      { round: 4, effectType: "rarityAndSize", params: { selection: "byRarity", rarity: "Purple" } },
    ],
  },
  {
    name: "Haniel",
    flavorQuote: "After 99 pulls, surely something good has to happen... right?",
    skillName: "Draw!",
    ability: "Reveals the rarity and silhouettes of 5 random collectibles at auction start, then reveals the rarity of 2 unknown collectibles each round after.",
    schedule: [
      { round: 1, effectType: "rarityAndSize", params: { count: 5, selection: "random" } },
      { round: 2, effectType: "evaluation", params: { count: 2 } },
      { round: 3, effectType: "evaluation", params: { count: 2 } },
      { round: 4, effectType: "evaluation", params: { count: 2 } },
      { round: 5, effectType: "evaluation", params: { count: 2 } },
    ],
  },
  {
    name: "Jiuyuan",
    flavorQuote: "The most valuable intel always comes first, of course.",
    skillName: "Rose Pact Express",
    ability: "Reveals the silhouette of 1 highest-rarity collectible at auction start. Each following round reveals the rarity and silhouette of 1 random collectible.",
    schedule: [
      { round: 1, effectType: "size", params: { count: 1, selection: "highestRarity" } },
      { round: 2, effectType: "rarityAndSize", params: { count: 1, selection: "random" } },
      { round: 3, effectType: "rarityAndSize", params: { count: 1, selection: "random" } },
      { round: 4, effectType: "rarityAndSize", params: { count: 1, selection: "random" } },
      { round: 5, effectType: "rarityAndSize", params: { count: 1, selection: "random" } },
    ],
  },
  {
    name: "Chiz",
    flavorQuote: "Go on, take a bite of the golden apple.",
    skillName: "Afternoon Tea",
    ability: "Reveals the silhouettes of 8 random collectibles at auction start. In Round 3, reveals the identities of those same 8 collectibles from Round 1.",
    schedule: [
      { round: 1, effectType: "size", params: { count: 8, selection: "random", rememberAs: "chizBatch" } },
      { round: 3, effectType: "appraisal", params: { recallFrom: "chizBatch" } },
    ],
  },
  {
    name: "Hathor",
    flavorQuote: "Plan first. Strike later.",
    skillName: "Loaded",
    ability: "Reveals the rarity of all collectibles at the start of Round 5.",
    schedule: [{ round: 5, effectType: "evaluation", params: { selection: "all" } }],
  },
  {
    name: "Edgar",
    flavorQuote: "Playing it safe is still a strategy.",
    skillName: "Library Rules",
    ability: "Reveals the rarity and silhouettes of all White-, Green-, and Blue-rarity collectibles at auction start.",
    schedule: [
      { round: 1, effectType: "rarityAndSize", params: { selection: "byRarity", rarity: "White" } },
      { round: 1, effectType: "rarityAndSize", params: { selection: "byRarity", rarity: "Green" } },
      { round: 1, effectType: "rarityAndSize", params: { selection: "byRarity", rarity: "Blue" } },
    ],
  },
  {
    name: "Daffodill",
    flavorQuote: "She sees the whole board at a glance.",
    skillName: "Eye Among Thousands",
    ability: "Reveals the total number of Purple-, Gold-, and Red-rarity collectibles at auction start.",
    schedule: [{ round: 1, effectType: "countMultiRarity", params: { rarities: ["Purple", "Gold", "Red"] } }],
  },
  {
    name: "Hotori",
    flavorQuote: "Never underestimate the eye of an antique dealer.",
    skillName: "River of Time",
    ability: "In Rounds 1-3, reveals the silhouette of 1 random collectible of unknown type. In Round 5, reveals the silhouettes of all collectibles with known rarity.",
    schedule: [
      { round: 1, effectType: "size", params: { count: 1, selection: "random" } },
      { round: 2, effectType: "size", params: { count: 1, selection: "random" } },
      { round: 3, effectType: "size", params: { count: 1, selection: "random" } },
      { round: 5, effectType: "size", params: { selection: "knownRarityUnknownShape" } },
    ],
  },
];

export function findAssistant(name) {
  return ASSISTANTS.find((a) => a.name === name);
}

export function randomAssistant() {
  return ASSISTANTS[Math.floor(Math.random() * ASSISTANTS.length)];
}
