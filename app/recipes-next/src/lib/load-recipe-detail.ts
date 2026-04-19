import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { loadRecipeInstructionStepsWithLegacyMigration } from "@/lib/recipe-instruction-steps-migrate";
import { parseLegacyInstructionsToSteps } from "@/lib/legacy-instructions-parse";
import type {
  IngredientRow,
  RecipeIngredientRow,
  RecipeIngredientSectionRow,
  RecipeInstructionStepRow,
  RecipeRow,
} from "@/types/database";

// Shared data-loading for the recipe detail view used by both the standalone
// /recipes/[id] page and the intercepted @modal/(.)recipes/[id] modal page.
// Keeping one loader avoids the two surfaces drifting as the detail view
// evolves.

export type RecipeDetailAvailableIngredient = {
  id: number;
  name: string;
  parentIngredientId: number | null;
  variantSortOrder: number;
};

export type RecipeDetailPayload = {
  recipe: RecipeRow;
  recipeIngredients: RecipeIngredientRow[];
  recipeIngredientSections: RecipeIngredientSectionRow[];
  recipeInstructionSteps: RecipeInstructionStepRow[];
  availableIngredients: RecipeDetailAvailableIngredient[];
};

export type OwnerLoadOutcome =
  | { status: "unconfigured" }
  | { status: "signed-out" }
  | { status: "not-found" }
  | { status: "redirect"; to: string }
  | { status: "error"; message: string }
  | { status: "ok"; data: RecipeDetailPayload };

export type CommunityLoadOutcome =
  | { status: "unconfigured" }
  | { status: "not-found" }
  | { status: "redirect"; to: string }
  | { status: "tombstone"; recipe: RecipeRow }
  | { status: "error"; message: string }
  | {
      status: "ok";
      data: RecipeDetailPayload & {
        isOwn: boolean;
        isSignedIn: boolean;
        inLibrary: boolean;
      };
    };

type RawIngredientJoin = {
  id: unknown;
  name: unknown;
  density_g_per_ml?: unknown;
  canonical_unit_weight_g?: unknown;
};

type RawRecipeIngredientRow = {
  id: unknown;
  recipe_id: unknown;
  ingredient_id: unknown;
  section_id: unknown;
  line_sort_order: unknown;
  amount: unknown;
  unit: unknown;
  preparation?: unknown;
  display?: unknown;
  is_optional?: unknown;
  created_at?: string;
  ingredients: RawIngredientJoin | RawIngredientJoin[] | null;
};

function normalizeAvailableIngredients(
  rows: unknown[],
): RecipeDetailAvailableIngredient[] {
  return (rows as Pick<
    IngredientRow,
    "id" | "name" | "parent_ingredient_id" | "variant_sort_order"
  >[]).map((ingredient) => ({
    id: Number(ingredient.id),
    name: String(ingredient.name ?? ""),
    parentIngredientId: ingredient.parent_ingredient_id
      ? Number(ingredient.parent_ingredient_id)
      : null,
    variantSortOrder: Number(ingredient.variant_sort_order ?? 0),
  }));
}

function normalizeRecipeIngredients(
  rows: RawRecipeIngredientRow[],
): RecipeIngredientRow[] {
  return rows.map((row) => {
    const ingredient = Array.isArray(row.ingredients)
      ? row.ingredients[0] ?? null
      : row.ingredients ?? null;
    const sid = row.section_id;
    const opt = row.is_optional;
    const is_optional =
      opt === true || opt === 1 || opt === "true" || opt === "t";
    const densityRaw = ingredient?.density_g_per_ml;
    const densityNum = densityRaw == null ? null : Number(densityRaw);
    const density_g_per_ml =
      typeof densityNum === "number" && Number.isFinite(densityNum) && densityNum > 0
        ? densityNum
        : null;
    const pieceWeightRaw = ingredient?.canonical_unit_weight_g;
    const pieceWeightNum =
      pieceWeightRaw == null ? null : Number(pieceWeightRaw);
    const canonical_unit_weight_g =
      typeof pieceWeightNum === "number" &&
      Number.isFinite(pieceWeightNum) &&
      pieceWeightNum > 0
        ? pieceWeightNum
        : null;
    return {
      id: Number(row.id),
      recipe_id: Number(row.recipe_id),
      ingredient_id: Number(row.ingredient_id),
      section_id:
        sid === null || sid === undefined || String(sid).trim() === ""
          ? null
          : String(sid),
      line_sort_order: Number(row.line_sort_order ?? 0),
      amount: row.amount == null ? null : String(row.amount),
      unit: row.unit == null ? null : String(row.unit),
      preparation: row.preparation == null ? null : String(row.preparation),
      display: row.display == null ? null : String(row.display),
      is_optional,
      created_at: row.created_at,
      ingredients: ingredient
        ? {
            id: Number(ingredient.id),
            name: String(ingredient.name ?? ""),
            density_g_per_ml,
            canonical_unit_weight_g,
          }
        : null,
    };
  });
}

