import type {
  IngredientRow,
  InventoryItemRow,
  MealPlanEntryRow,
  PersonRow,
  RecipeIngredientRow,
  RecipeIngredientSectionRow,
  RecipeInstructionStepRow,
  RecipeRow,
} from "@/types/database";
import type { ShoppingListItem } from "@/app/actions/shop";
import type { PersonMacroCalories } from "@/lib/people-macros";

export function mockRecipe(overrides: Partial<RecipeRow> = {}): RecipeRow {
  return {
    id: 1,
    name: "Test recipe",
    description: null,
    image_url: null,
    image_urls: null,
    image_focus_y: 50,
    notes: null,
    ingredients: null,
    instructions: null,
    source_url: null,
    servings: 4,
    prep_time_minutes: 10,
    cook_time_minutes: 20,
    total_time_minutes: 30,
    calories: 420,
    protein_grams: 30,
    fat_grams: 12,
    carbs_grams: 45,
    meal_types: ["Dinner"],
    ...overrides,
  };
}

export function mockPerson(overrides: Partial<PersonRow> = {}): PersonRow {
  return {
    id: 1,
    name: "Alex",
    birth_date: "1990-01-15",
    weight: "70",
    height: "170 cm",
    daily_calorie_expenditure: "2200",
    calorie_min: "1800",
    calorie_max: "2400",
    calorie_target: "2000",
    protein_min_grams: "80",
    protein_max_grams: "120",
    protein_target_grams: "100",
    fat_min_grams: "50",
    fat_max_grams: "80",
    fat_target_grams: "65",
    carb_min_grams: "180",
    carb_max_grams: "260",
    carb_target_grams: "220",
    dietary_restrictions: null,
    allergies: null,
    ...overrides,
  };
}

export function mockMacroCalories(): PersonMacroCalories {
  return {
    targetCalories: 2000,
    proteinCal: 400,
    fatCal: 585,
    carbCal: 880,
    proteinGrams: 100,
    fatGrams: 65,
    carbGrams: 220,
  };
}

export function mockShoppingListItems(): ShoppingListItem[] {
  return [
    {
      ingredientId: 1,
      ingredientName: "Olive oil",
      category: "Pantry",
      groceryCategory: "Pantry",
      neededAmount: 2,
      neededUnit: "tbsp",
      onHandAmount: 0,
      onHandUnit: "tbsp",
      unitsMatch: true,
    },
    {
      ingredientId: 2,
      ingredientName: "Spinach",
      category: "Produce",
      groceryCategory: "Produce",
      neededAmount: 200,
      neededUnit: "g",
      onHandAmount: 100,
      onHandUnit: "g",
      unitsMatch: true,
    },
  ];
}

export function mockIngredient(overrides: Partial<IngredientRow> = {}): IngredientRow {
  return {
    id: 1,
    name: "Butter",
    full_item_name: null,
    full_item_name_alt: null,
    current_stock: "1",
    minimum_stock: "0",
    maximum_stock: "4",
    category: "Fridge",
    grocery_category: "Dairy",
    notes: null,
    ingredients_text: null,
    preferred_vendor: null,
    brand_or_manufacturer: null,
    parent_ingredient_id: null,
    variant_sort_order: 0,
    kcal: 717,
    fat_g: 81,
    protein_g: 0.9,
    carbs_g: 0.1,
    nutrition_basis: "per_100g",
    canonical_unit_weight_g: null,
    nutrition_source_name: null,
    nutrition_source_record_id: null,
    nutrition_source_url: null,
    nutrition_confidence: null,
    nutrition_needs_review: false,
    nutrition_notes: null,
    nutrition_serving_size_g: 100,
    ...overrides,
  };
}

export function mockInventoryItem(
  overrides: Partial<InventoryItemRow> = {},
): InventoryItemRow {
  return {
    id: 10,
    ingredient_id: 1,
    storage_location: "Fridge",
    quantity: 1,
    min_quantity: 0,
    max_quantity: 4,
    unit: "each",
    recipe_unit: "tbsp",
    notes: null,
    ...overrides,
  };
}

export function mockRecipeIngredientRow(
  overrides: Partial<RecipeIngredientRow> = {},
): RecipeIngredientRow {
  return {
    id: 100,
    recipe_id: 1,
    ingredient_id: 1,
    section_id: null,
    line_sort_order: 0,
    amount: "2",
    unit: "tbsp",
    is_optional: false,
    ingredients: { id: 1, name: "Butter" },
    ...overrides,
  };
}

export function mockIngredientSection(
  overrides: Partial<RecipeIngredientSectionRow> = {},
): RecipeIngredientSectionRow {
  return {
    id: "sec-1",
    recipe_id: 1,
    title: "Sauce",
    sort_order: 0,
    ...overrides,
  };
}

export function mockInstructionStep(
  overrides: Partial<RecipeInstructionStepRow> = {},
): RecipeInstructionStepRow {
  return {
    id: 200,
    recipe_id: 1,
    sort_order: 0,
    body: "Melt butter in a pan over medium heat.",
    timer_seconds_low: null,
    timer_seconds_high: null,
    ...overrides,
  };
}

export function mockMealPlanEntry(
  overrides: Partial<MealPlanEntryRow> = {},
): MealPlanEntryRow {
  return {
    id: 300,
    meal_plan_id: 1,
    plan_date: "2026-04-15",
    meal_slot: "dinner",
    recipe_id: 1,
    label: null,
    notes: null,
    sort_order: 0,
    servings: 4,
    ...overrides,
  };
}
