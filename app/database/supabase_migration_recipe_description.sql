-- Recipe short description (optional, max 250 chars enforced in app).
alter table public.recipes add column if not exists description text;
