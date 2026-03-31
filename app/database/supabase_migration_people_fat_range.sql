-- Migration: replace fat_target_grams + carb_target_grams with fat_min_grams + fat_max_grams
-- Carbs are now derived from remaining calories after protein and fat.

begin;

alter table public.people
  add column if not exists fat_min_grams numeric,
  add column if not exists fat_max_grams numeric;

-- Carry existing fat target into both min and max so no data is lost
update public.people
set fat_min_grams = fat_target_grams,
    fat_max_grams = fat_target_grams
where fat_target_grams is not null
  and fat_min_grams is null;

alter table public.people
  drop column if exists fat_target_grams,
  drop column if exists carb_target_grams;

commit;
