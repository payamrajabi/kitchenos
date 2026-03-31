export type RecipeRow = {
  id: number;
  name: string;
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
  created_at?: string;
  updated_at?: string;
};

export type IngredientRow = {
  id: number;
  name: string;
  full_item_name: string | null;
  full_item_name_alt: string | null;
  current_stock: string | null;
  minimum_stock: string | null;
  maximum_stock: string | null;
  category: string | null;
  notes: string | null;
  ingredients_text: string | null;
  preferred_vendor?: string | null;
  brand_or_manufacturer?: string | null;
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
  created_at?: string;
  ingredients?: Pick<IngredientRow, "id" | "name"> | null;
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
