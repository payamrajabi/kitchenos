#!/usr/bin/env python3
import re
import sqlite3
from pathlib import Path


SPLIT_RE = re.compile(r"[\n,;]+")
CAMEL_SPLIT_RE = re.compile(r"(?<=[a-z\)])(?=[A-Z])")


def normalize_name(value):
    if value is None:
        return ""
    value = " ".join(str(value).split())
    return value.strip()


def split_ingredient_text(text):
    if not text:
        return []
    raw = str(text).strip()
    if not raw:
        return []
    if SPLIT_RE.search(raw):
        parts = SPLIT_RE.split(raw)
    else:
        parts = CAMEL_SPLIT_RE.split(raw)
    cleaned = []
    for part in parts:
        part = normalize_name(part)
        if not part:
            continue
        cleaned.append(part)
    return cleaned


def extract_ingredients(ingredient_blob):
    items = []
    for line in split_ingredient_text(ingredient_blob):
        cleaned = re.sub(r"^[\-\*]+\s*", "", line)
        cleaned = re.sub(r"^\d+\.\s*", "", cleaned)
        cleaned = normalize_name(cleaned)
        if cleaned:
            items.append(cleaned)
    return items


def ensure_tables(cursor):
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS ingredients (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS recipe_ingredients (
          recipe_id INTEGER NOT NULL,
          ingredient_id INTEGER NOT NULL,
          PRIMARY KEY (recipe_id, ingredient_id),
          FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
          FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE
        )
        """
    )


def upsert_ingredient(cursor, name):
    cursor.execute("SELECT id FROM ingredients WHERE lower(name) = lower(?)", (name,))
    row = cursor.fetchone()
    if row:
        return row[0]
    cursor.execute(
        "INSERT INTO ingredients (name, updated_at) VALUES (?, datetime('now'))",
        (name,),
    )
    return cursor.lastrowid


def main():
    db_path = Path(__file__).parent / "recipes.db"
    if not db_path.exists():
        raise SystemExit(f"Missing database: {db_path}")

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    cursor = conn.cursor()
    ensure_tables(cursor)

    cursor.execute("SELECT id, ingredients FROM recipes ORDER BY id")
    rows = cursor.fetchall()

    created = 0
    mapped = 0
    for recipe_id, ingredient_blob in rows:
        if not ingredient_blob:
            continue
        names = extract_ingredients(ingredient_blob)
        if not names:
            continue
        for name in names:
            ingredient_id = upsert_ingredient(cursor, name)
            cursor.execute(
                """
                INSERT OR IGNORE INTO recipe_ingredients (recipe_id, ingredient_id)
                VALUES (?, ?)
                """,
                (recipe_id, ingredient_id),
            )
            mapped += cursor.rowcount
        created += len(names)

    conn.commit()
    conn.close()
    print(f"Processed {created} ingredient entries. Linked {mapped} recipe ingredients.")


if __name__ == "__main__":
    main()
