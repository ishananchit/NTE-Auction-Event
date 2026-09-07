// A per-tab client identity. No Firebase Auth for now (deliberately skipped — see
// going-going-gone-mechanics.md / implementation-plan.md Stage 4 notes: this means privacy is
// enforced only by what a client chooses to render, not by security rules, which is an accepted
// risk for a private friends game).
//
// Deliberately sessionStorage, not localStorage: localStorage is shared across every tab of the
// same origin, which would make multiple tabs on one machine collide on the same identity —
// breaking the exact "open several tabs on my own computer to test multiplayer" workflow this
// needs to support. sessionStorage is per-tab, so each tab is naturally its own player, and a
// reload of the same tab still keeps its identity (just not a brand new tab).

const CLIENT_ID_KEY = "gggClientId";
const NAME_KEY = "gggPlayerName";

export function getClientId() {
  let id = sessionStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = "c" + Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export function getStoredName() {
  return localStorage.getItem(NAME_KEY) || "";
}

export function setStoredName(name) {
  localStorage.setItem(NAME_KEY, name);
}
