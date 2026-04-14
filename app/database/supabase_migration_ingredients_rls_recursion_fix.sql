-- Fix: "Infinite recursion detected in policy for relation 'recipe_ingredients'"
-- Cause: ingredients_select_community scanned recipe_ingredients under RLS while
-- recipe_ingredient write policies reference ingredients — mutual RLS checks loop.
-- Fix: evaluate the published-recipe join in a SECURITY DEFINER function with
-- row_security off so the lookup does not re-enter recipe_ingredients policies.
-- Run in Supabase SQL Editor after supabase_migration_community.sql (idempotent).

drop policy if exists "ingredients_select_community" on public.ingredients;

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

create policy "ingredients_select_community"
  on public.ingredients for select to authenticated
  using (public.ingredient_used_in_published_recipe(id));
