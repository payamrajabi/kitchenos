#!/usr/bin/env python3
import json
import sqlite3
import sys
import urllib.request
from pathlib import Path


SUPABASE_URL = "https://ggwqnakrqttydigdsfko.supabase.co"
SUPABASE_KEY = "sb_publishable_YMd4Z4W-tZm3JvAyyJo8cg_UFIpfeFA"


def fetch_recipes(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
          id,
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
          created_at,
          updated_at
        FROM recipes
        ORDER BY id
        """
    )
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows


def fetch_ingredients(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
          id,
          name,
          created_at,
          updated_at
        FROM ingredients
        ORDER BY id
        """
    )
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows


def fetch_recipe_ingredients(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
          recipe_id,
          ingredient_id
        FROM recipe_ingredients
        ORDER BY recipe_id, ingredient_id
        """
    )
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows


def post_batch(table, records, conflict_key):
    url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={conflict_key}"
    data = json.dumps(records).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Prefer": "resolution=merge-duplicates,return=representation",
        },
    )
    with urllib.request.urlopen(request) as response:
        if response.status not in (200, 201):
            raise RuntimeError(f"Supabase insert failed: {response.status}")
        return response.read()


def main():
    db_path = Path(__file__).parent / "recipes.db"
    if not db_path.exists():
        raise SystemExit(f"Missing database: {db_path}")

    recipes = fetch_recipes(db_path)
    ingredients = fetch_ingredients(db_path)
    recipe_ingredients = fetch_recipe_ingredients(db_path)

    if not recipes and not ingredients and not recipe_ingredients:
        print("No data found to sync.")
        return

    batch_size = 100
    total = 0
    if recipes:
        for i in range(0, len(recipes), batch_size):
            batch = recipes[i : i + batch_size]
            post_batch("recipes", batch, "id")
            total += len(batch)
            print(f"Synced {total}/{len(recipes)} recipes")

    if ingredients:
        total = 0
        for i in range(0, len(ingredients), batch_size):
            batch = ingredients[i : i + batch_size]
            post_batch("ingredients", batch, "id")
            total += len(batch)
            print(f"Synced {total}/{len(ingredients)} ingredients")

    if recipe_ingredients:
        total = 0
        for i in range(0, len(recipe_ingredients), batch_size):
            batch = recipe_ingredients[i : i + batch_size]
            post_batch("recipe_ingredients", batch, "recipe_id,ingredient_id")
            total += len(batch)
            print(f"Synced {total}/{len(recipe_ingredients)} recipe ingredients")

    print("Sync complete.")


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8")
        print(f"Supabase error: {detail}")
        sys.exit(1)
