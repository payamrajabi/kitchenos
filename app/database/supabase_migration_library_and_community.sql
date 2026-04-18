-- Everyone's recipes are "community": remove the Publish concept, introduce a
-- lightweight user_recipe_library pointer table, add a soft-delete column so
-- library viewers can tell when an author removed a recipe, and migrate existing
-- "saved from community" duplicates into library pointers.
--
-- Run once in Supabase SQL Editor as role postgres on the Primary database,
-- AFTER supabase_migration_community.sql and supabase_migration_ingredients_rls_recursion_fix.sql.
-- The script is mostly idempotent; steps 5 and 6 only run once (they drop columns).

-- ---------------------------------------------------------------------------
-- 1) New table: user_recipe_library (pointers, not copies)
-- ---------------------------------------------------------------------------
create table if not exists public.user_recipe_library (
  user_id uuid not null references auth.users (id) on delete cascade,
  recipe_id bigint not null references public.recipes (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

comment on table public.user_recipe_library is
  'Join table: recipes a user has saved from the community. Always points at the live recipe row.';

create index if not exists user_recipe_library_recipe_id
  on public.user_recipe_library (recipe_id);

alter table public.user_recipe_library enable row level security;

drop policy if exists "url_select_own" on public.user_recipe_library;
create policy "url_select_own"
  on public.user_recipe_library for select to authenticated
  using (user_id = auth.uid ());

drop policy if exists "url_insert_own" on public.user_recipe_library;
create policy "url_insert_own"
  on public.user_recipe_library for insert to authenticated
  with check (user_id = auth.uid ());

drop policy if exists "url_delete_own" on public.user_recipe_library;
create policy "url_delete_own"
  on public.user_recipe_library for delete to authenticated
  using (user_id = auth.uid ());

-- ---------------------------------------------------------------------------
-- 2) Soft delete on recipes
--    Author deletions are now soft so library viewers can see a tombstone
--    until they remove the recipe from their own library.
-- ---------------------------------------------------------------------------
alter table public.recipes
  add column if not exists deleted_at timestamptz;

create index if not exists recipes_deleted_at
  on public.recipes (deleted_at)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 3) Open read access: every authenticated user can read every recipe.
--    Writes remain owner-only (those policies already exist from v2 migration).
-- ---------------------------------------------------------------------------
drop policy if exists "recipes_select_own" on public.recipes;
drop policy if exists "recipes_select_community" on public.recipes;
create policy "recipes_select_all"
  on public.recipes for select to authenticated
  using (true);

drop policy if exists "ri_select_community" on public.recipe_ingredients;
-- keep ri_select_own from the v2 migration; add a permissive community read too.
drop policy if exists "ri_select_all" on public.recipe_ingredients;
create policy "ri_select_all"
  on public.recipe_ingredients for select to authenticated
  using (true);

drop policy if exists "risec_select_community" on public.recipe_ingredient_sections;
drop policy if exists "risec_select_all" on public.recipe_ingredient_sections;
create policy "risec_select_all"
  on public.recipe_ingredient_sections for select to authenticated
  using (true);

drop policy if exists "ris_steps_select" on public.recipe_instruction_steps;
drop policy if exists "ris_steps_select_community" on public.recipe_instruction_steps;
drop policy if exists "ris_steps_select_all" on public.recipe_instruction_steps;
create policy "ris_steps_select_all"
  on public.recipe_instruction_steps for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 4) Ingredients: visible when used in any non-deleted recipe.
--    Replaces ingredient_used_in_published_recipe (published flag is gone).
-- ---------------------------------------------------------------------------
create or replace function public.ingredient_used_in_community_recipe(p_ingredient_id bigint)
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
      and r.deleted_at is null
  );
$$;

revoke all on function public.ingredient_used_in_community_recipe(bigint) from public;
grant execute on function public.ingredient_used_in_community_recipe(bigint) to authenticated;

drop policy if exists "ingredients_select_community" on public.ingredients;
create policy "ingredients_select_community"
  on public.ingredients for select to authenticated
  using (public.ingredient_used_in_community_recipe(id));

-- The legacy helper is no longer referenced by any policy.
drop function if exists public.ingredient_used_in_published_recipe(bigint);

-- ---------------------------------------------------------------------------
-- 5) Data migration: convert existing "saved from community" copies into
--    library pointers, then delete the duplicate recipe rows.
--    Runs only while the legacy column still exists so it is safe to re-run.
-- ---------------------------------------------------------------------------
do $$
declare
  dup record;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'recipes'
      and column_name = 'community_source_recipe_id'
  ) then
    for dup in
      execute
        'select r.id as dup_id, r.owner_id, r.community_source_recipe_id as source_id
         from public.recipes r
         where r.community_source_recipe_id is not null
           and r.owner_id is not null'
    loop
      -- Link the duplicate's owner to the still-existing source, then delete
      -- the duplicate row. If the source is already gone the copy becomes a
      -- stand-alone recipe the user owns — we simply leave it (no delete).
      if exists (
        select 1 from public.recipes src
        where src.id = dup.source_id
          and src.owner_id is distinct from dup.owner_id
      ) then
        insert into public.user_recipe_library (user_id, recipe_id)
        values (dup.owner_id, dup.source_id)
        on conflict do nothing;

        delete from public.recipes where id = dup.dup_id;
      end if;
    end loop;
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 6) Drop the legacy publish / fork-pointer columns and their index.
-- ---------------------------------------------------------------------------
drop index if exists recipes_community_published;

alter table public.recipes drop column if exists is_published_to_community;
alter table public.recipes drop column if exists published_at;
alter table public.recipes drop column if exists community_source_recipe_id;
