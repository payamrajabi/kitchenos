-- Public read access: let signed-out visitors view any recipe.
-- Writes remain owner-only via the existing insert/update/delete policies.
-- Run once in Supabase SQL Editor as role postgres on the Primary database,
-- AFTER supabase_migration_library_and_community.sql.
--
-- Safe to re-run: each policy is dropped and recreated, and the grant is
-- idempotent.

-- ---------------------------------------------------------------------------
-- recipes: anyone (anon + authenticated) can SELECT any recipe.
-- ---------------------------------------------------------------------------
drop policy if exists "recipes_select_all" on public.recipes;
create policy "recipes_select_all"
  on public.recipes for select to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- recipe_ingredients: anyone can SELECT.
-- ---------------------------------------------------------------------------
drop policy if exists "ri_select_all" on public.recipe_ingredients;
create policy "ri_select_all"
  on public.recipe_ingredients for select to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- recipe_ingredient_sections: anyone can SELECT.
-- ---------------------------------------------------------------------------
drop policy if exists "risec_select_all" on public.recipe_ingredient_sections;
create policy "risec_select_all"
  on public.recipe_ingredient_sections for select to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- recipe_instruction_steps: anyone can SELECT.
-- ---------------------------------------------------------------------------
drop policy if exists "ris_steps_select_all" on public.recipe_instruction_steps;
create policy "ris_steps_select_all"
  on public.recipe_instruction_steps for select to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- ingredients: visible to anyone when used by any non-deleted recipe.
-- Extends the existing SECURITY DEFINER helper to the anon role.
-- ---------------------------------------------------------------------------
grant execute on function public.ingredient_used_in_community_recipe(bigint) to anon;

drop policy if exists "ingredients_select_community" on public.ingredients;
create policy "ingredients_select_community"
  on public.ingredients for select to anon, authenticated
  using (public.ingredient_used_in_community_recipe(id));
