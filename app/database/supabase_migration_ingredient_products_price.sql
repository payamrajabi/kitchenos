-- Add a price column to ingredient_products.
--
-- Nullable decimal (2 fraction digits). The generic ingredient's "Price" row
-- in the inventory side sheet inherits from the top-ranked product, so this
-- is the canonical place prices live.
--
-- Safe to re-run (IF NOT EXISTS). Paste the whole file into the Supabase SQL
-- editor: New query -> Run as role postgres on Primary.

alter table public.ingredient_products
  add column if not exists price numeric(12, 2)
    check (price is null or price >= 0);

comment on column public.ingredient_products.price is
  'Per-product price in the user''s chosen currency. The parent ingredient''s price row inherits from the top-ranked product.';
