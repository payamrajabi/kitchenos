-- Add "Component" as an allowed meal_types value (sauces, pickles, cooked bases,
-- chopped prep, and other building blocks that aren't meals on their own).
-- Note: meal_types is a free-form text[] with no CHECK/enum constraint, so this
-- migration only refreshes the column comment. No data migration needed.
comment on column public.recipes.meal_types is
  'Optional meal tags: Breakfast, Lunch, Dinner, Snack, Dessert, Drink, Component.';
