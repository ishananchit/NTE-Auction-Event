"""
Regenerate app/data/collectibles.json from collectibles-template.xlsx.

Run this any time the spreadsheet is edited:
    python scripts/convert_collectibles.py
"""
import json
import openpyxl
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
XLSX_PATH = ROOT / "collectibles-template.xlsx"
OUT_PATH = ROOT / "app" / "data" / "collectibles.json"

wb = openpyxl.load_workbook(XLSX_PATH, data_only=True)
ws = wb.active

items = []
for row in ws.iter_rows(min_row=3, values_only=True):
    item_id, name, category, rarity, base_price, chance, size_x, size_y, *_rest = row
    if not item_id or not name:
        continue
    items.append({
        "id": item_id,
        "name": name,
        "category": category,
        "rarity": rarity,
        "basePrice": int(base_price),
        "weight": float(chance) if chance is not None else 0,
        "sizeX": int(size_x),
        "sizeY": int(size_y),
    })

OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
OUT_PATH.write_text(json.dumps(items, indent=2), encoding="utf-8")
print(f"Wrote {len(items)} items to {OUT_PATH}")