function normalizeSections(rows: unknown[]): RecipeIngredientSectionRow[] {
  return (
    rows as {
      id: unknown;
      recipe_id: unknown;
      heading: unknown;
      sort_order: unknown;
      created_at?: string;
    }[]
  ).map((row) => ({
    id: String(row.id),
    recipe_id: Number(row.recipe_id),
    heading: row.heading == null ? "" : String(row.heading),
    sort_order: Number(row.sort_order ?? 0),
    created_at: row.created_at,
  }));
}

export async function loadOwnerRecipeDetail(
  id: string,
): Promise<OwnerLoadOutcome> {
  if (!isSupabaseConfigured()) return { status: "unconfigured" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "signed-out" };

  const [recipeResult, ingredientsResult, recipeIngredientsResult, sectionsResult] =
    await Promise.all([
      supabase.from("recipes").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("ingredients")
        .select("id, name, parent_ingredient_id, variant_sort_order")
        .order("name"),
      supabase
        .from("recipe_ingredients")
        .select(
          "id, recipe_id, ingredient_id, section_id, line_sort_order, amount, unit, preparation, display, is_optional, created_at, ingredients(id, name, density_g_per_ml, canonical_unit_weight_g)",
        )
        .eq("recipe_id", id),
      supabase
        .from("recipe_ingredient_sections")
        .select("id, recipe_id, heading, sort_order, created_at")
        .eq("recipe_id", id)
        .order("sort_order", { ascending: true }),
    ]);

  if (recipeResult.error || !recipeResult.data) {
    return { status: "not-found" };
  }

  const recipe = recipeResult.data as RecipeRow;
  // Non-owners (and owners viewing their own soft-deleted recipe) get redirected
  // to the public Community view, which handles the tombstone / visitor path.
  if (recipe.owner_id !== user.id || recipe.deleted_at) {
    return { status: "redirect", to: `/community/${id}` };
  }

  if (
    ingredientsResult.error ||
    recipeIngredientsResult.error ||
    sectionsResult.error
  ) {
    return {
      status: "error",
      message:
        ingredientsResult.error?.message ||
        recipeIngredientsResult.error?.message ||
        sectionsResult.error?.message ||
        "Failed to load recipe.",
    };
  }

  const recipeInstructionSteps = await loadRecipeInstructionStepsWithLegacyMigration(
    supabase,
    Number(recipe.id),
    recipe.instructions,
  );

  return {
    status: "ok",
    data: {
      recipe,
      availableIngredients: normalizeAvailableIngredients(
        ingredientsResult.data ?? [],
      ),
      recipeIngredients: normalizeRecipeIngredients(
        (recipeIngredientsResult.data ?? []) as RawRecipeIngredientRow[],
      ),
      recipeIngredientSections: normalizeSections(sectionsResult.data ?? []),
      recipeInstructionSteps,
    },
  };
}

