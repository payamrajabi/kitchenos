-- Add a package/unit-size pair to ingredient_products.
--
-- Two nullable columns: an amount (positive decimal) and a unit string (free
-- text, validated against INGREDIENT_UNITS on the app side). Together they
-- capture "500 g", "1 L", "16 oz", "12 ct", etc. Both columns are
-- independently nullable so partially-specified rows keep saving cleanly.
--
-- Safe to re-run (IF NOT EXISTS). Paste into the Supabase SQL editor:
-- New query -> Run as role postgres on Primary.

alter table public.ingredient_products
  add column if not exists unit_size_amount numeric(12, 3)
    check (unit_size_amount is null or unit_size_amount > 0);

alter table public.ingredient_products
  add column if not exists unit_size_unit text;

comment on column public.ingredient_products.unit_size_amount is
  'Package/unit size amount (e.g. 500, 1, 16). Paired with unit_size_unit.';

comment on column public.ingredient_products.unit_size_unit is
  'Package/unit size unit (e.g. "g", "l", "oz", "count"). Validated against INGREDIENT_UNITS in the app layer.';
