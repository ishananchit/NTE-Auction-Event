// Packs lot items (each a sizeX x sizeY rectangle) into a fixed-width grid
// without overlap, using a randomized skyline ("bottom-left") packing heuristic.
//
// Items are processed in random order (not sorted by size) so large and small items
// end up scattered across the grid instead of clustering by size. For each item, we
// scan every possible x position and place it wherever it would land lowest (on top
// of the shortest run of columns it could span) — this keeps packing reasonably tight
// even without a size-sorted input, unlike naive shelf packing.
// Leftover empty cells are expected and fine — matches the reference screenshots,
// which also show plenty of unused grid cells.

/**
 * @param {Array<{instanceId:string, sizeX:number, sizeY:number}>} items
 * @param {number} gridWidth - number of columns available.
 * @returns {{gridWidth:number, gridHeight:number, placements: Object<string,{x:number,y:number}>}}
 *   `placements` is keyed by item.instanceId (a plain object, not a Map) — this needs to be
 *   JSON-serializable so it can be computed once and synced verbatim to every player over
 *   Firestore (Stage 4), rather than each client re-packing independently and potentially
 *   landing on a different random layout for the same lot.
 */
export function packGrid(items, gridWidth = 10) {
  const order = shuffle([...items]);
  const heights = new Array(gridWidth).fill(0); // current stack height per column
  const placements = {};

  for (const item of order) {
    if (item.sizeX > gridWidth) {
      // Shouldn't happen with current data (max item is 5x5, grid is wider), but guard anyway.
      throw new Error(`Item wider (${item.sizeX}) than grid (${gridWidth}); cannot pack.`);
    }

    let bestX = 0;
    let bestTop = Infinity;
    for (let x = 0; x <= gridWidth - item.sizeX; x++) {
      let top = 0;
      for (let dx = 0; dx < item.sizeX; dx++) top = Math.max(top, heights[x + dx]);
      if (top < bestTop) {
        bestTop = top;
        bestX = x;
      }
    }

    placements[item.instanceId] = { x: bestX, y: bestTop };
    for (let dx = 0; dx < item.sizeX; dx++) heights[bestX + dx] = bestTop + item.sizeY;
  }

  const gridHeight = Math.max(0, ...heights);
  return { gridWidth, gridHeight, placements };
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
