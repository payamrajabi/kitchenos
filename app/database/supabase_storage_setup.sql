-- Run this in Supabase SQL Editor to enable image uploads
insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', true)
on conflict (id) do nothing;

alter table storage.objects enable row level security;

drop policy if exists "Public read recipe images" on storage.objects;
create policy "Public read recipe images"
  on storage.objects
  for select
  using (bucket_id = 'recipe-images');

drop policy if exists "Public write recipe images" on storage.objects;
create policy "Public write recipe images"
  on storage.objects
  for insert
  with check (bucket_id = 'recipe-images');

drop policy if exists "Public update recipe images" on storage.objects;
create policy "Public update recipe images"
  on storage.objects
  for update
  using (bucket_id = 'recipe-images')
  with check (bucket_id = 'recipe-images');

drop policy if exists "Public delete recipe images" on storage.objects;
create policy "Public delete recipe images"
  on storage.objects
  for delete
  using (bucket_id = 'recipe-images');
