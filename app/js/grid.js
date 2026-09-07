import { computeRenderSpan, cycleReveal } from "./revealState.js";
import { effectiveReveal, omniscientReveal } from "./revealAccess.js";
import { GRID_FIXED_HEIGHT } from "./config.js";

const CELL_PX = 32;

// Once the lot is sold or goes unsold, there's nothing left to protect — everyone sees every
// item's full identity, regardless of what was actually revealed to anyone during bidding.
const FULL_REVEAL = { rarityKnown: true, shapeKnown: true, fullyRevealed: true };

/**
 * Render a lot's grid into `container`. The layout (gridWidth/gridHeight/placements) is
 * computed once at lot-generation time (see lotGenerator.js) and read here, not re-packed per
 * render — this keeps it identical for every synced player (Stage 4) instead of each client
 * landing on its own random layout.
 * @param {HTMLElement} container
 * @param {object} lot - from generateLot()
 * @param {{debug?: boolean, revealAll?: boolean, viewerPlayerId?: string, onChange?: () => void}} opts
 *   debug=true shows the "god view" (everything revealed to anyone so far, public or private, as
 *   a union — NOT full identity unless someone actually fully revealed a given item) and lets you
 *   click cells to test render states by cycling item.publicReveal. revealAll=true (the match has
 *   ended) forces every item to its fully-revealed state regardless of what was actually known to
 *   anyone, and is not clickable. Otherwise (real play, match still in progress) shows exactly
 *   what `viewerPlayerId` would see (their own private reveals + public reveals only).
 */
export function renderGrid(container, lot, opts = {}) {
  const { debug = false, revealAll = false, viewerPlayerId = null, onChange } = opts;
  const { gridWidth, placements } = lot;

  container.innerHTML = "";
  container.style.display = "grid";
  container.style.gridTemplateColumns = `repeat(${gridWidth}, ${CELL_PX}px)`;
  // Fixed row count regardless of this lot's actual packed height (GRID_FIXED_HEIGHT is sized
  // for the worst case — see config.js) — a small/cheap lot must render exactly as tall as a
  // large one, or its rendered size alone would leak info before anything's been revealed.
  container.style.gridTemplateRows = `repeat(${GRID_FIXED_HEIGHT}, ${CELL_PX}px)`;
  container.style.gap = "2px";
  container.classList.toggle("grid-debug", debug);

  for (const item of lot.items) {
    const placement = placements[item.instanceId];
    const reveal = revealAll ? FULL_REVEAL : debug ? omniscientReveal(item) : effectiveReveal(item, viewerPlayerId);

    if (debug) {
      // Faint boundary for every item's true footprint, regardless of reveal state,
      // so it can be clicked to cycle reveal state during testing.
      const boundary = document.createElement("div");
      boundary.className = "cell-boundary";
      styleSpan(boundary, placement.x, placement.y, item.sizeX, item.sizeY);
      boundary.title = `${item.name} (${item.rarity}, ${item.sizeX}x${item.sizeY}, ${item.basePrice})`;
      boundary.addEventListener("click", () => {
        item.publicReveal = cycleReveal(item.publicReveal);
        onChange?.();
      });
      container.appendChild(boundary);
    }

    const span = computeRenderSpan(item, placement, reveal);
    if (!span) continue;

    const el = document.createElement("div");
    el.className = `cell cell--${span.kind}`;
    styleSpan(el, span.x, span.y, span.w, span.h);
    el.style.background = span.fill;

    if (span.kind === "full") {
      el.textContent = item.name;
      el.title = `${item.name} — ${item.basePrice.toLocaleString()}`;
    } else if (debug) {
      el.title = `${item.name} (${item.rarity}, ${item.sizeX}x${item.sizeY})`;
    }

    if (debug) {
      // This div paints on top of the debug boundary underneath it (later in DOM order), so it
      // needs its own click handler too, or clicks on a revealed cell would be swallowed.
      el.addEventListener("click", () => {
        item.publicReveal = cycleReveal(item.publicReveal);
        onChange?.();
      });
    }

    container.appendChild(el);
  }
}

function styleSpan(el, x, y, w, h) {
  el.style.gridColumn = `${x + 1} / span ${w}`;
  el.style.gridRow = `${y + 1} / span ${h}`;
}
