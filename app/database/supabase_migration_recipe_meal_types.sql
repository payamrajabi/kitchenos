-- Tags for when a recipe fits (breakfast through dessert, plus snack).
alter table public.recipes
  add column if not exists meal_types text[];

comment on column public.recipes.meal_types is
  'Optional meal tags: Breakfast, Lunch, Dinner, Snack, Dessert.';
