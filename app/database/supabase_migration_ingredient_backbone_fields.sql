-- Stage 1: Ingredient cataloguing backbone — additive schema alignment.
--
-- Aligns public.ingredients with the North America ingredient backbone research
-- (canonical name + variant, culinary subcategory tier, operational metadata,
-- aliases table) WITHOUT changing any existing data or behaviour. Every column
-- is nullable or has a safe default, every statement is idempotent, and no
-- existing columns are dropped.
--
-- How to run (Supabase dashboard):
--   SQL → New query → paste this file → Run as role `postgres` on the Primary
--   database. Safe to re-run; nothing changes on repeat runs once applied.

-- ---------------------------------------------------------------------------
-- 1) New columns on ingredients
-- ---------------------------------------------------------------------------
alter table public.ingredients
  add column if not exists variant                  text,
  add column if not exists taxonomy_subcategory     text,
  add column if not exists default_units            text[],
  add column if not exists storage_hints            text[],
  add column if not exists shelf_life_counter_days  integer,
  add column if not exists shelf_life_fridge_days   integer,
  add column if not exists shelf_life_freezer_days  integer,
  add column if not exists packaged_common          boolean not null default false,
  add column if not exists is_composite             boolean not null default false,
  add column if not exists backbone_id              text;

-- Column comments (for anyone browsing the schema in Supabase Studio).
comment on column public.ingredients.variant is
  'Form/state of the ingredient (e.g. "yellow", "canned diced", "dried"). Pairs with name to produce the human display label.';
comment on column public.ingredients.taxonomy_subcategory is
  'Culinary subcategory tier (e.g. "Alliums", "Leafy Greens", "Whole Grains"). Sits between grocery_category and the ingredient itself.';
comment on column public.ingredients.default_units is
  'Sensible default units for this ingredient in inventory/recipe contexts (e.g. {g, oz, lb, each}).';
comment on column public.ingredients.storage_hints is
  'Where this ingredient can live: any subset of {counter, pantry, fridge, freezer}.';
comment on column public.ingredients.shelf_life_counter_days is
  'Rough shelf life on the counter, in days. Informational; not a food-safety guarantee.';
comment on column public.ingredients.shelf_life_fridge_days is
  'Rough shelf life in the fridge, in days. Informational; not a food-safety guarantee.';
comment on column public.ingredients.shelf_life_freezer_days is
  'Rough shelf life in the freezer, in days. Informational; not a food-safety guarantee.';
comment on column public.ingredients.packaged_common is
  'True when this ingredient is commonly encountered in barcode-bearing packaged form at retail.';
comment on column public.ingredients.is_composite is
  'True for prepared inputs (stock, tofu, salsa, mayo, miso, nut butter) rather than single-ingredient commodities.';
comment on column public.ingredients.backbone_id is
  'Stable machine slug matching the North America ingredient backbone taxonomy (e.g. "produce.vegetables.alliums.onion.yellow").';

-- ---------------------------------------------------------------------------
-- 2) Sanity constraints on the new columns
-- ---------------------------------------------------------------------------

-- Storage hints must be drawn from a fixed vocabulary when set.
alter table public.ingredients
  drop constraint if exists ingredients_storage_hints_vals;
alter table public.ingredients
  add constraint ingredients_storage_hints_vals
  check (
    storage_hints is null
    or storage_hints <@ array['counter','pantry','fridge','freezer']::text[]
  );

-- Shelf-life ranges must be non-negative when set.
alter table public.ingredients
  drop constraint if exists ingredients_shelf_life_counter_nonneg;
alter table public.ingredients
  add constraint ingredients_shelf_life_counter_nonneg
  check (shelf_life_counter_days is null or shelf_life_counter_days >= 0);

alter table public.ingredients
  drop constraint if exists ingredients_shelf_life_fridge_nonneg;
alter table public.ingredients
  add constraint ingredients_shelf_life_fridge_nonneg
  check (shelf_life_fridge_days is null or shelf_life_fridge_days >= 0);

alter table public.ingredients
  drop constraint if exists ingredients_shelf_life_freezer_nonneg;
alter table public.ingredients
  add constraint ingredients_shelf_life_freezer_nonneg
  check (shelf_life_freezer_days is null or shelf_life_freezer_days >= 0);

-- ---------------------------------------------------------------------------
-- 3) Indexes that will actually be used
-- ---------------------------------------------------------------------------

-- Filter/group by subcategory is expected once the UI starts surfacing it.
create index if not exists idx_ingredients_taxonomy_subcategory
  on public.ingredients (taxonomy_subcategory)
  where taxonomy_subcategory is not null;

-- backbone_id is a stable external key; enforce uniqueness where present.
create unique index if not exists ux_ingredients_backbone_id
  on public.ingredients (backbone_id)
  where backbone_id is not null;

-- ---------------------------------------------------------------------------
-- 4) Ingredient aliases table
-- ---------------------------------------------------------------------------
-- Replaces the single `full_item_name_alt` text column with a real many-to-one
-- alias store. The legacy column is kept in place for now; a later migration
-- can drop it once nothing reads it.

create table if not exists public.ingredient_aliases (
  id            bigint generated by default as identity primary key,
  ingredient_id bigint not null references public.ingredients(id) on delete cascade,
  alias         text   not null,
  source        text,
  created_at    timestamptz not null default now()
);

comment on table public.ingredient_aliases is
  'Synonyms mapping to a canonical ingredient. Used by import/resolve pipelines for fuzzy matching (e.g. "coriander leaves" -> "Cilantro").';
comment on column public.ingredient_aliases.source is
  'Where this alias came from: user | import | backbone | openfoodfacts | legacy.';

-- Case-insensitive uniqueness per ingredient.
create unique index if not exists ux_ingredient_aliases_lower
  on public.ingredient_aliases (ingredient_id, lower(alias));

-- Lookup index for resolve-by-alias.
create index if not exists idx_ingredient_aliases_lookup
  on public.ingredient_aliases (lower(alias));

-- ---------------------------------------------------------------------------
-- 5) One-time backfill: move legacy `full_item_name_alt` strings into aliases
-- ---------------------------------------------------------------------------
-- Idempotent: the unique index makes re-runs a no-op.

insert into public.ingredient_aliases (ingredient_id, alias, source)
select
  i.id,
  trim(a) as alias,
  'legacy' as source
from public.ingredients i,
     lateral unnest(string_to_array(coalesce(i.full_item_name_alt, ''), ',')) as a
where trim(a) <> ''
on conflict do nothing;
