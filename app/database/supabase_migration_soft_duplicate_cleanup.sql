-- Soft-duplicate cleanup
--
-- After collapsing the 13 per-user exact duplicates in
-- `supabase_migration_shared_ingredient_catalogue.sql`, the inventory view
-- still had a handful of "soft" duplicates: entries that are the same real
-- ingredient in a different form (Lemon + Lemon Juice + Lemon Wedges) or a
-- different name for the identical product (Hemp Seeds + Hemp Hearts).
--
-- This migration cleans those up using the existing variant model:
--
--   1. Hemp Hearts is fully merged into Hemp Seeds (identical product).
--   2. Fifteen "form variants" are re-parented under their canonical root,
--      using the same `parent_ingredient_id` mechanism already used by
--      Milk → Soy Milk, Sugar → Brown Sugar, Salt → Sea Salt, etc.
--   3. Avocado Oil and its spray variant move from Tropical Fruit into
--      Oils & Fats (taxonomy fix missed in the earlier sweep).
--
-- Pairs that are NOT touched because they are genuinely distinct products:
--   Rice Vinegar vs Brown Rice Vinegar
--   Vanilla Bean vs Vanilla Extract
--   Paprika vs Smoked Paprika
--   Onions vs Green Onions (different plant)
--   Onions vs Shallots (different species)
--   Onions vs Crispy Onions (prepared product)
--   Sugar vs Sugar Syrup
--   Pepper vs Black Pepper (the "Pepper" row currently has bell-pepper
--     children attached - needs its own dedicated cleanup).
--
-- IMPORTANT: Hardcodes specific ingredient IDs from the production DB at
-- migration time. Do NOT replay on a fresh database.

BEGIN;

-- =========================================================================
-- Bucket 1: FULL MERGE - Hemp Hearts (619) into Hemp Seeds (591)
-- =========================================================================

-- Both ingredient rows had an inventory row for the same owner and location.
-- Hemp Hearts had `quantity='1'` and Hemp Seeds had none, so roll the stock
-- forward into Hemp Seeds before deleting the Hemp Hearts inventory row.
UPDATE inventory_items SET quantity = '1' WHERE id = 369;
DELETE FROM inventory_items WHERE id = 397;

-- Redirect every remaining FK reference from loser (619) to winner (591).
UPDATE ingredient_aliases    SET ingredient_id        = 591 WHERE ingredient_id = 619;
UPDATE ingredient_nutrients  SET ingredient_id        = 591 WHERE ingredient_id = 619;
UPDATE ingredient_portions   SET ingredient_id        = 591 WHERE ingredient_id = 619;
UPDATE ingredient_products   SET ingredient_id        = 591 WHERE ingredient_id = 619;
UPDATE inventory_items       SET ingredient_id        = 591 WHERE ingredient_id = 619;
UPDATE recipe_ingredients    SET ingredient_id        = 591 WHERE ingredient_id = 619;
UPDATE shopping_items        SET ingredient_id        = 591 WHERE ingredient_id = 619;
UPDATE ingredients           SET parent_ingredient_id = 591 WHERE parent_ingredient_id = 619;

DELETE FROM ingredients WHERE id = 619;

-- =========================================================================
-- Bucket 2: RE-PARENT AS VARIANTS
-- Each "child" becomes a variant of its canonical "parent", appended to
-- the parent's existing variant list.
-- =========================================================================

WITH reparent(child_id, parent_id) AS (VALUES
  (394::bigint, 647::bigint),  -- Lemon Juice           -> Lemon
  (604, 647),                  -- Lemon Wedges          -> Lemon
  (572, 647),                  -- Lemon Zest            -> Lemon (previously under Lemon Juice)
  (548, 536),                  -- Lime Juice            -> Lime
  (603, 536),                  -- Lime Wedges           -> Lime
  (392, 387),                  -- Egg Whites            -> Eggs
  (391, 387),                  -- Egg Yolks             -> Eggs
  (582, 363),                  -- Baby Spinach          -> Spinach
  (577, 554),                  -- Flaxseed Meal         -> Flax Seeds
  (386, 337),                  -- Minced Garlic         -> Garlic
  (373, 337),                  -- Garlic Powder         -> Garlic
  (372, 339),                  -- Onion Powder          -> Onions
  (535, 341),                  -- Ground Ginger         -> Ginger
  (587, 350),                  -- Marinated Goat Cheese -> Goat Cheese
  (395, 370)                   -- Avocado Oil Spray     -> Avocado Oil
),
current_max AS (
  SELECT r.parent_id, COALESCE(MAX(i.variant_sort_order), -1) AS base_sort
  FROM reparent r
  LEFT JOIN ingredients i ON i.parent_ingredient_id = r.parent_id
  GROUP BY r.parent_id
),
numbered AS (
  SELECT r.child_id, r.parent_id,
         cm.base_sort + ROW_NUMBER() OVER (PARTITION BY r.parent_id ORDER BY r.child_id) AS sort_order
  FROM reparent r
  JOIN current_max cm ON cm.parent_id = r.parent_id
)
UPDATE ingredients c
SET parent_ingredient_id = n.parent_id,
    variant_sort_order  = n.sort_order,
    updated_at          = now()
FROM numbered n
WHERE c.id = n.child_id;

-- =========================================================================
-- Bucket 3: Avocado Oil taxonomy correction (missed in the earlier sweep)
-- =========================================================================

UPDATE ingredients
SET taxonomy_subcategory = 'Oils & Fats', updated_at = now()
WHERE id IN (370, 395);

COMMIT;
