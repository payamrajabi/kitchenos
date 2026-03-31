#!/usr/bin/env python3
import csv
import re
import sqlite3
import sys
from pathlib import Path


SPLIT_RE = re.compile(r"[\n,;]+")
PRICE_RE = re.compile(r"-?\d+(?:\.\d+)?")


def normalize_name(value):
    if value is None:
        return ""
    return " ".join(str(value).split()).strip()


def split_ingredient_text(text):
    if not text:
        return []
    raw = str(text).strip()
    if not raw:
        return []
    parts = SPLIT_RE.split(raw)
    cleaned = []
    for part in parts:
        name = normalize_name(part)
        if name:
            cleaned.append(name)
    return cleaned


def ensure_tables(cursor):
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS ingredients (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          full_item_name TEXT,
          full_item_name_alt TEXT,
          current_stock TEXT,
          minimum_stock TEXT,
          maximum_stock TEXT,
          category TEXT,
          price REAL,
          preferred_vendor TEXT,
          brand_or_manufacturer TEXT,
          notes TEXT,
          ingredients_text TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )


def ensure_columns(cursor):
    cursor.execute("PRAGMA table_info(ingredients)")
    existing = {row[1] for row in cursor.fetchall()}
    columns = {
        "full_item_name": "TEXT",
        "full_item_name_alt": "TEXT",
        "current_stock": "TEXT",
        "minimum_stock": "TEXT",
        "maximum_stock": "TEXT",
        "category": "TEXT",
        "price": "REAL",
        "preferred_vendor": "TEXT",
        "brand_or_manufacturer": "TEXT",
        "notes": "TEXT",
        "ingredients_text": "TEXT",
    }
    for name, col_type in columns.items():
        if name not in existing:
            cursor.execute(f"ALTER TABLE ingredients ADD COLUMN {name} {col_type}")


def load_existing_names(cursor):
    cursor.execute("SELECT name FROM ingredients")
    return {row[0].lower(): row[0] for row in cursor.fetchall() if row[0]}


def normalize_optional(value):
    normalized = normalize_name(value)
    return normalized or None


def parse_price(value):
    raw = normalize_name(value)
    if not raw:
        return None
    cleaned = raw.replace("$", "").replace(",", "").strip()
    match = PRICE_RE.search(cleaned)
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def normalize_header(value):
    return normalize_name(value).lower()


def header_indices(header, name):
    target = normalize_header(name)
    return [idx for idx, col in enumerate(header) if normalize_header(col) == target]


def value_at(row, indices, fallback=None):
    if not indices:
        return fallback
    idx = indices[0]
    if idx >= len(row):
        return fallback
    return row[idx]


def split_full_item_names(header, row):
    indices = header_indices(header, "Full Item Name")
    first = normalize_optional(value_at(row, indices[:1]))
    second = normalize_optional(value_at(row, indices[1:2]))
    return first, second


def main():
    if len(sys.argv) < 2:
        print("Usage: import_ingredients_from_csv.py <path-to-csv>")
        raise SystemExit(1)

    csv_path = Path(sys.argv[1]).expanduser()
    if not csv_path.exists():
        raise SystemExit(f"CSV not found: {csv_path}")

    db_path = Path(__file__).parent / "recipes.db"
    if not db_path.exists():
        raise SystemExit(f"Missing database: {db_path}")

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    cursor = conn.cursor()
    ensure_tables(cursor)
    ensure_columns(cursor)
    existing = load_existing_names(cursor)

    with csv_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.reader(handle)
        header = next(reader, [])
        header_normalized = {normalize_header(col) for col in header}

        legacy_fields = {"fresh ingredients", "staple ingredients"}
        if legacy_fields & header_normalized:
            dict_reader = csv.DictReader(handle, fieldnames=header)
            collected = []
            for row in dict_reader:
                for field in ("Fresh Ingredients", "Staple Ingredients"):
                    value = row.get(field, "")
                    for name in split_ingredient_text(value):
                        collected.append(name)

            added = 0
            for name in collected:
                key = name.lower()
                if key in existing:
                    continue
                cursor.execute(
                    "INSERT INTO ingredients (name, updated_at) VALUES (?, datetime('now'))",
                    (name,),
                )
                existing[key] = name
                added += 1
            conn.commit()
            conn.close()
            print(f"Added {added} new ingredients from {csv_path}.")
            return

        item_name_idx = header_indices(header, "Item Name")
        current_stock_idx = header_indices(header, "Current Stock")
        minimum_idx = header_indices(header, "Minimum")
        maximum_idx = header_indices(header, "Maximum")
        category_idx = header_indices(header, "Category")
        price_idx = header_indices(header, "Price")
        vendor_idx = header_indices(header, "Preferred Vendor")
        brand_idx = header_indices(header, "Brand or Manufacturer")
        notes_idx = header_indices(header, "notes")
        ingredients_idx = header_indices(header, "Ingredients")

        added = 0
        updated = 0
        for row in reader:
            name = normalize_optional(value_at(row, item_name_idx))
            if not name:
                continue

            full_item_name, full_item_name_alt = split_full_item_names(header, row)
            current_stock = normalize_optional(value_at(row, current_stock_idx))
            minimum_stock = normalize_optional(value_at(row, minimum_idx))
            maximum_stock = normalize_optional(value_at(row, maximum_idx))
            category = normalize_optional(value_at(row, category_idx))
            price = parse_price(value_at(row, price_idx))
            preferred_vendor = normalize_optional(value_at(row, vendor_idx))
            brand_or_manufacturer = normalize_optional(value_at(row, brand_idx))
            notes = normalize_optional(value_at(row, notes_idx))
            ingredients_text = normalize_optional(value_at(row, ingredients_idx))

            cursor.execute(
                """
                INSERT INTO ingredients (
                    name,
                    full_item_name,
                    full_item_name_alt,
                    current_stock,
                    minimum_stock,
                    maximum_stock,
                    category,
                    price,
                    preferred_vendor,
                    brand_or_manufacturer,
                    notes,
                    ingredients_text,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(name) DO UPDATE SET
                    full_item_name = excluded.full_item_name,
                    full_item_name_alt = excluded.full_item_name_alt,
                    current_stock = excluded.current_stock,
                    minimum_stock = excluded.minimum_stock,
                    maximum_stock = excluded.maximum_stock,
                    category = excluded.category,
                    price = excluded.price,
                    preferred_vendor = excluded.preferred_vendor,
                    brand_or_manufacturer = excluded.brand_or_manufacturer,
                    notes = excluded.notes,
                    ingredients_text = excluded.ingredients_text,
                    updated_at = datetime('now')
                """,
                (
                    name,
                    full_item_name,
                    full_item_name_alt,
                    current_stock,
                    minimum_stock,
                    maximum_stock,
                    category,
                    price,
                    preferred_vendor,
                    brand_or_manufacturer,
                    notes,
                    ingredients_text,
                ),
            )

            key = name.lower()
            if key in existing:
                updated += 1
            else:
                existing[key] = name
                added += 1

    conn.commit()
    conn.close()
    print(f"Added {added} and updated {updated} ingredients from {csv_path}.")


if __name__ == "__main__":
    main()
