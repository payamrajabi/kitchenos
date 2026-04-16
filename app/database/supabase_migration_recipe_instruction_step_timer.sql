-- Run in Supabase SQL Editor as role postgres on the Primary database.
-- Replaces the single timer_seconds column with a low/high range pair.
-- Safe to re-run (IF NOT EXISTS / IF EXISTS guards).

-- Step 1: Add the new range columns
alter table public.recipe_instruction_steps
  add column if not exists timer_seconds_low integer;

alter table public.recipe_instruction_steps
  add column if not exists timer_seconds_high integer;

-- Step 2: Migrate existing data (single value → both columns)
update public.recipe_instruction_steps
  set timer_seconds_low = timer_seconds,
      timer_seconds_high = timer_seconds
  where timer_seconds is not null
    and timer_seconds_low is null;

-- Step 3: Drop the old column
alter table public.recipe_instruction_steps
  drop column if exists timer_seconds;

-- Step 4: Comments
comment on column public.recipe_instruction_steps.timer_seconds_low
  is 'Low end of the timer range in seconds (or the single value when no range).';

comment on column public.recipe_instruction_steps.timer_seconds_high
  is 'High end of the timer range in seconds. Same as low when no range.';
