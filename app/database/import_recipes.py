#!/usr/bin/env python3
import csv
import sqlite3
import sys
from pathlib import Path


def get_or_create_id(cursor, table, name):
    cursor.execute(f"INSERT OR IGNORE INTO {table} (name) VALUES (?)", (name,))
    cursor.execute(f"SELECT id FROM {table} WHERE name = ?", (name,))
    row = cursor.fetchone()
    return row[0] if row else None


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


def main():
    if len(sys.argv) != 2:
        print("Usage: python3 import_recipes.py /path/to/recipes.csv")
        sys.exit(1)

    csv_path = Path(sys.argv[1]).expanduser().resolve()
    if not csv_path.exists():
        print(f"CSV file not found: {csv_path}")
        sys.exit(1)

    db_path = Path(__file__).parent / "recipes.db"
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    cursor = conn.cursor()

    with csv_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            print("CSV has no headers.")
            sys.exit(1)

        for row in reader:
            name = (row.get("name") or "").strip()
            if not name:
                continue

            category_name = (row.get("category") or "").strip()
            category_id = None
            if category_name:
                category_id = get_or_create_id(cursor, "recipe_categories", category_name)

            cursor.execute(
                """
                INSERT INTO recipes (
                  name,
                  category_id,
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
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                """,
                (
                    name,
                    category_id,
                    (row.get("image_url") or "").strip() or None,
                    (row.get("notes") or "").strip() or None,
                    (row.get("ingredients") or "").strip() or None,
                    (row.get("instructions") or "").strip() or None,
                    (row.get("source_url") or "").strip() or None,
                    to_int(row.get("servings")),
                    to_int(row.get("prep_time_minutes")),
                    to_int(row.get("cook_time_minutes")),
                    to_int(row.get("total_time_minutes")),
                    to_int(row.get("calories")),
                    to_int(row.get("protein_grams")),
                    to_int(row.get("fat_grams")),
                    to_int(row.get("carbs_grams")),
                ),
            )
            recipe_id = cursor.lastrowid

            tags_raw = row.get("tags") or ""
            tags = [t.strip() for t in tags_raw.split(",") if t.strip()]
            for tag in tags:
                tag_id = get_or_create_id(cursor, "recipe_tags", tag)
                if tag_id:
                    cursor.execute(
                        "INSERT OR IGNORE INTO recipe_tag_map (recipe_id, tag_id) VALUES (?, ?)",
                        (recipe_id, tag_id),
                    )

    conn.commit()
    conn.close()
    print(f"Imported recipes into {db_path}")


if __name__ == "__main__":
    main()
