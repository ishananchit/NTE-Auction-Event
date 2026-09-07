// Public/private reveal accessors. An item's true knowledge state is split across:
//   item.publicReveal            — set only by Auctioneer Public Intel, visible to everyone.
//   item.privateReveal[playerId] — set only by that player's own Assistant/Device effects,
//                                   visible only to them.
// "Effect targets" (see effects.js) write through one of the two accessor factories below
// depending on their source, so the 7 effect handlers never need to know about privacy at all —
// they just call target.setFlag(item, flag) / rely on target.isKnown(item, flag) for selection.

function getOrCreatePrivate(item, playerId) {
  if (!item.privateReveal[playerId]) {
    item.privateReveal[playerId] = { rarityKnown: false, shapeKnown: false, fullyRevealed: false };
  }
  return item.privateReveal[playerId];
}

/** Target for Auctioneer Public Intel — reads/writes the shared public layer only. */
export function publicRevealTarget() {
  return {
    isKnown: (item, flag) => item.publicReveal[flag],
    setFlag: (item, flag) => {
      item.publicReveal[flag] = true;
    },
  };
}

/**
 * Target for a specific player's Assistant/Device effects — writes only their private layer,
 * but *reads* as "already known" if EITHER the public layer or their own private layer has it
 * (so a player's own reveal never wastes itself re-revealing something already public or
 * something they privately already knew).
 */
export function privateRevealTarget(playerId) {
  return {
    isKnown: (item, flag) => item.publicReveal[flag] || getOrCreatePrivate(item, playerId)[flag],
    setFlag: (item, flag) => {
      getOrCreatePrivate(item, playerId)[flag] = true;
    },
  };
}

/** What a specific player actually sees for an item: public knowledge merged with their own private knowledge. */
export function effectiveReveal(item, playerId) {
  const pub = item.publicReveal;
  const priv = item.privateReveal[playerId] || { rarityKnown: false, shapeKnown: false, fullyRevealed: false };
  return {
    rarityKnown: pub.rarityKnown || priv.rarityKnown,
    shapeKnown: pub.shapeKnown || priv.shapeKnown,
    fullyRevealed: pub.fullyRevealed || priv.fullyRevealed,
  };
}

/** "God view" — union of public + every player's private knowledge. Debug/inspection only, never shown to a real player. */
export function omniscientReveal(item) {
  return Object.keys(item.privateReveal).reduce(
    (acc, playerId) => {
      const priv = item.privateReveal[playerId];
      return {
        rarityKnown: acc.rarityKnown || priv.rarityKnown,
        shapeKnown: acc.shapeKnown || priv.shapeKnown,
        fullyRevealed: acc.fullyRevealed || priv.fullyRevealed,
      };
    },
    { ...item.publicReveal }
  );
}
