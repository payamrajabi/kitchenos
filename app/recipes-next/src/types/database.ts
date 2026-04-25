export type RecipeNoteType =
  | "note"
  | "variation"
  | "storage"
  | "substitution";

export type RecipeYieldLabel = "serves" | "makes";

export type RecipeRow = {
  id: number;
  /** Flat display title (kept in sync with title_primary + title_qualifier). */
  name: string;
  /** Structured title — base recipe name without qualifier. */
  title_primary?: string | null;
  /** Structured title — optional continuation (with/and/in/over…). */
  title_qualifier?: string | null;
  /** Editorial intro/headnote before the recipe metadata (60–180 words). */
  headnote?: string | null;
  /** Short summary under the title; UI caps at 250 characters. */
  description?: string | null;
  image_url: string | null;
  image_urls: unknown;
  /** 0–100: vertical focal point for square cover crops (default 50). */
  image_focus_y?: number | null;
  notes: string | null;
  /** Typed note block: note | variation | storage | substitution. */
  notes_type?: RecipeNoteType | null;
  /** Optional label/title for the note block (e.g. "Variation"). */
  notes_title?: string | null;
  ingredients: string | null;
  instructions: string | null;
  source_url: string | null;
  /** Machine-usable integer servings — source of truth for scaling math. */
  servings: number | null;
  /** Yield verb — "serves" or "makes". */
  yield_label?: RecipeYieldLabel | null;
  /** Yield quantity text (supports "6 to 8", "about 1/2"). */
  yield_quantity?: string | null;
  /** Yield unit when needed ("cups", "loaf", "cookies"). */
  yield_unit?: string | null;
  /** Human-readable display line ("Serves 6 to 8", "Makes 12 cups"). */
  yield_display?: string | null;
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

export type ProductPriceBasis = "package" | "weight" | "unit";

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
  /**
   * Form/state of the ingredient (e.g. "yellow", "canned diced", "dried").
   * Pairs with `name` to produce the human display label.
   */
  variant?: string | null;
  /**
   * Culinary subcategory tier (e.g. "Alliums", "Leafy Greens", "Whole Grains").
   * Sits between `grocery_category` and the ingredient itself.
   */
  taxonomy_subcategory?: string | null;
  /** Sensible default units for this ingredient (e.g. ["g","oz","lb","each"]). */
  default_units?: string[] | null;
  /** Any subset of "counter" | "pantry" | "fridge" | "freezer". */
  storage_hints?: IngredientStorageHint[] | null;
  /** Rough shelf life on the counter, in days. Informational only. */
  shelf_life_counter_days?: number | null;
  /** Rough shelf life in the fridge, in days. Informational only. */
  shelf_life_fridge_days?: number | null;
  /** Rough shelf life in the freezer, in days. Informational only. */
  shelf_life_freezer_days?: number | null;
  /** True when this ingredient is commonly sold in barcode-bearing packaged form. */
  packaged_common?: boolean;
  /** True for prepared inputs (stock, tofu, salsa, mayo, nut butter). */
  is_composite?: boolean;
  /** Stable machine slug mapping to the North America ingredient backbone taxonomy. */
  backbone_id?: string | null;
};

/** Allowed values for `IngredientRow.storage_hints`. */
export const INGREDIENT_STORAGE_HINTS = [
  "counter",
  "pantry",
  "fridge",
  "freezer",
] as const;
export type IngredientStorageHint = (typeof INGREDIENT_STORAGE_HINTS)[number];

/** Source identifier for where an alias came from. */
export type IngredientAliasSource =
  | "user"
  | "import"
  | "backbone"
  | "openfoodfacts"
  | "legacy";

/**
 * Synonym mapping to a canonical ingredient. Used by import/resolve pipelines
 * for fuzzy matching (e.g. "coriander leaves" → "Cilantro").
 */
export type IngredientAliasRow = {
  id: number;
  ingredient_id: number;
  alias: string;
  source?: IngredientAliasSource | string | null;
  created_at?: string;
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

/**
 * A preferred product that can satisfy a generic ingredient.
 * Ranked list (lower `rank` = higher preference). Acts like a personal
 * shopping shortlist — it does NOT show up as a separate inventory row.
 */
export type IngredientProductRow = {
  id: number;
  ingredient_id: number;
  rank: number;
  name: string;
  brand: string | null;
  url: string | null;
  barcode: string | null;
  notes: string | null;
  /** Per-product price. The parent ingredient inherits from the top-ranked product. */
  price: number | null;
  /** How to interpret `price`: package by default, or by weight/unit. */
  price_basis?: ProductPriceBasis | null;
  /** Amount for the price basis, e.g. 1 for "$8.99/lb". */
  price_basis_amount?: number | null;
  /** Unit for the price basis, e.g. "lb", "kg", "g", "oz", or "ea". */
  price_basis_unit?: string | null;
  /** Package size amount, paired with `unit_size_unit` (e.g. 500 + "g"). */
  unit_size_amount: number | null;
  /** Package size unit, one of INGREDIENT_UNITS (e.g. "g", "l", "oz", "count"). */
  unit_size_unit: string | null;
  created_at?: string;
  updated_at?: string;
};

export type RecipeIngredientSectionRow = {
  id: string;
  recipe_id: number;
  /** Heading for this ingredient group (e.g. "For the Dressing"). */
  heading: string;
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
  /** Preparation / state note (e.g. "finely chopped", "divided", "to serve"). */
  preparation?: string | null;
  /** Optional verbatim source line preserved for typographic fidelity. */
  display?: string | null;
  /** When true, this ingredient line is optional (e.g. garnish). */
  is_optional: boolean;
  created_at?: string;
  ingredients?: Pick<
    IngredientRow,
    | "id"
    | "name"
    | "density_g_per_ml"
    | "canonical_unit_weight_g"
    | "grocery_category"
  > | null;
};

export type RecipeInstructionStepRow = {
  id: number;
  recipe_id: number;
  /** Sequence number for the step, 1-based. */
  step_number: number;
  /** Short action-focused summary shown above the step text. */
  heading?: string | null;
  /** Single actionable instruction step. */
  text: string;
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
  unit: string | null;
  recipe_unit: string | null;
  notes: string | null;
};

/**
 * One alternative meal idea stored in `meal_plan_entries.suggestion_pool`.
 * The "active" pick lives in the normal row columns; the pool is the queue
 * the Cycle button pulls from.
 */
export type SuggestionCandidate = {
  /** Matches a library recipe by name; null when label-only. */
  recipe_id: number | null;
  /** Display title shown on the card. */
  label: string;
  /** Original LLM hint, used to re-resolve recipe_id if library changes. */
  recipe_title?: string | null;
  /** Optional free-form note (e.g. "use the ripe bananas"). */
  notes?: string | null;
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
  /** True when this row was generated by the LLM and hasn't been accepted yet. */
  is_suggestion?: boolean | null;
  /** Alternative picks the user can cycle through. Null/empty = refetch needed. */
  suggestion_pool?: SuggestionCandidate[] | null;
};

/**
 * Records that the user trashed a suggestion for this day+slot combination.
 * Auto-fill skips any (plan_date, meal_slot, sort_order) that has a row here.
 * Deleted when the user drops a real meal into the slot.
 */
export type MealPlanSlotDismissalRow = {
  id: number;
  owner_id: string;
  plan_date: string;
  meal_slot: string;
  sort_order: number;
  created_at?: string | null;
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
