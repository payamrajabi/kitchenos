-- Drop the unique constraint on ingredients.backbone_id.
--
-- Context: a backbone_id is a *reference* to a canonical catalogue entry,
-- not an identity. Multiple ingredient rows can legitimately point at the
-- same canonical entry — e.g. when several alias forms ("Brown Onion",
-- "Yellow Onion") all resolve to the same backbone row, or when users
-- keep variant-level granularity that the catalogue collapses.
--
-- The original unique index was over-restrictive and surfaces as
-- "duplicate key value violates unique constraint" during the Apply
-- Catalogue step whenever two existing rows alias to the same entry.
-- Replace it with a plain (non-unique) index to keep fast lookups.
--
-- How to run (Supabase dashboard):
--   SQL → New query → paste → Run as role `postgres` on the Primary
--   database. Safe to re-run; every statement is idempotent.

drop index if exists public.ux_ingredients_backbone_id;

create index if not exists ix_ingredients_backbone_id
  on public.ingredients (backbone_id)
  where backbone_id is not null;
