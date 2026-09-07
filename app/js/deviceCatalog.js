// Structured version of assistants-and-devices.json's deviceSets — this is the "just assign
// values" data entry for every device: a name + which of the 7-ish effects.js handlers it
// uses + its params. No device gets its own function; adding a new one later is just adding
// an entry here.
//
// Individual device definitions are keyed by name (many repeat verbatim across sets, e.g.
// "Small Evaluation Device" appears in 3 different sets) so each is only specified once.

export const DEVICE_DEFINITIONS = {
  "Micro Evaluation Device": { effectType: "evaluation", params: { count: 2 }, effect: "Reveals the rarity of 2 random collectibles." },
  "Micro Size Device": { effectType: "size", params: { count: 4 }, effect: "Reveals the silhouettes of 4 random collectibles." },
  "Micro Appraisal Device": { effectType: "appraisal", params: { count: 1 }, effect: "Reveals 1 random collectible." },

  "Green-rarity Count Device": { effectType: "count", params: { rarity: "Green" }, effect: "Reveals the total number of Green-rarity collectibles." },
  "Green-rarity Average Value Device": { effectType: "averageValue", params: { rarity: "Green" }, effect: "Reveals the average value of all Green-rarity collectibles." },
  "Green-rarity Slot Device": { effectType: "slot", params: { rarity: "Green" }, effect: "Reveals the total slots occupied by all Green-rarity collectibles." },
  "Green-rarity Valuation Device": { effectType: "valuation", params: { rarity: "Green" }, effect: "Reveals the combined value of all Green-rarity collectibles." },

  "Small Evaluation Device": { effectType: "evaluation", params: { count: 4 }, effect: "Reveals the rarity of 4 random collectibles." },
  "Small Size Device": { effectType: "size", params: { count: 6 }, effect: "Reveals the silhouettes of 6 random collectibles." },
  "Small Appraisal Device": { effectType: "appraisal", params: { count: 2 }, effect: "Reveals 2 random collectibles." },
  "Four-Slot Average Value Device": { effectType: "averageValue", params: { bySlotSize: 4 }, effect: "Reveals the average value of collectibles in 4 slots." },

  "Purple-rarity Valuation Device": { effectType: "valuation", params: { rarity: "Purple" }, effect: "Reveals the combined value of all Purple-rarity collectibles." },
  "Purple-rarity Count Device": { effectType: "count", params: { rarity: "Purple" }, effect: "Reveals the total number of Purple-rarity collectibles." },
  "Purple-rarity Average Value Device": { effectType: "averageValue", params: { rarity: "Purple" }, effect: "Reveals the average value of all Purple-rarity collectibles." },

  "Antique Evaluation Device": { effectType: "evaluation", params: { count: 3, category: "Antique" }, effect: "Reveals the rarity of 3 random Antique collectibles." },
  "Gem Evaluation Device": { effectType: "evaluation", params: { count: 3, category: "Gem" }, effect: "Reveals the rarity of 3 random Gem collectibles." },
  "Tech Evaluation Device": { effectType: "evaluation", params: { count: 3, category: "Tech" }, effect: "Reveals the rarity of 3 random Tech collectibles." },
  "Food Evaluation Device": { effectType: "evaluation", params: { count: 3, category: "Food" }, effect: "Reveals the rarity of 3 random Food collectibles." },
  "Daily Goods Evaluation Device": { effectType: "evaluation", params: { count: 3, category: "Daily Goods" }, effect: "Reveals the rarity of 3 random Daily Goods collectibles." },
  "Anomaly Evaluation Device": { effectType: "evaluation", params: { count: 3, category: "Anomaly" }, effect: "Reveals the rarity of 3 random Anomaly Residual collectibles." },

  "Medium Evaluation Device": { effectType: "evaluation", params: { count: 6 }, effect: "Reveals the rarity of 6 random collectibles." },
  "Medium Size Device": { effectType: "size", params: { count: 8 }, effect: "Reveals the silhouettes of 8 random collectibles." },
  "Medium Appraisal Device": { effectType: "appraisal", params: { count: 3 }, effect: "Reveals 3 random collectibles." },

  "Special Size Device": { effectType: "size", params: { count: 1, selection: "largestSlot" }, effect: "Reveals the silhouette of 1 random collectible that occupies the most slots." },
  "Single-Slot Average Value Device": { effectType: "averageValue", params: { bySlotSize: 1 }, effect: "Reveals the average value of collectibles in 1 slot." },

  "Large Evaluation Device": { effectType: "evaluation", params: { count: 8 }, effect: "Reveals the rarity of 8 random collectibles." },
  "Large Size Device": { effectType: "size", params: { count: 10 }, effect: "Reveals the silhouettes of 10 random collectibles." },
  "Large Appraisal Device": { effectType: "appraisal", params: { count: 5 }, effect: "Reveals 5 random collectibles." },

  "Gold-rarity Valuation Device": { effectType: "valuation", params: { rarity: "Gold" }, effect: "Reveals the combined value of all Gold-rarity collectibles." },
  "Gold-rarity Slot Device": { effectType: "slot", params: { rarity: "Gold" }, effect: "Reveals the total slots occupied by all Gold-rarity collectibles." },
  "Gold-rarity Average Value Device": { effectType: "averageValue", params: { rarity: "Gold" }, effect: "Reveals the average value of all Gold-rarity collectibles." },
  "Gold-rarity Count Device": { effectType: "count", params: { rarity: "Gold" }, effect: "Reveals the total number of Gold-rarity collectibles." },

  "Special Appraisal Device": { effectType: "appraisal", params: { count: 1, selection: "largestSlot" }, effect: "Reveals 1 random collectible that occupies the most slots." },
  "Special Valuation Device": { effectType: "valuationSingle", params: { count: 1, selection: "largestSlot" }, effect: "Reveals the value of 1 random collectible that occupies the most slots." },

  "Super Evaluation Device": { effectType: "evaluation", params: { count: 10 }, effect: "Reveals the rarity of 10 random collectibles." },
  "Super Size Device": { effectType: "size", params: { count: 12 }, effect: "Reveals the silhouettes of 12 random collectibles." },
  "Super Appraisal Device": { effectType: "appraisal", params: { count: 6 }, effect: "Reveals 6 random collectibles." },

  "Supreme Appraisal Device": {
    effectType: "appraisal",
    params: { count: 1, selection: "highestRarityUntouched" },
    effect: "Fully reveals one random highest-rarity collectible (identity, shape, rarity, and price all at once), chosen only from collectibles that had no information revealed about them yet.",
  },
};

