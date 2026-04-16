-- Ingredient taxonomy: group common produce into two-level families (parent + variants).
-- Fresh vs dried/powder vs prepared (garlic) are separate parents where applicable.
-- Safe rules: only top-level rows (parent_ingredient_id is null) that are not already
-- parents of other rows are reparented. Already-nested ingredients are left unchanged.
--
-- How to run (Supabase dashboard): SQL → New query → paste → Run as role postgres on Primary.
-- Re-runnable: skips rows already under a parent; reuses existing parent rows by exact name.

-- ---------------------------------------------------------------------------
-- Prereqs (no-op if already applied)
-- ---------------------------------------------------------------------------
alter table public.ingredients
  add column if not exists parent_ingredient_id bigint
    references public.ingredients (id) on delete cascade;

alter table public.ingredients
  add column if not exists variant_sort_order integer not null default 0;

create index if not exists idx_ingredients_parent
  on public.ingredients (parent_ingredient_id)
  where parent_ingredient_id is not null;

-- ---------------------------------------------------------------------------
-- 1) Reparent + create canonical parents (per owner_id bucket, including null legacy)
-- ---------------------------------------------------------------------------
do $body$
declare
  r_own record;
  pid bigint;
begin
  for r_own in
    select distinct owner_id as owner_id from public.ingredients
  loop
    -- ---------- Fresh Onions ----------
    pid := null;
    select i.id into pid
    from public.ingredients i
    where i.owner_id is not distinct from r_own.owner_id
      and lower(trim(i.name)) = 'fresh onions'
    limit 1;

    if pid is null then
      insert into public.ingredients (name, owner_id, grocery_category, parent_ingredient_id, variant_sort_order)
      values ('Fresh Onions', r_own.owner_id, 'Produce', null, 0)
      returning id into pid;
    end if;

    update public.ingredients i
    set
      parent_ingredient_id = pid,
      updated_at = now()
    where i.owner_id is not distinct from r_own.owner_id
      and i.id <> pid
      and i.parent_ingredient_id is null
      and not exists (
        select 1 from public.ingredients c where c.parent_ingredient_id = i.id
      )
      and lower(trim(regexp_replace(i.name, '^\s*(organic|org\.?)\s+', '', 'i'))) !~ '(powder|dehydrat|flake|dried\s+minced)'
      and (
        lower(trim(regexp_replace(i.name, '^\s*(organic|org\.?)\s+', '', 'i'))) ~ '^(green|spring) onions?$'
        or lower(trim(regexp_replace(i.name, '^\s*(organic|org\.?)\s+', '', 'i'))) = 'scallions'
        or lower(trim(regexp_replace(i.name, '^\s*(organic|org\.?)\s+', '', 'i'))) ~ '^(red|white|yellow|sweet|vidalia|pearl) onions?$'
        or lower(trim(regexp_replace(i.name, '^\s*(organic|org\.?)\s+', '', 'i'))) ~ '^walla\s+walla onions?$'
        or lower(trim(regexp_replace(i.name, '^\s*(organic|org\.?)\s+', '', 'i'))) = 'shallots'
        or lower(trim(regexp_replace(i.name, '^\s*(organic|org\.?)\s+', '', 'i'))) ~ '^shallot$'
      );

    -- ---------- Dried Onions ----------
    pid := null;
    select i.id into pid
    from public.ingredients i
    where i.owner_id is not distinct from r_own.owner_id
      and lower(trim(i.name)) = 'dried onions'
    limit 1;

    if pid is null then
      insert into public.ingredients (name, owner_id, grocery_category, parent_ingredient_id, variant_sort_order)
      values ('Dried Onions', r_own.owner_id, 'Pantry', null, 0)
      returning id into pid;
    end if;

    update public.ingredients i
    set
      parent_ingredient_id = pid,
      updated_at = now()
    where i.owner_id is not distinct from r_own.owner_id
      and i.id <> pid
      and i.parent_ingredient_id is null
      and not exists (
        select 1 from public.ingredients c where c.parent_ingredient_id = i.id
      )
      and (
        lower(trim(i.name)) ~ 'onion.*powder'
        or lower(trim(i.name)) ~ '^dehydrated onions?$'
        or lower(trim(i.name)) ~ '^dried onions?$'
        or lower(trim(i.name)) ~ 'onion flakes'
        or lower(trim(i.name)) ~ '^dried minced onion'
      );

    -- ---------- Fresh Garlic ----------
    pid := null;
    select i.id into pid
    from public.ingredients i
    where i.owner_id is not distinct from r_own.owner_id
      and lower(trim(i.name)) = 'fresh garlic'
    limit 1;

    if pid is null then
      insert into public.ingredients (name, owner_id, grocery_category, parent_ingredient_id, variant_sort_order)
      values ('Fresh Garlic', r_own.owner_id, 'Produce', null, 0)
      returning id into pid;
    end if;

    update public.ingredients i
    set
      parent_ingredient_id = pid,
      updated_at = now()
    where i.owner_id is not distinct from r_own.owner_id
      and i.id <> pid
      and i.parent_ingredient_id is null
      and not exists (
        select 1 from public.ingredients c where c.parent_ingredient_id = i.id
      )
      and lower(trim(i.name)) !~ 'roasted'
      and lower(trim(i.name)) !~ 'powder'
      and lower(trim(i.name)) !~ 'minced'
      and lower(trim(i.name)) !~ 'paste'
      and lower(trim(i.name)) !~ 'jarred'
      and lower(trim(i.name)) !~ 'squeeze'
      and (
        lower(trim(i.name)) in ('garlic', 'garlic bulb', 'garlic bulbs', 'raw garlic')
        or lower(trim(i.name)) ~ '^garlic heads?$'
        or lower(trim(i.name)) ~ '^fresh garlic$'
      );

    -- ---------- Prepared Garlic ----------
    pid := null;
    select i.id into pid
    from public.ingredients i
    where i.owner_id is not distinct from r_own.owner_id
      and lower(trim(i.name)) = 'prepared garlic'
    limit 1;

    if pid is null then
      insert into public.ingredients (name, owner_id, grocery_category, parent_ingredient_id, variant_sort_order)
      values ('Prepared Garlic', r_own.owner_id, 'Pantry', null, 0)
      returning id into pid;
    end if;

    update public.ingredients i
    set
      parent_ingredient_id = pid,
      updated_at = now()
    where i.owner_id is not distinct from r_own.owner_id
      and i.id <> pid
      and i.parent_ingredient_id is null
      and not exists (
        select 1 from public.ingredients c where c.parent_ingredient_id = i.id
      )
      and (
        lower(trim(i.name)) in ('minced garlic', 'jarred garlic', 'crushed garlic', 'garlic paste')
        or lower(trim(i.name)) ~ '^roasted garlic$'
      );

    -- ---------- Dried Garlic ----------
    pid := null;
    select i.id into pid
    from public.ingredients i
    where i.owner_id is not distinct from r_own.owner_id
      and lower(trim(i.name)) = 'dried garlic'
    limit 1;

    if pid is null then
      insert into public.ingredients (name, owner_id, grocery_category, parent_ingredient_id, variant_sort_order)
      values ('Dried Garlic', r_own.owner_id, 'Pantry', null, 0)
      returning id into pid;
    end if;

    update public.ingredients i
    set
      parent_ingredient_id = pid,
      updated_at = now()
    where i.owner_id is not distinct from r_own.owner_id
      and i.id <> pid
      and i.parent_ingredient_id is null
      and not exists (
        select 1 from public.ingredients c where c.parent_ingredient_id = i.id
      )
      and (
        lower(trim(i.name)) in ('garlic powder', 'granulated garlic')
        or lower(trim(i.name)) ~ '^garlic salt$'
      );

    -- ---------- Bell Peppers ----------
    pid := null;
    select i.id into pid
    from public.ingredients i
    where i.owner_id is not distinct from r_own.owner_id
      and lower(trim(i.name)) = 'bell peppers'
    limit 1;

    if pid is null then
      insert into public.ingredients (name, owner_id, grocery_category, parent_ingredient_id, variant_sort_order)
      values ('Bell Peppers', r_own.owner_id, 'Produce', null, 0)
      returning id into pid;
    end if;

    update public.ingredients i
    set
      parent_ingredient_id = pid,
      updated_at = now()
    where i.owner_id is not distinct from r_own.owner_id
      and i.id <> pid
      and i.parent_ingredient_id is null
      and not exists (
        select 1 from public.ingredients c where c.parent_ingredient_id = i.id
      )
      and lower(trim(regexp_replace(i.name, '^\s*(organic|org\.?)\s+', '', 'i'))) !~ '(jalape|habanero|serrano|poblano|anaheim|ghost|scotch|thai chili|chili pepper|chile pepper)'
      and lower(trim(regexp_replace(i.name, '^\s*(organic|org\.?)\s+', '', 'i'))) ~ '^(green|red|yellow|orange) bell peppers?$';

    -- ---------- Cabbage ----------
    pid := null;
    select i.id into pid
    from public.ingredients i
    where i.owner_id is not distinct from r_own.owner_id
      and lower(trim(i.name)) = 'cabbage'
    limit 1;

    if pid is null then
      insert into public.ingredients (name, owner_id, grocery_category, parent_ingredient_id, variant_sort_order)
      values ('Cabbage', r_own.owner_id, 'Produce', null, 0)
      returning id into pid;
    end if;

    update public.ingredients i
    set
      parent_ingredient_id = pid,
      updated_at = now()
    where i.owner_id is not distinct from r_own.owner_id
      and i.id <> pid
      and i.parent_ingredient_id is null
      and not exists (
        select 1 from public.ingredients c where c.parent_ingredient_id = i.id
      )
      and (
        lower(trim(regexp_replace(i.name, '^\s*(organic|org\.?)\s+', '', 'i'))) ~ '^(red|green|napa|savoy|purple) cabbages?$'
        or lower(trim(regexp_replace(i.name, '^\s*(organic|org\.?)\s+', '', 'i'))) = 'chinese cabbage'
      );
  end loop;
