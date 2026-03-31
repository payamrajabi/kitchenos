# Recipe Database Setup

This folder contains a SQLite recipe database, Supabase SQL, and import/sync scripts.

## Supabase (cloud)

- [supabase_setup.sql](supabase_setup.sql) — initial tables and seed equipment.
- [supabase_migration_kitchenos_v2.sql](supabase_migration_kitchenos_v2.sql) — per-user RLS, `inventory_items`, `user_equipment`, `meal_plans` / `meal_plan_entries`, storage policies. Run after `supabase_setup.sql` on existing projects. **Production:** confirm this migration (or equivalent policies) is applied so `owner_id = auth.uid()` isolates data; rows with `owner_id IS NULL` are legacy/shared until you backfill or delete them.

Bulk sync from SQLite uses **service role** (bypasses RLS): set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then run `sync_to_supabase.py`.

## 1) Create the database

Run this once to create the tables:

```
sqlite3 app/database/recipes.db < app/database/schema.sql
```

## 2) Export from Notion

Export the Notion database as CSV. Ensure these column names exist:

- `name` (required)
- `category` (e.g. Breakfast, Lunch & Dinner, Dressings)
- `tags` (comma-separated)
- `image_url`
- `notes`
- `ingredients`
- `instructions`
- `source_url`
- `servings`
- `prep_time_minutes`
- `cook_time_minutes`
- `total_time_minutes`
- `calories`
- `protein_grams`
- `fat_grams`
- `carbs_grams`

## 3) Import CSV

```
python3 app/database/import_recipes.py /path/to/recipes.csv
```

## 4) Quick query examples

```
sqlite3 app/database/recipes.db "SELECT name FROM recipes LIMIT 10;"
sqlite3 app/database/recipes.db "SELECT name FROM recipes WHERE calories < 500;"
```

## 5) Build ingredients relations

After importing or merging recipes, populate the ingredients tables:

```
python3 app/database/build_ingredients_from_recipes.py
```
