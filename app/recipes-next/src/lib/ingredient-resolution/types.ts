/**
 * Types for the ingredient resolution pipeline.
 *
 * When recipe ingredients arrive (typed by a user, or copied from a community
 * recipe) the pipeline resolves each name against the user's existing inventory
 * and returns a *plan* — a list of actions to take.
 */

/* ------------------------------------------------------------------ */
/*  Inventory snapshot passed into the resolver                       */
/* ------------------------------------------------------------------ */

export type InventoryIngredient = {
  id: number;
  name: string;
  parent_ingredient_id: number | null;
  category: string | null;
  grocery_category: string | null;
};

/* ------------------------------------------------------------------ */
/*  Resolution actions (one per incoming recipe ingredient name)      */
/* ------------------------------------------------------------------ */

/** Exact or trivially-normalized match — reuse existing ingredient directly. */
export type ExactMatchResolution = {
  action: "use_existing";
  recipeName: string;
  existingIngredientId: number;
  existingIngredientName: string;
  confidence: number;
  reason: string | null;
};

/**
 * The recipe ingredient is a variant of something already in inventory,
 * and the existing item is already a parent (has children) or is itself a
 * child. Create a new variant under the same parent.
 */
export type CreateVariantResolution = {
  action: "create_variant_under_existing";
  recipeName: string;
  /** The parent ingredient the new variant should live under. */
  parentIngredientId: number;
  parentIngredientName: string;
  /** Display name for the new ingredient (may be cleaned, e.g. "14oz Diced Tomatoes" → "Diced Tomatoes"). */
  cleanName: string;
  confidence: number;
  reason: string | null;
};

/**
 * The recipe ingredient and an existing standalone ingredient are both
 * variants of a shared concept that doesn't have a parent row yet.
 * We need to: create a new parent row, reparent the existing ingredient,
 * and create the new ingredient as a second child.
 */
export type CreateSiblingVariantResolution = {
  action: "create_sibling_variant";
  recipeName: string;
  /** The existing standalone ingredient that should become a sibling. */
  existingSiblingId: number;
  existingSiblingName: string;
  /** Name for the new parent ingredient (e.g. "Milk"). */
  parentName: string;
  /** Display name for the new ingredient. */
  cleanName: string;
  confidence: number;
  reason: string | null;
};

/** No match found — create a new standalone ingredient. */
export type CreateStandaloneResolution = {
  action: "create_standalone";
  recipeName: string;
  cleanName: string;
  confidence: number;
  reason: string | null;
};

export type IngredientResolution =
  | ExactMatchResolution
  | CreateVariantResolution
  | CreateSiblingVariantResolution
  | CreateStandaloneResolution;

/* ------------------------------------------------------------------ */
/*  The full plan returned by the pipeline                            */
/* ------------------------------------------------------------------ */

export type ResolutionPlan = {
  resolutions: IngredientResolution[];
  /** Items that require user confirmation before applying (restructures existing data). */
  needsConfirmation: boolean;
};

/* ------------------------------------------------------------------ */
/*  Result after applying the plan                                    */
/* ------------------------------------------------------------------ */

export type AppliedIngredient = {
  recipeName: string;
  ingredientId: number;
  ingredientName: string;
  wasCreated: boolean;
  action: IngredientResolution["action"];
};

export type ApplyPlanResult = {
  ok: true;
  applied: AppliedIngredient[];
} | {
  ok: false;
  error: string;
};
