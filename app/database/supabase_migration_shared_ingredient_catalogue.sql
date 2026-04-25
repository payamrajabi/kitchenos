-- Shared ingredient catalogue
--
-- Before this migration, `ingredients` was a per-user table: every user had
-- their own row for each ingredient they'd ever used, and RLS leaked other
-- users' rows into the inventory view via a "community recipe" read policy.
-- This migration collapses those into a single global catalogue.
--
-- What stays per-user:
--   * `inventory_items`         (how much of each ingredient you have)
--   * `ingredient_products`     (your preferred brands / products)
--   * `shopping_items`          (your shopping list)
--   * `recipes` + `recipe_ingredients` (your authored recipes)
--
-- What becomes shared:
--   * `ingredients`             (name, taxonomy, grocery category, nutrition, …)
--   * `ingredient_aliases`      (synonyms that apply to every user)
--   * `ingredient_nutrients`    (was already public)
--   * `ingredient_portions`     (was already public)
--
-- This file is the paste-ready record of the change that was applied via
-- the Supabase MCP. Running it again is safe-ish (guards are idempotent)
-- but the data-merge step at the top hardcodes the specific winner/loser
-- IDs that existed at migration time, so do NOT re-run in a fresh DB.

BEGIN;

------------------------------------------------------------------------------
-- 1. Merge the 13 duplicate ingredient pairs. User A wins every pair;
-- user B's duplicate rows are redirected and then deleted.
-- Conflict check at merge time returned zero across aliases, nutrients,
-- recipe_ingredients, inventory, and variant names, so a straight
-- reassign + delete is safe.
------------------------------------------------------------------------------

CREATE TEMP TABLE ingredient_merge_pairs(winner BIGINT, loser BIGINT) ON COMMIT DROP;
INSERT INTO ingredient_merge_pairs(winner, loser) VALUES
  (395, 406),  -- Avocado Oil Spray
  (376, 403),  -- Baking Powder
  (371, 402),  -- Cornstarch
  (392, 408),  -- Egg Whites
  (391, 399),  -- Egg Yolks
  (389, 401),  -- Flour
  (394, 410),  -- Lemon Juice
  (521, 404),  -- Sea Salt
  (435, 400),  -- Soy Milk
  (393, 409),  -- Sugar
  (534, 634),  -- Turmeric
  (390, 405),  -- Vanilla Extract
  (385, 407);  -- Water

UPDATE inventory_items      SET ingredient_id        = p.winner FROM ingredient_merge_pairs p WHERE inventory_items.ingredient_id        = p.loser;
UPDATE recipe_ingredients   SET ingredient_id        = p.winner FROM ingredient_merge_pairs p WHERE recipe_ingredients.ingredient_id     = p.loser;
UPDATE shopping_items       SET ingredient_id        = p.winner FROM ingredient_merge_pairs p WHERE shopping_items.ingredient_id         = p.loser;
UPDATE ingredient_aliases   SET ingredient_id        = p.winner FROM ingredient_merge_pairs p WHERE ingredient_aliases.ingredient_id     = p.loser;
UPDATE ingredient_nutrients SET ingredient_id        = p.winner FROM ingredient_merge_pairs p WHERE ingredient_nutrients.ingredient_id   = p.loser;
UPDATE ingredient_portions  SET ingredient_id        = p.winner FROM ingredient_merge_pairs p WHERE ingredient_portions.ingredient_id    = p.loser;
UPDATE ingredient_products  SET ingredient_id        = p.winner FROM ingredient_merge_pairs p WHERE ingredient_products.ingredient_id    = p.loser;
UPDATE ingredients          SET parent_ingredient_id = p.winner FROM ingredient_merge_pairs p WHERE ingredients.parent_ingredient_id     = p.loser;

DELETE FROM ingredients WHERE id IN (SELECT loser FROM ingredient_merge_pairs);

------------------------------------------------------------------------------
-- 2. Drop the owner-scoped RLS policies FIRST so the column becomes safe to
-- drop (Postgres blocks the column drop otherwise).
------------------------------------------------------------------------------

DROP POLICY IF EXISTS ingredients_select_own        ON public.ingredients;
DROP POLICY IF EXISTS ingredients_select_community  ON public.ingredients;
DROP POLICY IF EXISTS ingredients_insert_own        ON public.ingredients;
DROP POLICY IF EXISTS ingredients_update_own        ON public.ingredients;
DROP POLICY IF EXISTS ingredients_delete_own        ON public.ingredients;

------------------------------------------------------------------------------
-- 3. Drop the per-user trigger. The shared `kitchenos_set_owner_id()`
-- function is kept because it's still used by inventory_items, recipes,
-- shopping_items, people, meal_plans, meal_plan_slot_dismissals, and
-- ingredient_products.
------------------------------------------------------------------------------

DROP TRIGGER IF EXISTS kitchenos_ingredients_owner ON public.ingredients;

------------------------------------------------------------------------------
-- 4. Drop the per-user constraints and the column itself.
------------------------------------------------------------------------------

ALTER TABLE public.ingredients DROP CONSTRAINT IF EXISTS ingredients_owner_name_unique;
ALTER TABLE public.ingredients DROP CONSTRAINT IF EXISTS ingredients_owner_id_fkey;
ALTER TABLE public.ingredients DROP COLUMN     IF EXISTS owner_id;

------------------------------------------------------------------------------
-- 5. Enforce one canonical ingredient per name (case-insensitive).
------------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS ux_ingredients_lower_name
  ON public.ingredients (lower(name));

------------------------------------------------------------------------------
-- 6. Replace the owner-scoped policies with "any authenticated user
-- can read / write the shared catalogue".
------------------------------------------------------------------------------

CREATE POLICY ingredients_public_read
  ON public.ingredients FOR SELECT TO authenticated
  USING (true);

CREATE POLICY ingredients_public_insert
  ON public.ingredients FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY ingredients_public_update
  ON public.ingredients FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY ingredients_public_delete
  ON public.ingredients FOR DELETE TO authenticated
  USING (true);

------------------------------------------------------------------------------
-- 7. `ingredient_aliases` had RLS enabled with zero policies, which locked
-- the table out entirely. Give it the same public policies as the other
-- satellite catalogue tables (`ingredient_nutrients`, `ingredient_portions`).
------------------------------------------------------------------------------

DROP POLICY IF EXISTS ingredient_aliases_public_read   ON public.ingredient_aliases;
DROP POLICY IF EXISTS ingredient_aliases_public_insert ON public.ingredient_aliases;
DROP POLICY IF EXISTS ingredient_aliases_public_update ON public.ingredient_aliases;
DROP POLICY IF EXISTS ingredient_aliases_public_delete ON public.ingredient_aliases;

CREATE POLICY ingredient_aliases_public_read
  ON public.ingredient_aliases FOR SELECT TO authenticated
  USING (true);

CREATE POLICY ingredient_aliases_public_insert
  ON public.ingredient_aliases FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY ingredient_aliases_public_update
  ON public.ingredient_aliases FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY ingredient_aliases_public_delete
  ON public.ingredient_aliases FOR DELETE TO authenticated
  USING (true);

------------------------------------------------------------------------------
-- 8. The helper function that powered the old `ingredients_select_community`
-- policy is no longer referenced anywhere. Drop it.
------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.ingredient_used_in_community_recipe(bigint);

COMMIT;
