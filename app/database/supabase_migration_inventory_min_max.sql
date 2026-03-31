-- Optional: per-location min/max quantities for kitchen stock UI.
-- Run in Supabase SQL Editor if inventory_items already exists.

alter table public.inventory_items
  add column if not exists min_quantity numeric;

alter table public.inventory_items
  add column if not exists max_quantity numeric;
