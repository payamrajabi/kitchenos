-- One-time data cleanup: remove the whole word "organic" (any case) from
-- ingredient and inventory-adjacent text. Safe to re-run; already-clean rows no-op.
--
-- How to run: Supabase Dashboard → SQL → New query → paste this file → Run as postgres.
--
-- Note: If stripping a name would match another ingredient you already have for the same
-- owner (unique on lower(name) per owner), that row is skipped for the name column only.
-- Run the final SELECT to see any remaining names that still contain "organic".

begin;

-- ---------------------------------------------------------------------------
-- Helper: strip whole word only; collapse spaces; empty string → NULL for optional cols
-- ---------------------------------------------------------------------------
create or replace function public._kitchenos_strip_organic_word(t text)
returns text
language sql
immutable
as $$
  select case
    when t is null then null
    else nullif(
      trim(regexp_replace(regexp_replace(t, '\morganic\M', '', 'gi'), '\s+', ' ', 'g')),
      ''
    )
  end;
$$;

-- ---------------------------------------------------------------------------
-- public.ingredients: all user-facing text except PK / numeric / FK columns
-- ---------------------------------------------------------------------------
update public.ingredients i
set
  full_item_name = public._kitchenos_strip_organic_word(i.full_item_name),
  full_item_name_alt = public._kitchenos_strip_organic_word(i.full_item_name_alt),
  preferred_vendor = public._kitchenos_strip_organic_word(i.preferred_vendor),
  brand_or_manufacturer = public._kitchenos_strip_organic_word(i.brand_or_manufacturer),
  notes = public._kitchenos_strip_organic_word(i.notes),
  ingredients_text = public._kitchenos_strip_organic_word(i.ingredients_text),
  category = public._kitchenos_strip_organic_word(i.category),
  grocery_category = public._kitchenos_strip_organic_word(i.grocery_category),
  nutrition_source_name = public._kitchenos_strip_organic_word(i.nutrition_source_name),
  nutrition_notes = public._kitchenos_strip_organic_word(i.nutrition_notes),
  updated_at = now()
where
  i.full_item_name ~* '\morganic\M'
  or i.full_item_name_alt ~* '\morganic\M'
  or i.preferred_vendor ~* '\morganic\M'
  or i.brand_or_manufacturer ~* '\morganic\M'
  or i.notes ~* '\morganic\M'
  or i.ingredients_text ~* '\morganic\M'
  or i.category ~* '\morganic\M'
  or i.grocery_category ~* '\morganic\M'
  or i.nutrition_source_name ~* '\morganic\M'
  or i.nutrition_notes ~* '\morganic\M';

-- Name: respect per-owner uniqueness (see header comment).
update public.ingredients i
set
  name = cleaned.new_name,
  updated_at = now()
from (
  select
    id,
    public._kitchenos_strip_organic_word(name) as new_name
  from public.ingredients
  where name ~* '\morganic\M'
) cleaned
where i.id = cleaned.id
  and cleaned.new_name is not null
  and cleaned.new_name <> i.name
  and not exists (
    select 1
    from public.ingredients other
    where other.id <> i.id
      and other.owner_id is not distinct from i.owner_id
      and lower(other.name) = lower(cleaned.new_name)
  );

-- ---------------------------------------------------------------------------
-- public.inventory_items: line notes (displayed with stock)
-- ---------------------------------------------------------------------------
update public.inventory_items inv
set
  notes = public._kitchenos_strip_organic_word(inv.notes),
  updated_at = now()
where inv.notes is not null
  and inv.notes ~* '\morganic\M';

-- ---------------------------------------------------------------------------
-- public.shopping_items: free-text name / notes (often mirrors ingredients)
-- ---------------------------------------------------------------------------
update public.shopping_items s
set
  name = coalesce(nullif(public._kitchenos_strip_organic_word(s.name), ''), s.name),
  notes = public._kitchenos_strip_organic_word(s.notes),
  updated_at = now()
where (s.name ~* '\morganic\M' or (s.notes is not null and s.notes ~* '\morganic\M'));

drop function if exists public._kitchenos_strip_organic_word(text);

commit;

-- Rows whose name still contains "organic" (usually blocked by duplicate name).
select id, owner_id, name
from public.ingredients
where name ~* '\morganic\M'
order by id;
