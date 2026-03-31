-- Vertical framing for square-cropped recipe photos (0 = top, 100 = bottom, 50 = center).
alter table public.recipes
  add column if not exists image_focus_y smallint;

comment on column public.recipes.image_focus_y is
  '0–100: Y focal point for object-fit cover in square frames; null defaults to 50.';
