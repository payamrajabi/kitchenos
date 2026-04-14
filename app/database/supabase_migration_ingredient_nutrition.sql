-- Ingredient Nutrition Autofill: add nutrition columns and provenance tracking.
-- Run in Supabase SQL Editor → New query → paste → Run as role postgres on Primary database.

-- ---------------------------------------------------------------------------
-- 1. Core nutrition values
-- ---------------------------------------------------------------------------
alter table public.ingredients
  add column if not exists kcal real;

alter table public.ingredients
  add column if not exists fat_g real;

alter table public.ingredients
  add column if not exists protein_g real;

alter table public.ingredients
  add column if not exists carbs_g real;

-- ---------------------------------------------------------------------------
-- 2. Basis & unit weight
-- ---------------------------------------------------------------------------
alter table public.ingredients
  add column if not exists nutrition_basis text
    check (nutrition_basis in ('per_100g', 'per_unit'));

alter table public.ingredients
  add column if not exists canonical_unit_weight_g real;

-- ---------------------------------------------------------------------------
-- 3. Provenance (source tracking — never save guessed values without this)
-- ---------------------------------------------------------------------------
alter table public.ingredients
  add column if not exists nutrition_source_name text;

alter table public.ingredients
  add column if not exists nutrition_source_record_id text;

alter table public.ingredients
  add column if not exists nutrition_source_url text;

alter table public.ingredients
  add column if not exists nutrition_confidence real
    check (nutrition_confidence >= 0 and nutrition_confidence <= 1);

alter table public.ingredients
  add column if not exists nutrition_needs_review boolean not null default false;

alter table public.ingredients
  add column if not exists nutrition_notes text;
