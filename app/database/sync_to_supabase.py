#!/usr/bin/env python3
"""
Bulk push SQLite → Supabase (bypasses RLS). Requires the service role key — never ship it to clients.

  export SUPABASE_URL="https://xxx.supabase.co"
  export SUPABASE_SERVICE_ROLE_KEY="eyJ..."
  python3 app/database/sync_to_supabase.py

Optional — attach rows to one account (v2 RLS) so they are visible after sign-in:

  export KITCHENOS_OWNER_EMAIL="you@example.com"
  python3 app/database/sync_to_supabase.py
"""
import json
import os
import sqlite3
import sys
import urllib.request
from pathlib import Path


def get_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing environment variable: {name}")
    return value


SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()


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


def auth_admin_get_user_id_by_email(base_url: str, service_key: str, email: str) -> str:
    """Resolve auth.users.id via GoTrue admin API (service role)."""
    want = email.strip().lower()
    page = 1
    per_page = 200
    headers = {
        "Authorization": f"Bearer {service_key}",
        "apikey": service_key,
    }
    while page <= 500:
        url = f"{base_url}/auth/v1/admin/users?page={page}&per_page={per_page}"
        request = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(request) as response:
            payload = json.loads(response.read().decode())
        users = payload.get("users") or []
        for user in users:
            if (user.get("email") or "").strip().lower() == want:
                return user["id"]
        if len(users) < per_page:
            break
        page += 1
    raise SystemExit(f"No auth user found with email {email!r} (sign up once, then retry).")


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
    global SUPABASE_URL, SUPABASE_KEY
    if not SUPABASE_URL:
        SUPABASE_URL = get_env("SUPABASE_URL").rstrip("/")
    if not SUPABASE_KEY:
        SUPABASE_KEY = get_env("SUPABASE_SERVICE_ROLE_KEY")

    db_path = Path(__file__).parent / "recipes.db"
    if not db_path.exists():
        raise SystemExit(f"Missing database: {db_path}")

    recipes = fetch_recipes(db_path)
    ingredients = fetch_ingredients(db_path)
    recipe_ingredients = fetch_recipe_ingredients(db_path)

    owner_email = os.environ.get("KITCHENOS_OWNER_EMAIL", "").strip()
    if owner_email:
        uid = auth_admin_get_user_id_by_email(SUPABASE_URL, SUPABASE_KEY, owner_email)
        for row in recipes:
            row["owner_id"] = uid
        for row in ingredients:
            row["owner_id"] = uid
        print(f"owner_id set for {owner_email} on recipes and ingredients.")

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
