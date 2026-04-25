-- Inventory simplification.
--
--   1. Drop `min_quantity` and `max_quantity` from `inventory_items`
--      — no more "low stock" thresholds; we just track current quantity.
--   2. Drop `unit_size` from `inventory_items` (added briefly, never used).
--   3. Relax the `storage_location` CHECK constraint so users can add
--      custom locations beyond Fridge / Freezer / Shallow Pantry /
--      Deep Pantry / Other (e.g. "Cold Room", "Cellar").
--
-- Idempotent — safe to re-run.

ALTER TABLE inventory_items DROP COLUMN IF EXISTS min_quantity;
ALTER TABLE inventory_items DROP COLUMN IF EXISTS max_quantity;
ALTER TABLE inventory_items DROP COLUMN IF EXISTS unit_size;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    WHERE cls.relname = 'inventory_items'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%storage_location%IN%'
  LOOP
    EXECUTE format(
      'ALTER TABLE inventory_items DROP CONSTRAINT %I',
      r.conname
    );
  END LOOP;
END $$;

ALTER TABLE inventory_items
  ALTER COLUMN storage_location SET NOT NULL;
