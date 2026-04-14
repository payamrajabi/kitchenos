-- Servings per planned meal (default 4). Run in Supabase SQL editor if not already applied.

alter table public.meal_plan_entries
  add column if not exists servings integer not null default 4;
