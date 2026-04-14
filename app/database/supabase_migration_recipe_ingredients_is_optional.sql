-- Optional flag per recipe ingredient line (checkbox in recipe editor).
-- Run in Supabase SQL Editor if the app reports a missing column on recipe_ingredients.

alter table public.recipe_ingredients
  add column if not exists is_optional boolean not null default false;

comment on column public.recipe_ingredients.is_optional is 'When true, this line is treated as optional (e.g. garnish).';
