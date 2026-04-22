-- Run in Supabase SQL Editor as role postgres on the Primary database.
-- Adds a short action-focused heading per instruction step, displayed above
-- the existing step text. Nullable so legacy rows and the backfill window
-- don't break anything. Safe to re-run (IF NOT EXISTS guards).

alter table public.recipe_instruction_steps
  add column if not exists heading text;

comment on column public.recipe_instruction_steps.heading is
  'Short action-focused summary of the step, e.g. "Brown the tempeh". Rendered above the step text. Nullable for legacy rows.';
