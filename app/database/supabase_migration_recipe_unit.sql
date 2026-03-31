-- Add recipe_unit column to inventory_items.
-- "unit" = the stock/inventory unit (jars, bottles, bunches, etc.)
-- "recipe_unit" = the cooking/recipe measurement (g, ml, tsp, tbsp, cup, etc.)
-- Run in Supabase SQL Editor after supabase_migration_kitchenos_v2.sql.

alter table public.inventory_items
  add column if not exists recipe_unit text;
