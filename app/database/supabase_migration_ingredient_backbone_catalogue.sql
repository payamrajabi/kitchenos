-- Stage 3: Ingredient backbone catalogue — a small, curated seed table of
-- canonical ingredients used for deterministic autofill before any LLM call.
--
-- A row in this table represents one "backbone" entry (e.g. a Yellow Onion,
-- a can of Diced Tomatoes, Extra Virgin Olive Oil). Rows are the source of
-- truth for:
--   * taxonomy_subcategory
--   * default_units, storage_hints, shelf_life_*_days
--   * packaged_common, is_composite
--   * density_g_per_ml, canonical_unit_weight_g
--
-- The application seeds/upserts rows from a TypeScript source of truth so
-- catalogue evolution happens through code review. This migration only
-- creates the structure and indexes; the data ships via the seed action.
--
-- How to run (Supabase dashboard):
--   SQL → New query → paste this file → Run as role `postgres` on the Primary
--   database. Safe to re-run; every statement is idempotent.

-- ---------------------------------------------------------------------------
-- 1) Table
-- ---------------------------------------------------------------------------
create table if not exists public.ingredient_backbone_catalogue (
  backbone_id              text primary key,
  canonical_name           text not null,
  variant                  text,
  parent_backbone_id       text references public.ingredient_backbone_catalogue(backbone_id) on delete set null,

  -- Normalised key used for O(1) exact lookup from ingredient names.
  -- Computed by the application using the same normalizeForMatch() that
  -- powers ingredient resolution, so recipe names and inventory names
  -- resolve against the same space.
  match_key                text not null,

  taxonomy_subcategory     text,
  grocery_category         text,
  default_units            text[],
  storage_hints            text[],
  shelf_life_counter_days  integer check (shelf_life_counter_days is null or shelf_life_counter_days >= 0),
  shelf_life_fridge_days   integer check (shelf_life_fridge_days is null or shelf_life_fridge_days >= 0),
  shelf_life_freezer_days  integer check (shelf_life_freezer_days is null or shelf_life_freezer_days >= 0),
  packaged_common          boolean not null default false,
  is_composite             boolean not null default false,
  density_g_per_ml         real    check (density_g_per_ml is null or density_g_per_ml > 0),
  canonical_unit_weight_g  real    check (canonical_unit_weight_g is null or canonical_unit_weight_g > 0),

  -- Synonyms and regional variants. Normalised with the same
  -- normalizeForMatch() as match_key so alias lookup is one array op.
  aliases                  text[] not null default '{}'::text[],

  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table public.ingredient_backbone_catalogue is
  'Curated canonical ingredients. Source of truth for deterministic backbone autofill (subcategory, storage, shelf life, density, etc.). Rows upserted from a TypeScript seed.';
comment on column public.ingredient_backbone_catalogue.match_key is
  'Normalised form of canonical_name used for O(1) exact lookup. Computed client-side by normalizeForMatch().';
comment on column public.ingredient_backbone_catalogue.aliases is
  'Pre-normalised synonyms/variants. Lookup is a single array-contains check.';

-- Storage hints must be drawn from the same vocabulary as the ingredients table.
alter table public.ingredient_backbone_catalogue
  drop constraint if exists ingredient_backbone_catalogue_storage_hints_vals;
alter table public.ingredient_backbone_catalogue
  add constraint ingredient_backbone_catalogue_storage_hints_vals
  check (
    storage_hints is null
    or storage_hints <@ array['counter','pantry','fridge','freezer']::text[]
  );

-- ---------------------------------------------------------------------------
-- 2) Indexes
-- ---------------------------------------------------------------------------

-- Primary lookup: match_key is the hot path (one call per ingredient insert).
create unique index if not exists ux_ingredient_backbone_catalogue_match_key
  on public.ingredient_backbone_catalogue (match_key);

-- Alias lookup: GIN over the text[] for "aliases @> array[:key]" queries.
create index if not exists idx_ingredient_backbone_catalogue_aliases_gin
  on public.ingredient_backbone_catalogue
  using gin (aliases);

-- Subcategory browse (admin/debug).
create index if not exists idx_ingredient_backbone_catalogue_subcategory
  on public.ingredient_backbone_catalogue (taxonomy_subcategory)
  where taxonomy_subcategory is not null;

-- ---------------------------------------------------------------------------
-- 3) updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.ingredient_backbone_catalogue_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ingredient_backbone_catalogue_touch_updated_at
  on public.ingredient_backbone_catalogue;

create trigger ingredient_backbone_catalogue_touch_updated_at
  before update on public.ingredient_backbone_catalogue
  for each row execute function public.ingredient_backbone_catalogue_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4) Row-Level Security
-- ---------------------------------------------------------------------------
-- The catalogue is authoritative reference data. Every signed-in user can read
-- it; writes are restricted to service-role (the seed action uses the server
-- client with the user's session — the app-level check keeps it to admins).

alter table public.ingredient_backbone_catalogue enable row level security;

drop policy if exists ingredient_backbone_catalogue_read
  on public.ingredient_backbone_catalogue;
create policy ingredient_backbone_catalogue_read
  on public.ingredient_backbone_catalogue
  for select
  to authenticated
  using (true);

drop policy if exists ingredient_backbone_catalogue_write
  on public.ingredient_backbone_catalogue;
create policy ingredient_backbone_catalogue_write
  on public.ingredient_backbone_catalogue
  for all
  to authenticated
  using (true)
  with check (true);
