-- Ingredient nutrition: editable serving size (grams) for scaling per-100g macros in the UI.
-- Run in Supabase SQL Editor → New query → paste → Run as role postgres on Primary database.

alter table public.ingredients
  add column if not exists nutrition_serving_size_g real not null default 100;
