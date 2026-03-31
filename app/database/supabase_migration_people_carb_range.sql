-- Carb min/max (grams) for people profiles; run in Supabase SQL editor if missing.

alter table public.people
  add column if not exists carb_min_grams numeric;

alter table public.people
  add column if not exists carb_max_grams numeric;
