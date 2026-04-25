-- Collapse "Lemon Wedges" / "Lime Wedges" into their parents.
--
-- Context: the earlier `supabase_migration_soft_duplicate_cleanup.sql`
-- re-parented `Lemon Wedges` (604) under `Lemon` (647) and `Lime Wedges`
-- (603) under `Lime` (536), but kept them as distinct ingredient rows — so
-- they still appeared as their own inventory bullets and recipes still
-- referenced them directly.
--
-- The canonical model is: the ingredient is "Lemon" / "Lime"; the word
-- "wedges" is a *cut form*, which belongs in `recipe_ingredients.preparation`
-- (the gray "thinly sliced" text after the name).
--
-- This migration:
--   1. Moves any recipe_ingredients row pointing at 603/604 onto 536/647,
--      writing 'wedges' into `preparation` (prepending if an existing prep
--      string is already set, so we never clobber).
--   2. Drops the now-redundant "wedges" inventory rows when the owner already
--      has a canonical Lime/Lemon row in the same storage location; otherwise
--      just re-points the FK.
--   3. Redirects every other satellite FK (aliases, nutrients, portions,
--      products, shopping_items, ingredients.parent) from the losers to the
--      winners. Counts at migration time showed zero hits for those tables,
--      but the redirects make re-runs on other environments safe.
--   4. Adds "Lemon Wedges" / "Lime Wedges" as aliases on the parent so
--      imported/pasted recipe text still resolves correctly.
--   5. Deletes ingredient rows 603 and 604.
--
-- IMPORTANT: Hardcodes production ingredient IDs. Do NOT replay on a fresh DB.

BEGIN;

-- -------------------------------------------------------------------------
-- 1. recipe_ingredients: swap ingredient_id and set preparation = 'wedges'.
--    Guard against PK collisions (recipe_id, ingredient_id) by deleting any
--    wedge row whose recipe already has a row for the parent ingredient.
-- -------------------------------------------------------------------------

DELETE FROM recipe_ingredients ri
WHERE ri.ingredient_id IN (603, 604)
  AND EXISTS (
    SELECT 1 FROM recipe_ingredients p
    WHERE p.recipe_id = ri.recipe_id
      AND p.ingredient_id = CASE ri.ingredient_id WHEN 603 THEN 536 WHEN 604 THEN 647 END
  );

UPDATE recipe_ingredients ri
SET ingredient_id = CASE ri.ingredient_id WHEN 603 THEN 536 WHEN 604 THEN 647 END,
    preparation   = CASE
      WHEN ri.preparation IS NULL OR btrim(ri.preparation) = '' THEN 'wedges'
      ELSE 'wedges, ' || ri.preparation
    END
WHERE ri.ingredient_id IN (603, 604);

-- -------------------------------------------------------------------------
-- 2. inventory_items: drop wedge rows when the owner already has the
--    canonical ingredient in the same storage location; otherwise redirect.
-- -------------------------------------------------------------------------

DELETE FROM inventory_items w
WHERE w.ingredient_id IN (603, 604)
  AND EXISTS (
    SELECT 1 FROM inventory_items p
    WHERE p.owner_id = w.owner_id
      AND p.storage_location = w.storage_location
      AND p.ingredient_id = CASE w.ingredient_id WHEN 603 THEN 536 WHEN 604 THEN 647 END
  );

UPDATE inventory_items SET ingredient_id = 536 WHERE ingredient_id = 603;
UPDATE inventory_items SET ingredient_id = 647 WHERE ingredient_id = 604;

-- -------------------------------------------------------------------------
-- 3. Satellite FK redirects (safe no-ops if already empty).
-- -------------------------------------------------------------------------

UPDATE ingredient_aliases    SET ingredient_id        = 536 WHERE ingredient_id = 603;
UPDATE ingredient_aliases    SET ingredient_id        = 647 WHERE ingredient_id = 604;
UPDATE ingredient_nutrients  SET ingredient_id        = 536 WHERE ingredient_id = 603;
UPDATE ingredient_nutrients  SET ingredient_id        = 647 WHERE ingredient_id = 604;
UPDATE ingredient_portions   SET ingredient_id        = 536 WHERE ingredient_id = 603;
UPDATE ingredient_portions   SET ingredient_id        = 647 WHERE ingredient_id = 604;
UPDATE ingredient_products   SET ingredient_id        = 536 WHERE ingredient_id = 603;
UPDATE ingredient_products   SET ingredient_id        = 647 WHERE ingredient_id = 604;
UPDATE shopping_items        SET ingredient_id        = 536 WHERE ingredient_id = 603;
UPDATE shopping_items        SET ingredient_id        = 647 WHERE ingredient_id = 604;
UPDATE ingredients           SET parent_ingredient_id = 536 WHERE parent_ingredient_id = 603;
UPDATE ingredients           SET parent_ingredient_id = 647 WHERE parent_ingredient_id = 604;

-- -------------------------------------------------------------------------
-- 4. Preserve the old names as aliases so future parses of "Lime Wedges" /
--    "Lemon Wedges" still map to the canonical ingredient.
-- -------------------------------------------------------------------------

INSERT INTO ingredient_aliases (ingredient_id, alias, source)
SELECT 536, 'Lime Wedges', 'collapse-citrus-wedges'
WHERE NOT EXISTS (
  SELECT 1 FROM ingredient_aliases WHERE ingredient_id = 536 AND lower(alias) = 'lime wedges'
);

INSERT INTO ingredient_aliases (ingredient_id, alias, source)
SELECT 647, 'Lemon Wedges', 'collapse-citrus-wedges'
WHERE NOT EXISTS (
  SELECT 1 FROM ingredient_aliases WHERE ingredient_id = 647 AND lower(alias) = 'lemon wedges'
);

-- -------------------------------------------------------------------------
-- 5. Delete the now-orphan ingredient rows.
-- -------------------------------------------------------------------------

DELETE FROM ingredients WHERE id IN (603, 604);

COMMIT;
