alter table public.people
  add column if not exists calorie_min numeric;

alter table public.people
  add column if not exists calorie_max numeric;

alter table public.people
  add column if not exists protein_min_grams numeric;

alter table public.people
  add column if not exists protein_max_grams numeric;
