import type { IngredientResolution } from "@/lib/ingredient-resolution";

export type ParsedIngredient = {
  name: string;
  amount: string | null;
  unit: string | null;
  is_optional: boolean;
};

export type ParsedIngredientSection = {
  title: string | null;
  ingredients: ParsedIngredient[];
};

export type ParsedInstructionStep = {
  body: string;
  timer_seconds_low: number | null;
  timer_seconds_high: number | null;
};

export type ParsedRecipe = {
  name: string;
  description: string | null;
  source_url: string | null;
  servings: number | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  meal_types: string[];
  ingredient_sections: ParsedIngredientSection[];
  instruction_steps: ParsedInstructionStep[];
  notes: string | null;
};

/* ------------------------------------------------------------------ */
/*  Draft review — data the client holds before confirming an import  */
/* ------------------------------------------------------------------ */

export type DraftIngredientOption = {
  id: number;
  name: string;
  parentName: string | null;
};

export type DraftRecipeData = {
  parsed: ParsedRecipe;
  resolutions: IngredientResolution[];
  existingIngredients: DraftIngredientOption[];
};