end
$body$;

-- ---------------------------------------------------------------------------
-- 2) Canonical display names (AP-style title case) — global, by normalized lower match
-- ---------------------------------------------------------------------------
update public.ingredients
set name = 'Green Onions', updated_at = now()
where lower(trim(name)) in ('green onion', 'green onions');

update public.ingredients
set name = 'Spring Onions', updated_at = now()
where lower(trim(name)) in ('spring onion', 'spring onions');

update public.ingredients
set name = 'Scallions', updated_at = now()
where lower(trim(name)) in ('scallion', 'scallions');

update public.ingredients
set name = 'Red Onions', updated_at = now()
where lower(trim(name)) in ('red onion', 'red onions');

update public.ingredients
set name = 'White Onions', updated_at = now()
where lower(trim(name)) in ('white onion', 'white onions');

update public.ingredients
set name = 'Yellow Onions', updated_at = now()
where lower(trim(name)) in ('yellow onion', 'yellow onions');

update public.ingredients
set name = 'Sweet Onions', updated_at = now()
where lower(trim(name)) in ('sweet onion', 'sweet onions');

update public.ingredients
set name = 'Pearl Onions', updated_at = now()
where lower(trim(name)) in ('pearl onion', 'pearl onions');

update public.ingredients
set name = 'Walla Walla Onions', updated_at = now()
where lower(trim(name)) in ('walla walla onion', 'walla walla onions');

