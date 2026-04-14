-- Ingredient Variants: allow ingredients to have parent→child relationships
-- (e.g. "Butter" → "Unsalted Butter", "Salted Butter").
-- Run in Supabase SQL Editor → New query → paste → Run as role postgres on Primary database.

-- ---------------------------------------------------------------------------
-- 1. New columns on ingredients
-- ---------------------------------------------------------------------------
alter table public.ingredients
  add column if not exists parent_ingredient_id bigint
    references public.ingredients (id) on delete cascade;

alter table public.ingredients
  add column if not exists variant_sort_order integer not null default 0;

-- Index for efficient child lookups
create index if not exists idx_ingredients_parent
  on public.ingredients (parent_ingredient_id)
  where parent_ingredient_id is not null;
