// Grid reveal-state model. See going-going-gone-mechanics.md §5a.
//
// Two independent boolean flags per item: rarityKnown, shapeKnown ("silhouette revealed").
// fullyRevealed is a separate flag implying both (set by Appraisal-type reveals or auction end).

export const RARITY_COLORS = {
  White: "#c9ccd1",
  Green: "#2ecc71",
  Blue: "#3aa0e8",
  Purple: "#9b59d0",
  Gold: "#e0a72e",
  Red: "#e05a4e",
};

export const SHAPE_UNKNOWN_FILL = "#5b6068"; // neutral grey for shapeKnown-but-not-rarityKnown

// Explicit 5-step cycle, in order, for manual testing:
// hidden -> rarity-only -> shape-only -> both -> fully revealed -> hidden ...
const REVEAL_CYCLE = [
  { rarityKnown: false, shapeKnown: false, fullyRevealed: false }, // hidden
  { rarityKnown: true, shapeKnown: false, fullyRevealed: false },  // rarity-only (dot)
  { rarityKnown: false, shapeKnown: true, fullyRevealed: false },  // shape-only (grey silhouette)
  { rarityKnown: true, shapeKnown: true, fullyRevealed: false },   // both (colored silhouette)
  { rarityKnown: true, shapeKnown: true, fullyRevealed: true },    // fully revealed
];

function revealStepIndex(reveal) {
  return REVEAL_CYCLE.findIndex(
    (s) => s.rarityKnown === reveal.rarityKnown && s.shapeKnown === reveal.shapeKnown && s.fullyRevealed === reveal.fullyRevealed
  );
}

export function cycleReveal(reveal) {
  const idx = revealStepIndex(reveal);
  const next = idx === -1 ? 0 : (idx + 1) % REVEAL_CYCLE.length;
  return { ...REVEAL_CYCLE[next] };
}

/**
 * Determine what should actually be rendered for an item given its reveal state + grid placement.
 * `reveal` is a {rarityKnown, shapeKnown, fullyRevealed} view already resolved by the caller for
 * whichever audience is looking (a specific player's effective view, the public view, or the
 * debug/omniscient view — see revealAccess.js) — this function doesn't know or care which.
 * Returns null if nothing should render (fully hidden), otherwise a descriptor:
 *   { x, y, w, h, kind: "dot" | "silhouette-unknown" | "silhouette-known" | "full", fill, item }
 */
export function computeRenderSpan(item, placement, reveal) {
  const { rarityKnown, shapeKnown, fullyRevealed } = reveal;
  const { x, y } = placement;

  if (fullyRevealed) {
    return { x, y, w: item.sizeX, h: item.sizeY, kind: "full", fill: RARITY_COLORS[item.rarity], item };
  }
  if (shapeKnown && rarityKnown) {
    return { x, y, w: item.sizeX, h: item.sizeY, kind: "silhouette-known", fill: RARITY_COLORS[item.rarity], item };
  }
  if (shapeKnown && !rarityKnown) {
    return { x, y, w: item.sizeX, h: item.sizeY, kind: "silhouette-unknown", fill: SHAPE_UNKNOWN_FILL, item };
  }
  if (rarityKnown && !shapeKnown) {
    // Single cell only, at a random offset within the item's true footprint (fixed per item
    // at lot-generation time, not re-randomized on every render) — the rest of the footprint
    // must NOT be visually implied, and always showing the top-left corner would itself leak
    // a (wrong) hint about where the item's boundary is.
    const { dx, dy } = item.rarityDotOffset;
    return { x: x + dx, y: y + dy, w: 1, h: 1, kind: "dot", fill: RARITY_COLORS[item.rarity], item };
  }
  return null; // nothing known
}
