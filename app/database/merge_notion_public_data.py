#!/usr/bin/env python3
import json
import re
import sqlite3
from pathlib import Path


MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]
DATE_SUFFIX_RE = re.compile(
    r"^(.*?)(?:"
    + "|".join(MONTHS)
    + r")\s+\d{1,2},\s+\d{4}$"
)


def normalize_name(value):
    if value is None:
        return ""
    value = " ".join(str(value).split())
    if not value:
        return ""
    match = DATE_SUFFIX_RE.match(value)
    if match:
        value = match.group(1).strip()
    return value


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


def combine_ingredients(*values):
    items = []
    for value in values:
        if not value:
            continue
        raw = str(value).strip()
        if not raw:
            continue
        parts = re.split(r"[\n,]+", raw)
        if parts and len(parts) > 1:
            for part in parts:
                part = part.strip()
                if part:
                    items.append(part)
        else:
            items.append(raw)
    seen = []
    for item in items:
        if item not in seen:
            seen.append(item)
    return "\n".join(seen) if seen else None


def load_table_data(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    headers = {entry["index"]: entry["name"] for entry in data.get("headers", [])}
    rows = []
    for row in data.get("rows", []):
        cells = row.get("cells", [])
        values = {}
        for cell in cells:
            col_name = headers.get(cell.get("colIndex"))
            if col_name:
                values[col_name] = cell.get("text", "")
        values["row_id"] = row.get("rowId")
        rows.append(values)
    return rows


def load_image_data(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    images = {}
    sources = {}
    for row in data.get("rows", []):
        raw_name = row.get("name", "")
        name = normalize_name(raw_name)
        if not name or name.startswith("http"):
            continue
        image_url = row.get("imageUrl")
        if image_url and name not in images:
            images[name] = image_url
        href = row.get("href")
        if href and name not in sources:
            sources[name] = href
    return images, sources


def upsert_recipe(cursor, payload):
    cursor.execute(
        "SELECT id, image_url, notes, ingredients, instructions, source_url, servings, "
        "prep_time_minutes, cook_time_minutes, total_time_minutes, calories, protein_grams, "
        "fat_grams, carbs_grams FROM recipes WHERE lower(name) = lower(?)",
        (payload["name"],),
    )
    existing = cursor.fetchone()
    if not existing:
        cursor.execute(
            """
            INSERT INTO recipes (
              name,
              image_url,
              notes,
              ingredients,
              instructions,
              source_url,
              servings,
              prep_time_minutes,
              cook_time_minutes,
              total_time_minutes,
              calories,
              protein_grams,
              fat_grams,
              carbs_grams,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            """,
            (
                payload["name"],
                payload.get("image_url"),
                payload.get("notes"),
                payload.get("ingredients"),
                payload.get("instructions"),
                payload.get("source_url"),
                payload.get("servings"),
                payload.get("prep_time_minutes"),
                payload.get("cook_time_minutes"),
                payload.get("total_time_minutes"),
                payload.get("calories"),
                payload.get("protein_grams"),
                payload.get("fat_grams"),
                payload.get("carbs_grams"),
            ),
        )
        return "inserted"

    (
        recipe_id,
        image_url,
        notes,
        ingredients,
        instructions,
        source_url,
        servings,
        prep_time_minutes,
        cook_time_minutes,
        total_time_minutes,
        calories,
        protein_grams,
        fat_grams,
        carbs_grams,
    ) = existing
    updates = {}
    for key, current in [
        ("image_url", image_url),
        ("notes", notes),
        ("ingredients", ingredients),
        ("instructions", instructions),
        ("source_url", source_url),
        ("servings", servings),
        ("prep_time_minutes", prep_time_minutes),
        ("cook_time_minutes", cook_time_minutes),
        ("total_time_minutes", total_time_minutes),
        ("calories", calories),
        ("protein_grams", protein_grams),
        ("fat_grams", fat_grams),
        ("carbs_grams", carbs_grams),
    ]:
        incoming = payload.get(key)
        if incoming is None or incoming == "":
            continue
        if current in (None, ""):
            updates[key] = incoming
    if not updates:
        return "skipped"

    set_clause = ", ".join([f"{key} = ?" for key in updates])
    values = list(updates.values()) + [recipe_id]
    cursor.execute(
        f"UPDATE recipes SET {set_clause}, updated_at = datetime('now') WHERE id = ?",
        values,
    )
    return "updated"


def main():
    base_dir = Path(__file__).parent
    table_path = base_dir / "notion_table_view.json"
    image_path = base_dir / "notion_recipes_images.json"
    db_path = base_dir / "recipes.db"

    if not table_path.exists():
        raise SystemExit(f"Missing table data: {table_path}")
    if not image_path.exists():
        raise SystemExit(f"Missing image data: {image_path}")
    if not db_path.exists():
        raise SystemExit(f"Missing database: {db_path}")

    table_rows = load_table_data(table_path)
    image_map, source_map = load_image_data(image_path)

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    cursor = conn.cursor()

    summary = {"inserted": 0, "updated": 0, "skipped": 0}
    for row in table_rows:
        name = normalize_name(row.get("Name", ""))
        if not name or name.startswith("http"):
            continue

        calories = to_int(row.get("Calories/Serving"))
        carbs = to_int(row.get("Carbs/Serving"))
        fat = to_int(row.get("Fat/Serving"))
        protein = to_int(row.get("Protein/Serving"))
        servings = to_int(row.get("Servings"))
        ingredients = combine_ingredients(
            row.get("Fresh Ingredients"),
            row.get("Staple Ingredients"),
            row.get("Ingredients"),
        )

        note_parts = []
        notion_id = row.get("ID") or ""
        if notion_id.strip():
            note_parts.append(f"Notion ID: {notion_id.strip()}")
        row_id = row.get("row_id") or ""
        if row_id.strip():
            note_parts.append(f"Notion Row ID: {row_id.strip()}")
        notes = "\n".join(note_parts) if note_parts else None

        payload = {
            "name": name,
            "image_url": image_map.get(name),
            "notes": notes,
            "ingredients": ingredients,
            "instructions": None,
            "source_url": row.get("Source") or source_map.get(name),
            "servings": servings,
            "prep_time_minutes": None,
            "cook_time_minutes": None,
            "total_time_minutes": None,
            "calories": calories,
            "protein_grams": protein,
            "fat_grams": fat,
            "carbs_grams": carbs,
        }

        result = upsert_recipe(cursor, payload)
        summary[result] += 1

    conn.commit()
    conn.close()

    print(
        "Merge complete. "
        f"Inserted: {summary['inserted']}, "
        f"Updated: {summary['updated']}, "
        f"Skipped: {summary['skipped']}"
    )


if __name__ == "__main__":
    main()