export async function loadCommunityRecipeDetail(
  id: string,
): Promise<CommunityLoadOutcome> {
  if (!isSupabaseConfigured()) return { status: "unconfigured" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const recipeResult = await supabase
    .from("recipes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (recipeResult.error || !recipeResult.data) {
    return { status: "not-found" };
  }

  const recipe = recipeResult.data as RecipeRow;
  const isOwn = !!user && recipe.owner_id === user.id;

  // Owners never browse their own recipes through the Community view.
  if (isOwn && !recipe.deleted_at) {
    return { status: "redirect", to: `/recipes/${id}` };
  }

  let inLibrary = false;
  if (user) {
    const libraryLookup = await supabase
      .from("user_recipe_library")
      .select("recipe_id")
      .eq("user_id", user.id)
      .eq("recipe_id", recipe.id)
      .maybeSingle();
    inLibrary = !!libraryLookup.data;
  }

  if (recipe.deleted_at) {
    if (!user || !inLibrary || isOwn) {
      return { status: "not-found" };
    }
    return { status: "tombstone", recipe };
  }

  const [
    ingredientsResult,
    recipeIngredientsResult,
    sectionsResult,
    instructionStepsResult,
  ] = await Promise.all([
    supabase
      .from("ingredients")
      .select("id, name, parent_ingredient_id, variant_sort_order")
      .order("name"),
    supabase
      .from("recipe_ingredients")
      .select(
        "id, recipe_id, ingredient_id, section_id, line_sort_order, amount, unit, preparation, display, is_optional, created_at, ingredients(id, name, density_g_per_ml, canonical_unit_weight_g)",
      )
      .eq("recipe_id", id),
    supabase
      .from("recipe_ingredient_sections")
      .select("id, recipe_id, heading, sort_order, created_at")
      .eq("recipe_id", id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("recipe_instruction_steps")
      .select(
        "id, recipe_id, step_number, text, timer_seconds_low, timer_seconds_high, created_at",
      )
      .eq("recipe_id", id)
      .order("step_number", { ascending: true }),
  ]);

  if (recipeIngredientsResult.error || sectionsResult.error) {
    return {
      status: "error",
      message:
        recipeIngredientsResult.error?.message ||
        sectionsResult.error?.message ||
        "Failed to load recipe.",
    };
  }

  // We deliberately don't run the legacy-instructions write-through migration
  // for community viewers: RLS would block non-owners anyway, and we don't want
  // visitors triggering writes on other people's recipes. Use relational rows
  // if present; otherwise parse the legacy text blob purely for display.
  const rawSteps = (instructionStepsResult.data ?? []) as {
    id: unknown;
    recipe_id: unknown;
    step_number: unknown;
    text: unknown;
    timer_seconds_low: unknown;
    timer_seconds_high: unknown;
    created_at?: string;
  }[];
  const mappedSteps = rawSteps.map((row): RecipeInstructionStepRow | null => {
    const rid = Number(row.id);
    const recipe_id = Number(row.recipe_id);
    if (!Number.isFinite(rid) || !Number.isFinite(recipe_id)) return null;
    const timerLow =
      row.timer_seconds_low == null ? null : Number(row.timer_seconds_low);
    const timerHigh =
      row.timer_seconds_high == null ? null : Number(row.timer_seconds_high);
    return {
      id: rid,
      recipe_id,
      step_number: Number(row.step_number ?? 1) || 1,
      text: row.text == null ? "" : String(row.text),
      timer_seconds_low:
        typeof timerLow === "number" && Number.isFinite(timerLow)
          ? timerLow
          : null,
      timer_seconds_high:
        typeof timerHigh === "number" && Number.isFinite(timerHigh)
          ? timerHigh
          : null,
      created_at: row.created_at,
    };
  });
  let recipeInstructionSteps: RecipeInstructionStepRow[] = mappedSteps.filter(
    (row): row is RecipeInstructionStepRow => row != null,
  );

  if (recipeInstructionSteps.length === 0 && recipe.instructions) {
    const parsed = parseLegacyInstructionsToSteps(recipe.instructions);
    recipeInstructionSteps = parsed.map((text, idx) => ({
      id: -1 - idx,
      recipe_id: Number(recipe.id),
      step_number: idx + 1,
      text,
      timer_seconds_low: null,
      timer_seconds_high: null,
    }));
  }

  return {
    status: "ok",
    data: {
      recipe,
      availableIngredients: normalizeAvailableIngredients(
        ingredientsResult.data ?? [],
      ),
      recipeIngredients: normalizeRecipeIngredients(
        (recipeIngredientsResult.data ?? []) as RawRecipeIngredientRow[],
      ),
      recipeIngredientSections: normalizeSections(sectionsResult.data ?? []),
      recipeInstructionSteps,
      isOwn,
      isSignedIn: !!user,
      inLibrary,
    },
  };
}
