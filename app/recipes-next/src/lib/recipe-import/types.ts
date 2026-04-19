import type { IngredientResolution } from "@/lib/ingredient-resolution";
import type { RecipeNoteType, RecipeYieldLabel } from "@/types/database";

/* ------------------------------------------------------------------ */
/*  Parsed recipe shape — mirrors the authoring guide                 */
/* ------------------------------------------------------------------ */

export type ParsedTitle = {
  /** Base recipe name without subordinate extension. */
  primary: string;
  /** Subordinate continuation of the title (with/and/in/over…), optional. */
  qualifier: string | null;
};

export type ParsedYield = {
  label: RecipeYieldLabel | null;
  quantity: string | null;
  unit: string | null;
  display: string | null;
};

export type ParsedRecipeNote = {
  type: RecipeNoteType | null;
  title: string | null;
  text: string | null;
};

export type ParsedIngredient = {
  /** Canonical ingredient name (AP-style Title Case). */
  ingredient: string;
  amount: string | null;
  unit: string | null;
  /** Preparation / state attached to the line ("finely chopped", "divided"). */
  preparation: string | null;
  /** Optional verbatim source line preserved for typographic fidelity. */
  display: string | null;
  is_optional: boolean;
};

export type ParsedIngredientGroup = {
  /** Optional heading for the subgroup (e.g. "For the Dressing"). */
  heading: string | null;
  items: ParsedIngredient[];
};

export type ParsedInstructionStep = {
  /** 1-based sequence number, dense. */
  step_number: number;
  text: string;
  timer_seconds_low: number | null;
  timer_seconds_high: number | null;
};

export type ParsedRecipe = {
  /** Flat display title — derived from `title.primary (+ " " + qualifier)`. Kept in sync for back-compat. */
  name: string;
  title: ParsedTitle;
  /** Editorial intro/headnote before the recipe metadata. */
  headnote: string | null;
  description: string | null;
  source_url: string | null;
  /** Integer servings derived from yield.quantity when it's a plain number. Source of truth for scaling. */
  servings: number | null;
  yield: ParsedYield;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  meal_types: string[];
  ingredient_groups: ParsedIngredientGroup[];
  instruction_steps: ParsedInstructionStep[];
  /** Flat notes body — mirror of `recipe_note.text` for back-compat. */
  notes: string | null;
  recipe_note: ParsedRecipeNote;
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
  /**
   * Candidate hero-image URLs scraped from the original source page, in
   * priority order. Only populated for URL imports. When present, the
   * confirm step will try to download the first working candidate and
   * attach it instead of invoking the AI image generator.
   */
  sourceImageCandidates?: string[];
};
