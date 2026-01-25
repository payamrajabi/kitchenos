#!/usr/bin/env python3
import json
import sqlite3
from pathlib import Path


def to_int(value):
    if value is None:
        return None
    value = str(value).strip()
    if value == "":
        return None
    try:
        return int(float(value))
    except ValueError:
        return None


def to_float(value):
    if value is None:
        return None
    value = str(value).strip()
    if value == "":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def main():
    json_path = Path(__file__).parent / "notion_public_table.json"
    db_path = Path(__file__).parent / "recipes.db"

    if not json_path.exists():
        raise SystemExit(f"Missing data file: {json_path}")

    data = json.loads(json_path.read_text(encoding="utf-8"))
    headers = data.get("headers", [])
    rows = data.get("rows", [])

    try:
        name_idx = headers.index("Name")
        calories_idx = headers.index("Calories/Serving")
        carbs_idx = headers.index("Carbs/Serving")
        fat_idx = headers.index("Fat/Serving")
        ingredients_idx = headers.index("Fresh Ingredients")
        id_idx = headers.index("ID")
    except ValueError as exc:
        raise SystemExit("Unexpected headers in notion_public_table.json") from exc

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    cursor = conn.cursor()

    for row in rows:
        if not row or len(row) < len(headers):
            continue

        name = (row[name_idx] or "").strip()
        if not name or name.startswith("http"):
            continue

        calories = to_float(row[calories_idx])
        carbs = to_float(row[carbs_idx])
        fat = to_float(row[fat_idx])
        ingredients = (row[ingredients_idx] or "").strip() or None
        source_id = (row[id_idx] or "").strip()
        notes = f"Notion ID: {source_id}" if source_id else None

        cursor.execute(
            """
            INSERT INTO recipes (
              name,
              ingredients,
              notes,
              calories,
              fat_grams,
              carbs_grams,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            """,
            (
                name,
                ingredients,
                notes,
                to_int(calories),
                to_int(fat),
                to_int(carbs),
            ),
        )

    conn.commit()
    conn.close()
    print(f"Imported {len(rows)} rows from {json_path}")


if __name__ == "__main__":
    main()
