alter table public.people
  add column if not exists fat_target_grams numeric;

alter table public.people
  add column if not exists carb_target_grams numeric;
