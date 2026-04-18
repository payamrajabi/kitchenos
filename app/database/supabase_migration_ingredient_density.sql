-- Apparent density (g/ml) on ingredients. Powers the recipe ingredients
-- table's "Grams" display toggle, which converts tsp/tbsp/cup/ml/etc. to
-- grams using this density. Nullable: ingredients without a measured
-- density fall back to their authored unit when the toggle is switched to
-- Grams.
--
-- Safe to re-run: uses IF NOT EXISTS / IF EXISTS so the column is only
-- added once and the check constraint is only wired up once.

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS density_g_per_ml REAL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ingredients_density_g_per_ml_positive'
  ) THEN
    ALTER TABLE public.ingredients
      ADD CONSTRAINT ingredients_density_g_per_ml_positive
      CHECK (density_g_per_ml IS NULL OR density_g_per_ml > 0);
  END IF;
END$$;
