-- Run this in Supabase SQL Editor to add support for multiple images
alter table public.recipes
  add column if not exists image_urls jsonb;
