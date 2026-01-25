-- Run this in Supabase SQL Editor if inserts fail with
-- duplicate key value violates unique constraint "recipes_pkey".
-- It resets the identity sequence to max(id) + 1.

select setval(
  pg_get_serial_sequence('public.recipes', 'id'),
  coalesce(max(id), 0) + 1,
  false
) from public.recipes;
