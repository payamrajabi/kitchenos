-- Rename School snack → Snack, remove Brunch from stored arrays (align with RECIPE_MEAL_TYPES).
update public.recipes
set meal_types = nullif(
  array_remove(
    array_replace(coalesce(meal_types, '{}'), 'School snack', 'Snack'),
    'Brunch'
  ),
  '{}'::text[]
)
where meal_types is not null;

comment on column public.recipes.meal_types is
  'Optional meal tags: Breakfast, Lunch, Dinner, Snack, Dessert.';
