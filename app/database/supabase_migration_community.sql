-- Community: let users publish recipes for others to discover and save.
-- Run once in Supabase SQL Editor (after all prior migrations).

-- ---------------------------------------------------------------------------
-- New columns on recipes
-- ---------------------------------------------------------------------------
alter table public.recipes
  add column if not exists is_published_to_community boolean not null default false;

alter table public.recipes
  add column if not exists published_at timestamptz;

alter table public.recipes
  add column if not exists community_source_recipe_id bigint
    references public.recipes (id) on delete set null;

create index if not exists recipes_community_published
  on public.recipes (is_published_to_community)
  where is_published_to_community = true;

-- ---------------------------------------------------------------------------
-- RLS: allow any authenticated user to SELECT published recipes
-- ---------------------------------------------------------------------------
drop policy if exists "recipes_select_community" on public.recipes;
create policy "recipes_select_community"
  on public.recipes for select to authenticated
  using (is_published_to_community = true);

-- ---------------------------------------------------------------------------
-- RLS: allow reading recipe_ingredients for published recipes
-- ---------------------------------------------------------------------------
drop policy if exists "ri_select_community" on public.recipe_ingredients;
create policy "ri_select_community"
  on public.recipe_ingredients for select to authenticated
  using (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.is_published_to_community = true
    )
  );

-- ---------------------------------------------------------------------------
-- RLS: allow reading recipe_ingredient_sections for published recipes
-- ---------------------------------------------------------------------------
drop policy if exists "risec_select_community" on public.recipe_ingredient_sections;
create policy "risec_select_community"
  on public.recipe_ingredient_sections for select to authenticated
  using (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_ingredient_sections.recipe_id
        and r.is_published_to_community = true
    )
  );

-- ---------------------------------------------------------------------------
-- RLS: allow reading ingredients referenced by published recipes
-- Uses SECURITY DEFINER helper so policies on recipe_ingredients do not recurse
-- with this policy (see supabase_migration_ingredients_rls_recursion_fix.sql).
-- ---------------------------------------------------------------------------
create or replace function public.ingredient_used_in_published_recipe(p_ingredient_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.recipe_ingredients ri
    join public.recipes r on r.id = ri.recipe_id
    where ri.ingredient_id = p_ingredient_id
      and r.is_published_to_community = true
  );
$$;

revoke all on function public.ingredient_used_in_published_recipe(bigint) from public;
grant execute on function public.ingredient_used_in_published_recipe(bigint) to authenticated;

drop policy if exists "ingredients_select_community" on public.ingredients;

create policy "ingredients_select_community"
  on public.ingredients for select to authenticated
  using (public.ingredient_used_in_published_recipe(id));
