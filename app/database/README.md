# Recipe Database Setup

This folder contains a simple SQLite recipe database and an import script.

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
