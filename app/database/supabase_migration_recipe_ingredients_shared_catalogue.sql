-- Allow any authenticated user to attach shared catalogue ingredients
-- to a recipe they own.
--
-- Background:
--   The original `ri_insert` / `ri_update` policies on recipe_ingredients
--   required BOTH:
--     (a) the user owns the recipe         (recipes.owner_id = auth.uid())
--     (b) the user owns the ingredient     (ingredients.owner_id = auth.uid())
--
--   (b) blocked any user other than Clare from saving an imported
--   recipe whose line items reused an existing ingredient in the
--   shared catalogue (e.g. "Dark Chocolate Chips" owned by Clare):
--     new row violates row-level security policy for table "recipe_ingredients"
--
--   The ingredient catalogue is intentionally shared across accounts
--   (see public.ingredient_used_in_community_recipe and the
--   ingredients_select_community policy), so ownership of the
--   ingredient row is not a meaningful gate for linking it to your
--   own recipe. Only recipe ownership matters.
--
-- This migration:
--   * Drops and recreates ri_insert and ri_update on
--     public.recipe_ingredients so they only require recipe ownership.
--   * Leaves ri_select_all (public read) and ri_delete (recipe owner)
--     untouched.
--
-- Idempotent: policies are dropped before being recreated. Safe to
-- re-run.
--
-- Run in Supabase SQL Editor as role postgres on the Primary database.

drop policy if exists "ri_insert" on public.recipe_ingredients;
create policy "ri_insert" on public.recipe_ingredients for insert to authenticated
  with check (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.owner_id = auth.uid()
    )
  );

drop policy if exists "ri_update" on public.recipe_ingredients;
create policy "ri_update" on public.recipe_ingredients for update to authenticated
  using (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.owner_id = auth.uid()
    )
  );