update public.ingredients
set name = 'Shallots', updated_at = now()
where lower(trim(name)) in ('shallot', 'shallots');

update public.ingredients
set name = 'Onion Powder', updated_at = now()
where lower(trim(name)) in ('onion powder');

update public.ingredients
set name = 'Garlic Bulbs', updated_at = now()
where lower(trim(name)) in ('garlic', 'garlic bulb', 'garlic bulbs', 'garlic head', 'garlic heads', 'raw garlic');

update public.ingredients
set name = 'Minced Garlic', updated_at = now()
where lower(trim(name)) in ('minced garlic');

update public.ingredients
set name = 'Garlic Powder', updated_at = now()
where lower(trim(name)) in ('garlic powder');

update public.ingredients
set name = 'Granulated Garlic', updated_at = now()
where lower(trim(name)) in ('granulated garlic');

update public.ingredients
set name = 'Green Bell Peppers', updated_at = now()
where lower(trim(name)) in ('green bell pepper', 'green bell peppers');

update public.ingredients
set name = 'Red Bell Peppers', updated_at = now()
where lower(trim(name)) in ('red bell pepper', 'red bell peppers');

update public.ingredients
set name = 'Yellow Bell Peppers', updated_at = now()
where lower(trim(name)) in ('yellow bell pepper', 'yellow bell peppers');

update public.ingredients
set name = 'Orange Bell Peppers', updated_at = now()
where lower(trim(name)) in ('orange bell pepper', 'orange bell peppers');

update public.ingredients
set name = 'Red Cabbage', updated_at = now()
where lower(trim(name)) in ('red cabbage');

update public.ingredients
set name = 'Green Cabbage', updated_at = now()
where lower(trim(name)) in ('green cabbage');

update public.ingredients
set name = 'Napa Cabbage', updated_at = now()
where lower(trim(name)) in ('napa cabbage', 'chinese cabbage');

update public.ingredients
set name = 'Savoy Cabbage', updated_at = now()
where lower(trim(name)) in ('savoy cabbage');

update public.ingredients
set name = 'Purple Cabbage', updated_at = now()
where lower(trim(name)) in ('purple cabbage');

-- ---------------------------------------------------------------------------
-- 3) Variant sort order under taxonomy parents only (alphabetical by display name)
-- ---------------------------------------------------------------------------
with targets as (
  select
    i.id,
    (row_number() over (
      partition by i.parent_ingredient_id
      order by lower(trim(i.name))
    ) - 1)::integer as rn
  from public.ingredients i
  join public.ingredients p on p.id = i.parent_ingredient_id
  where lower(trim(p.name)) in (
    'fresh onions',
    'dried onions',
    'fresh garlic',
    'prepared garlic',
    'dried garlic',
    'bell peppers',
    'cabbage'
  )
)
update public.ingredients i
set
  variant_sort_order = targets.rn,
  updated_at = now()
from targets
where i.id = targets.id;