// Which device sets bundle which devices (name + price/description kept for the pre-match UI).
export const DEVICE_SETS = [
  { name: "Basic General-Purpose Device Set", price: 2000, description: "An affordable, reliable device set ideal for beginners.", devices: ["Micro Evaluation Device", "Micro Size Device", "Micro Appraisal Device"] },
  { name: "Basic Data Device Set", price: 2000, description: "An affordable, reliable device set ideal for beginners.", devices: ["Green-rarity Count Device", "Green-rarity Average Value Device", "Green-rarity Slot Device", "Green-rarity Valuation Device"] },
  { name: "Medium General-Purpose Device Set", price: 5000, description: "A reliable, cost-effective device set that offers solid support.", devices: ["Small Evaluation Device", "Small Size Device", "Small Appraisal Device", "Four-Slot Average Value Device"] },
  { name: "Medium Value Device Set", price: 5000, description: "A reliable, cost-effective device set that offers solid support.", devices: ["Small Evaluation Device", "Small Size Device", "Small Appraisal Device", "Purple-rarity Valuation Device"] },
  { name: "Medium Quantity Device Set", price: 5000, description: "A reliable, cost-effective device set that offers solid support.", devices: ["Small Evaluation Device", "Small Size Device", "Small Appraisal Device", "Purple-rarity Count Device"] },
  { name: "Antique Device Set", price: 10000, description: "Specialized device set for antique collectibles. Particularly effective in the right situation.", devices: ["Antique Evaluation Device", "Medium Evaluation Device", "Medium Size Device", "Medium Appraisal Device", "Purple-rarity Average Value Device"] },
  { name: "Gem Device Set", price: 10000, description: "Specialized device set for gem collectibles. Particularly effective in the right situation.", devices: ["Gem Evaluation Device", "Medium Evaluation Device", "Medium Size Device", "Medium Appraisal Device", "Purple-rarity Average Value Device"] },
  { name: "Tech Device Set", price: 10000, description: "Specialized device set for tech collectibles. Particularly effective in the right situation.", devices: ["Tech Evaluation Device", "Medium Evaluation Device", "Medium Size Device", "Medium Appraisal Device", "Purple-rarity Average Value Device"] },
  { name: "Food Device Set", price: 10000, description: "Specialized device set for food collectibles. Particularly effective in the right situation.", devices: ["Food Evaluation Device", "Medium Evaluation Device", "Medium Size Device", "Medium Appraisal Device", "Purple-rarity Average Value Device"] },
  { name: "Daily Goods Device Set", price: 10000, description: "Specialized device set for daily goods collectibles. Particularly effective in the right situation.", devices: ["Daily Goods Evaluation Device", "Medium Evaluation Device", "Medium Size Device", "Medium Appraisal Device", "Purple-rarity Average Value Device"] },
  { name: "Anomaly Device Set", price: 10000, description: "Specialized device set for Anomaly collectibles. Particularly effective in the right situation.", devices: ["Anomaly Evaluation Device", "Medium Evaluation Device", "Medium Size Device", "Medium Appraisal Device", "Purple-rarity Average Value Device"] },
  { name: "Advanced General-Purpose Device Set", price: 20000, description: "A versatile device set that makes large collectibles easier to locate.", devices: ["Medium Evaluation Device", "Medium Size Device", "Medium Appraisal Device", "Special Size Device", "Single-Slot Average Value Device"] },
  { name: "Premium General-Purpose Device Set", price: 50000, description: "A highly versatile device set that helps uncover collectible intel.", devices: ["Large Evaluation Device", "Large Size Device", "Large Appraisal Device", "Gold-rarity Valuation Device", "Gold-rarity Slot Device"] },
  { name: "Premium Evaluation Device Set", price: 50000, description: "A specialized device set that reveals the rarity of large collectibles.", devices: ["Large Evaluation Device", "Large Size Device", "Large Appraisal Device", "Purple-rarity Count Device", "Gold-rarity Average Value Device"] },
  { name: "Super Evaluation Device Set", price: 100000, description: "A powerful device set that uncovers a wealth of collectible intel.", devices: ["Special Appraisal Device", "Super Evaluation Device", "Super Size Device", "Super Appraisal Device", "Gold-rarity Count Device"] },
  { name: "Super Valuation Device Set", price: 150000, description: "A powerful device set designed to assess the value of large collectibles.", devices: ["Special Valuation Device", "Super Evaluation Device", "Super Size Device", "Super Appraisal Device", "Gold-rarity Count Device"] },
  { name: "Supreme Device Set", price: 200000, description: "An exceptional device set that immediately reveals one collectible of the highest rarity.", devices: ["Supreme Appraisal Device", "Super Evaluation Device", "Super Size Device", "Super Appraisal Device"] },
];

/** Flatten a set of chosen device-set names into individual, independently-usable device instances. */
export function instantiateDevices(deviceSetNames) {
  const instances = [];
  for (const setName of deviceSetNames) {
    const set = DEVICE_SETS.find((s) => s.name === setName);
    if (!set) continue;
    for (const deviceName of set.devices) {
      const def = DEVICE_DEFINITIONS[deviceName];
      instances.push({
        id: `${setName}::${deviceName}::${instances.length}`,
        name: deviceName,
        fromSet: setName,
        effectType: def.effectType,
        params: def.params,
        used: false,
      });
    }
  }
  return instances;
}
