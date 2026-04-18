export type RecipeRow = {
  id: number;
  name: string;
  /** Short summary under the title; UI caps at 250 characters. */
  description?: string | null;
  image_url: string | null;
  image_urls: unknown;
  /** 0–100: vertical focal point for square cover crops (default 50). */
  image_focus_y?: number | null;
  notes: string | null;
  ingredients: string | null;
  instructions: string | null;
  source_url: string | null;
  servings: number | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  total_time_minutes: number | null;
  calories: number | null;
  protein_grams: number | null;
  fat_grams: number | null;
  carbs_grams: number | null;
  /** When the recipe is a fit for these meal moments (see `RECIPE_MEAL_TYPES`). */
  meal_types?: string[] | null;
  /** Set when the owner removes a recipe. Tombstone for anyone who has it in their library. */
  deleted_at?: string | null;
  owner_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type UserRecipeLibraryRow = {
  user_id: string;
  recipe_id: number;
  added_at?: string;
};

export type FoodType = "generic" | "branded" | "custom";

export type IngredientRow = {
  id: number;
  name: string;
  full_item_name: string | null;
  full_item_name_alt: string | null;
  current_stock: string | null;
  minimum_stock: string | null;
  maximum_stock: string | null;
  category: string | null;
  /** Grocery store section (Produce, Pantry, …). Not the fridge/freezer `category`. */
  grocery_category?: string | null;
  notes: string | null;
  ingredients_text: string | null;
  preferred_vendor?: string | null;
  brand_or_manufacturer?: string | null;
  parent_ingredient_id?: number | null;
  variant_sort_order?: number;
  /** generic = research-grade (USDA/CNF), branded = label data, custom = user-entered. */
  food_type?: FoodType;
  /** UPC / EAN / GTIN barcode for branded products. */
  barcode?: string | null;
  kcal?: number | null;
  fat_g?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  nutrition_basis?: "per_100g" | "per_unit" | null;
  canonical_unit_weight_g?: number | null;
  nutrition_source_name?: string | null;
  nutrition_source_record_id?: string | null;
  nutrition_source_url?: string | null;
  nutrition_confidence?: number | null;
  nutrition_needs_review?: boolean;
  nutrition_notes?: string | null;
  /** Grams; UI scales per-100g kcal/macros for display. Default 100. */
  nutrition_serving_size_g?: number;
  /** When nutrition data was last fetched from an external source. */
  nutrition_fetched_at?: string | null;
  /**
   * Apparent density in grams per millilitre. Used by the recipe ingredients
   * table's "Grams" display toggle to convert volume amounts (tsp/tbsp/cup/ml/…)
   * into grams. Nullable: ingredients without a measured density fall back to
   * their original unit in that view.
   */
  density_g_per_ml?: number | null;
};

export type IngredientNutrientRow = {
  ingredient_id: number;
  /** USDA nutrient ID (canonical key, e.g. 1079 = fiber, 1089 = iron). */
  nutrient_id: number;
  nutrient_name: string;
  /** Amount per the ingredient's nutrition basis (typically per 100 g). */
  value: number;
  /** Measurement unit: "g", "mg", "mcg", "IU". */
  unit: string;
};

export type IngredientPortionRow = {
  id: number;
  ingredient_id: number;
  /** Weight in grams for this named portion. */
  gram_weight: number;
  /** Human-readable label, e.g. "1 large", "1 cup chopped", "1 tbsp". */
  description: string;
  /** Where this portion data came from. */
  source?: string | null;
  is_default?: boolean;
  created_at?: string;
};

export type RecipeIngredientSectionRow = {
  id: string;
  recipe_id: number;
  title: string;
  sort_order: number;
  created_at?: string;
};

export type RecipeIngredientRow = {
  id: number;
  recipe_id: number;
  ingredient_id: number;
  section_id: string | null;
  line_sort_order: number;
  amount: string | null;
  unit: string | null;
  /** When true, this ingredient line is optional (e.g. garnish). */
  is_optional: boolean;
  created_at?: string;
  ingredients?: Pick<IngredientRow, "id" | "name" | "density_g_per_ml"> | null;
};

export type RecipeInstructionStepRow = {
  id: number;
  recipe_id: number;
  sort_order: number;
  body: string;
  /** Low end of the timer range in seconds (or the single value when no range). */
  timer_seconds_low?: number | null;
  /** High end of the timer range in seconds. Null when there is no range. */
  timer_seconds_high?: number | null;
  created_at?: string;
};

export type InventoryItemRow = {
  id: number;
  ingredient_id: number;
  storage_location: string;
  quantity: number | null;
  min_quantity: number | null;
  max_quantity: number | null;
  unit: string | null;
  recipe_unit: string | null;
  notes: string | null;
};

export type MealPlanEntryRow = {
  id: number;
  meal_plan_id: number;
  plan_date: string;
  meal_slot: string | null;
  recipe_id: number | null;
  label: string | null;
  notes: string | null;
  sort_order: number | null;
  /** Planned servings for this slot entry; default 4. */
  servings?: number | null;
};

export type MealPlanRow = {
  id: number;
  week_start: string;
  title: string | null;
  meal_plan_entries?: MealPlanEntryRow[];
};

export type ShoppingItemRow = {
  id: number;
  name: string | null;
  quantity: string | null;
  unit: string | null;
  store: string | null;
  aisle: string | null;
  notes: string | null;
};

export type PersonRow = {
  id: number;
  name: string | null;
  birth_date: string | null;
  weight: string | null;
  height: string | null;
  daily_calorie_expenditure: string | null;
  calorie_min: string | null;
  calorie_max: string | null;
  calorie_target: string | null;
  protein_min_grams: string | null;
  protein_max_grams: string | null;
  protein_target_grams: string | null;
  fat_min_grams: string | null;
  fat_max_grams: string | null;
  fat_target_grams: string | null;
  carb_min_grams: string | null;
  carb_max_grams: string | null;
  carb_target_grams: string | null;
  dietary_restrictions: unknown;
  allergies: unknown;
  created_at?: string | null;
  updated_at?: string | null;
};

export type EquipmentRow = {
  id: number;
  name: string | null;
  category: string | null;
  has_item?: boolean;
};
