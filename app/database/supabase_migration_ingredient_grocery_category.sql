-- Store-aisle grocery category (Produce, Pantry, etc.). Separate from `category`,
-- which stores fridge / freezer / pantry hints for inventory routing.
-- Run in Supabase: SQL → New query → Run as postgres on Primary.

alter table public.ingredients
  add column if not exists grocery_category text;

comment on column public.ingredients.grocery_category is 'Grocery store section (Produce, Meat & Seafood, Pantry, …). Distinct from category (storage hint).';
