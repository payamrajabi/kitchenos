-- Add price-basis metadata to ingredient_products.
--
-- Existing `price` values stay valid: null price_basis means legacy/default
-- package pricing. New receipt imports can distinguish per-package prices from
-- by-weight prices such as "$8.99/lb".
--
-- Safe to re-run (IF NOT EXISTS). Paste into the Supabase SQL editor:
-- New query -> Run as role postgres on Primary.

alter table public.ingredient_products
  add column if not exists price_basis text
    check (price_basis is null or price_basis in ('package', 'weight', 'unit'));

alter table public.ingredient_products
  add column if not exists price_basis_amount numeric(12, 3)
    check (price_basis_amount is null or price_basis_amount > 0);

alter table public.ingredient_products
  add column if not exists price_basis_unit text;

comment on column public.ingredient_products.price_basis is
  'How to interpret price: package, weight, or unit. Null means legacy/default package pricing.';

comment on column public.ingredient_products.price_basis_amount is
  'Amount for the price basis, e.g. 1 for $8.99/lb or 100 for $1.49/100g.';

comment on column public.ingredient_products.price_basis_unit is
  'Unit for price_basis_amount when price_basis is weight or unit, e.g. lb, kg, g, oz, or ea.';
