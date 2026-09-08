// Collectibles Index — filterable catalog of the full item pool. See mechanics doc §5e.
// Shapes here are simple sizeX x sizeY rectangles (no irregular-shape data was captured),
// so the "Shape" filter is a straight (sizeX, sizeY) match rather than the ~25-shape palette
// the source game uses.

import { RARITY_COLORS } from "./revealState.js";

const RARITIES = ["White", "Green", "Blue", "Purple", "Gold", "Red"];

/**
 * @param {{initialRarity?: string, initialShape?: string}} opts - pre-select the Rarity/Shape
 *   filters (e.g. so clicking a partially-revealed grid cell during a match can open this
 *   already filtered to "what's known so far" — see main.js's grid onCellPeek wiring). Empty
 *   string (the default) means "All" for that filter, same as the dropdown's own default option.
 */
export function renderCollectiblesIndex(container, pool, opts = {}) {
  const { initialRarity = "", initialShape = "" } = opts;
  container.innerHTML = "";
  container.classList.add("collectibles-index"); // don't clobber caller's own classes (e.g. overlay/visible)

  const filters = document.createElement("div");
  filters.className = "index-filters";

  const rarityFilter = document.createElement("select");
  rarityFilter.innerHTML =
    `<option value="">All rarities</option>` +
    RARITIES.map((r) => `<option value="${r}">${r}</option>`).join("");
  rarityFilter.value = initialRarity;

  const shapes = [...new Set(pool.map((it) => `${it.sizeX}x${it.sizeY}`))].sort(
    (a, b) => a.localeCompare(b, undefined, { numeric: true })
  );
  const shapeFilter = document.createElement("select");
  shapeFilter.innerHTML =
    `<option value="">All shapes</option>` +
    shapes.map((s) => `<option value="${s}">${s}</option>`).join("");
  shapeFilter.value = initialShape;

  const nameFilter = document.createElement("input");
  nameFilter.type = "text";
  nameFilter.placeholder = "Search name...";

  filters.append(rarityFilter, shapeFilter, nameFilter);
  container.appendChild(filters);

  const list = document.createElement("div");
  list.className = "index-list";
  container.appendChild(list);

  function applyFilters() {
    const rarity = rarityFilter.value;
    const shape = shapeFilter.value;
    const name = nameFilter.value.trim().toLowerCase();

    const filtered = pool.filter((it) => {
      if (rarity && it.rarity !== rarity) return false;
      if (shape && `${it.sizeX}x${it.sizeY}` !== shape) return false;
      if (name && !it.name.toLowerCase().includes(name)) return false;
      return true;
    });

    list.innerHTML = "";
    for (const it of filtered.sort((a, b) => b.basePrice - a.basePrice)) {
      const row = document.createElement("div");
      row.className = "index-row";
      row.innerHTML = `
        <span class="swatch" style="background:${RARITY_COLORS[it.rarity] || "#888"}"></span>
        <span class="index-name">${it.name}</span>
        <span class="index-shape">${it.sizeX}x${it.sizeY}</span>
        <span class="index-rarity">${it.rarity}</span>
        <span class="index-price">${it.basePrice.toLocaleString()}</span>
      `;
      list.appendChild(row);
    }

    const count = document.createElement("div");
    count.className = "index-count";
    count.textContent = `${filtered.length} / ${pool.length} items`;
    list.prepend(count);
  }

  rarityFilter.addEventListener("change", applyFilters);
  shapeFilter.addEventListener("change", applyFilters);
  nameFilter.addEventListener("input", applyFilters);
  applyFilters();
}
