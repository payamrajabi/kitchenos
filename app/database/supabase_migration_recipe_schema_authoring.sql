-- Recipe schema authoring guide — additive upgrade.
-- Run in Supabase SQL Editor as role `postgres` on the Primary database.
--
-- Strategy (additive + two internal renames):
--   * recipes, recipe_ingredients gain new columns (structured title, headnote,
--     yield parts, typed note, ingredient preparation/display).
--   * recipe_ingredient_sections.title  -> heading
--   * recipe_instruction_steps.body     -> text
--     recipe_instruction_steps.sort_order -> step_number (shifted to 1-based)
--
-- Idempotent: safe to re-run. Guards via information_schema ensure renames and
-- the 0->1 base shift run exactly once.

-- ---------------------------------------------------------------------------
-- recipes: structured siblings
-- ---------------------------------------------------------------------------
alter table public.recipes
  add column if not exists title_primary text,
  add column if not exists title_qualifier text,
  add column if not exists headnote text,
  add column if not exists yield_label text,
  add column if not exists yield_quantity text,
  add column if not exists yield_unit text,
  add column if not exists yield_display text,
  add column if not exists notes_type text,
  add column if not exists notes_title text;

-- Check constraints (added separately so we can IF NOT EXISTS-guard them).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'recipes_yield_label_check'
  ) then
    alter table public.recipes
      add constraint recipes_yield_label_check
      check (yield_label is null or yield_label in ('serves','makes'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'recipes_notes_type_check'
  ) then
    alter table public.recipes
      add constraint recipes_notes_type_check
      check (notes_type is null or notes_type in ('note','variation','storage','substitution'));
  end if;
end
$$;

-- Back-fill coherent values for existing rows.
update public.recipes
  set title_primary = name
  where title_primary is null
    and name is not null;

update public.recipes
  set yield_label = 'serves',
      yield_display = 'Serves ' || servings::text
  where servings is not null
    and yield_label is null;

update public.recipes
  set notes_type = 'note'
  where notes is not null
    and notes_type is null;

-- ---------------------------------------------------------------------------
-- recipe_ingredients: preparation + verbatim display line
-- ---------------------------------------------------------------------------
alter table public.recipe_ingredients
  add column if not exists preparation text,
  add column if not exists display text;

comment on column public.recipe_ingredients.preparation is
  'Preparation / state note attached to the ingredient line (e.g. "finely chopped", "divided").';

comment on column public.recipe_ingredients.display is
  'Optional verbatim source line preserved for typographic fidelity.';

-- ---------------------------------------------------------------------------
-- recipe_ingredient_sections: title -> heading
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'recipe_ingredient_sections'
      and column_name = 'title'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'recipe_ingredient_sections'
      and column_name = 'heading'
  ) then
    alter table public.recipe_ingredient_sections rename column title to heading;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- recipe_instruction_steps: body -> text, sort_order -> step_number (1-based)
-- ---------------------------------------------------------------------------
do $$
begin
  -- Rename body -> text
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'recipe_instruction_steps'
      and column_name = 'body'
  )
  and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'recipe_instruction_steps'
      and column_name = 'text'
  ) then
    alter table public.recipe_instruction_steps rename column body to text;
  end if;

  -- Rename sort_order -> step_number
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'recipe_instruction_steps'
      and column_name = 'sort_order'
  )
  and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'recipe_instruction_steps'
      and column_name = 'step_number'
  ) then
    alter table public.recipe_instruction_steps rename column sort_order to step_number;
  end if;

  -- Shift legacy 0-based values to 1-based exactly once. Only recipes whose
  -- minimum step_number is still 0 get shifted; once shifted, the guard is
  -- a no-op on subsequent runs.
  if exists (
    select 1
    from public.recipe_instruction_steps
    where step_number = 0
  ) then
    update public.recipe_instruction_steps
      set step_number = step_number + 1
      where recipe_id in (
        select recipe_id
        from public.recipe_instruction_steps
        group by recipe_id
        having min(step_number) = 0
      );
  end if;
end
$$;

-- Re-create the sort index under its new name.
drop index if exists public.recipe_instruction_steps_recipe_sort;

create index if not exists recipe_instruction_steps_recipe_step
  on public.recipe_instruction_steps (recipe_id, step_number);

comment on table public.recipe_instruction_steps is
  'Ordered recipe method steps (1-based step_number); legacy text lives in recipes.instructions until migrated.';
