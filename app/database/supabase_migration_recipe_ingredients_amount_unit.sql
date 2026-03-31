-- Align recipe_ingredients with recipes-next (amount + unit per line item).
-- Run in Supabase SQL Editor if you see: column recipe_ingredients.amount does not exist
--
-- Safe to run multiple times (uses IF NOT EXISTS).

alter table public.recipe_ingredients
  add column if not exists amount text;

alter table public.recipe_ingredients
  add column if not exists unit text;

alter table public.recipe_ingredients
  add column if not exists created_at timestamptz default now();

comment on column public.recipe_ingredients.amount is 'Quantity needed for the recipe (freeform text, e.g. 1, 1/2, 250).';
comment on column public.recipe_ingredients.unit is 'Recipe unit (e.g. g, ml, cup) — matches app recipe unit list.';
