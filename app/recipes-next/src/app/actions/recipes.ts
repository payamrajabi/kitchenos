"use server";

import {
  defaultStorageLocationForNewInventoryRow,
  DEFAULT_NEW_INVENTORY_MAX_QUANTITY,
  DEFAULT_NEW_INVENTORY_MIN_QUANTITY,
} from "@/lib/inventory-display";
import { inferGroceryCategoryFromName } from "@/lib/ingredient-grocery-category";
import {
  defaultRecipeUnitForStockUnit,
  INGREDIENT_UNIT_VALUES,
  normalizeIngredientUnitForStorage,
} from "@/lib/unit-mapping";
import { createClient } from "@/lib/supabase/server";
import { formatInstructionStepsToRecipeText } from "@/lib/legacy-instructions-parse";
import { RECIPE_DESCRIPTION_MAX_LENGTH } from "@/lib/recipes";
import { normalizeMealTypesForStorage } from "@/lib/recipe-meal-types";
import type { IngredientRow, RecipeIngredientRow, RecipeInstructionStepRow } from "@/types/database";
import { maybeAutofillNutrition } from "@/app/actions/ingredient-nutrition";
import {
  resolveRecipeIngredients,
  applyResolutionPlan,
  type InventoryIngredient,
} from "@/lib/ingredient-resolution";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const UPDATABLE_KEYS = new Set([
  "name",
  "description",
  "ingredients",
  "instructions",
  "notes",
  "source_url",
  "image_url",
  "image_urls",
  "image_focus_y",
  "servings",
  "calories",
  "protein_grams",
  "fat_grams",
  "carbs_grams",
  "prep_time_minutes",
  "cook_time_minutes",
  "total_time_minutes",
  "meal_types",
]);

const DEFAULT_RECIPE_INGREDIENT_UNIT = "g";

/** Columns copied when a user duplicates any recipe into their own account. */
const RECIPE_COPY_KEYS = [
  "name",
  "description",
  "image_url",
  "image_urls",
  "image_focus_y",
  "notes",
  "ingredients",
  "instructions",
  "source_url",
  "servings",
  "prep_time_minutes",
  "cook_time_minutes",
  "total_time_minutes",
  "calories",
  "protein_grams",
  "fat_grams",
  "carbs_grams",
  "meal_types",
] as const;

function buildRecipeCopyInsert(source: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of RECIPE_COPY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      out[key] = source[key];
    }
  }

  const numKeys = [
    "servings",
    "calories",
    "protein_grams",
    "fat_grams",
    "carbs_grams",
    "prep_time_minutes",
    "cook_time_minutes",
    "total_time_minutes",
    "image_focus_y",
  ] as const;
  for (const key of numKeys) {
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      out[key] = parseIntOrNull(out[key]);
    }
  }

  out.updated_at = new Date().toISOString();
  return out;
}

function normalizeUnitForRecipeIngredientInsert(raw: unknown): string {
  const s = raw == null ? "" : String(raw).trim();
  if (s === "") return DEFAULT_RECIPE_INGREDIENT_UNIT;
  const n = normalizeIngredientUnitForStorage(s);
  if (n && INGREDIENT_UNIT_VALUES.has(n)) return n;
  return DEFAULT_RECIPE_INGREDIENT_UNIT;
}

function parseIntOrNull(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    return Math.trunc(raw);
  }
  const t = String(raw).trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function normalizeRecipeIngredientJoin(raw: unknown): RecipeIngredientRow["ingredients"] {
  if (!raw) return null;
  const source = Array.isArray(raw) ? raw[0] : raw;
  if (!source || typeof source !== "object") return null;
  const row = source as Record<string, unknown>;
  const densityRaw = row.density_g_per_ml;
  const densityNum =
    densityRaw == null ? null : Number(densityRaw);
  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    density_g_per_ml:
      typeof densityNum === "number" && Number.isFinite(densityNum) && densityNum > 0
        ? densityNum
        : null,
  };
}

function normalizeRecipeIngredientRow(raw: unknown): RecipeIngredientRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = Number(row.id);
  const recipeId = Number(row.recipe_id);
  const ingredientId = Number(row.ingredient_id);
  if (!Number.isFinite(id) || !Number.isFinite(recipeId) || !Number.isFinite(ingredientId)) {
    return null;
  }
  const sectionRaw = row.section_id;
  const section_id =
    sectionRaw === null || sectionRaw === undefined ? null : String(sectionRaw);
  const line_sort_order = Number(row.line_sort_order ?? 0);
  const rawOptional = row.is_optional;
  const is_optional =
    rawOptional === true ||
    rawOptional === "true" ||
    rawOptional === 1 ||
    rawOptional === "t";
  return {
    id,
    recipe_id: recipeId,
    ingredient_id: ingredientId,
    section_id,
    line_sort_order: Number.isFinite(line_sort_order) ? line_sort_order : 0,
    amount: row.amount == null ? null : String(row.amount),
    unit: row.unit == null ? null : String(row.unit),
    is_optional,
    created_at: row.created_at == null ? undefined : String(row.created_at),
    ingredients: normalizeRecipeIngredientJoin(row.ingredients),
  };
}

function revalidateRecipeIngredientPaths(recipeId: number) {
  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/inventory");
  revalidatePath("/community");
}

function safeInt(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeInstructionStepRow(raw: unknown): RecipeInstructionStepRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = Number(row.id);
  const recipe_id = Number(row.recipe_id);
  const sort_order = Number(row.sort_order ?? 0);
  if (!Number.isFinite(id) || !Number.isFinite(recipe_id)) return null;
  return {
    id,
    recipe_id,
    sort_order: Number.isFinite(sort_order) ? sort_order : 0,
    body: row.body == null ? "" : String(row.body),
    timer_seconds_low: safeInt(row.timer_seconds_low),
    timer_seconds_high: safeInt(row.timer_seconds_high),
    created_at: row.created_at == null ? undefined : String(row.created_at),
  };
}

async function syncRecipeInstructionsTextFromSteps(
  supabase: Awaited<ReturnType<typeof createClient>>,
  recipeId: number,
) {
  const { data } = await supabase
    .from("recipe_instruction_steps")
    .select("body")
    .eq("recipe_id", recipeId)
    .order("sort_order", { ascending: true });
  const bodies = (data ?? []).map((r) => String((r as { body: unknown }).body ?? ""));
  const text = formatInstructionStepsToRecipeText(bodies);
  await supabase
    .from("recipes")
    .update({
      instructions: text.trim() === "" ? null : text,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recipeId);
}

const RECIPE_INGREDIENT_SELECT =
  "id, recipe_id, ingredient_id, section_id, line_sort_order, amount, unit, is_optional, created_at, ingredients(id, name, density_g_per_ml)";

async function loadRecipeIngredientRowByLineId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lineId: number,
) {
  const { data, error } = await supabase
    .from("recipe_ingredients")
    .select(RECIPE_INGREDIENT_SELECT)
    .eq("id", lineId)
    .maybeSingle();

  if (error) return { ok: false as const, error: error.message };

  const row = normalizeRecipeIngredientRow(data);
  if (!row) {
    return { ok: false as const, error: "Recipe ingredient not found." };
  }
  return { ok: true as const, row };
}

async function nextLineSortOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  recipeId: number,
  sectionId: string | null,
) {
  let q = supabase
    .from("recipe_ingredients")
    .select("line_sort_order")
    .eq("recipe_id", recipeId)
    .order("line_sort_order", { ascending: false })
    .limit(1);
  q = sectionId === null ? q.is("section_id", null) : q.eq("section_id", sectionId);
  const { data, error } = await q;
  if (error) return { ok: false as const, error: error.message };
  const top = data?.[0]?.line_sort_order;
  const n = typeof top === "number" ? top : Number(top);
  const last = Number.isFinite(n) ? n : -1;
  return { ok: true as const, next: last + 1 };
}

/**
 * Default unit for a new recipe line: Inventory "Recipe unit" when set, otherwise
 * the usual stock→recipe default, otherwise grams.
 */
async function resolveDefaultRecipeIngredientUnit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ingredientId: number,
): Promise<string> {
  const { data, error } = await supabase
    .from("inventory_items")
    .select("unit, recipe_unit")
    .eq("ingredient_id", ingredientId);

  if (error || !data?.length) {
    return DEFAULT_RECIPE_INGREDIENT_UNIT;
  }

  for (const row of data) {
    const raw = row.recipe_unit != null ? String(row.recipe_unit).trim() : "";
    if (!raw) continue;
    const norm = normalizeIngredientUnitForStorage(raw);
    if (norm && INGREDIENT_UNIT_VALUES.has(norm)) {
      return norm;
    }
  }

  for (const row of data) {
    const stock = row.unit != null ? String(row.unit).trim() : "";
    if (!stock) continue;
    const fromStock = defaultRecipeUnitForStockUnit(stock);
    if (fromStock) return fromStock;
  }

  return DEFAULT_RECIPE_INGREDIENT_UNIT;
}

async function ensureInventoryRowForIngredient(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ingredient: Pick<IngredientRow, "id" | "category">,
) {
  const { data: existing, error: existingError } = await supabase
    .from("inventory_items")
    .select("id")
    .eq("ingredient_id", ingredient.id)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    return { ok: false as const, error: existingError.message };
  }
  if (existing?.id != null) {
    return { ok: true as const };
  }

  const storage_location = defaultStorageLocationForNewInventoryRow(
    {
      id: ingredient.id,
      name: "",
      full_item_name: null,
      full_item_name_alt: null,
      current_stock: null,
      minimum_stock: null,
      maximum_stock: null,
      category: ingredient.category ?? null,
      notes: null,
      ingredients_text: null,
    },
    "Pantry",
  );

  const { error } = await supabase.from("inventory_items").insert({
    ingredient_id: ingredient.id,
    storage_location,
    quantity: null,
    unit: null,
    min_quantity: DEFAULT_NEW_INVENTORY_MIN_QUANTITY,
    max_quantity: DEFAULT_NEW_INVENTORY_MAX_QUANTITY,
  });

  if (error) {
    return { ok: false as const, error: error.message };
  }
  return { ok: true as const };
}

/**
 * Load the current user's full ingredient list in the shape the resolution
 * pipeline expects.
 */
async function loadUserInventoryIngredients(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<InventoryIngredient[]> {
  const { data } = await supabase
    .from("ingredients")
    .select("id, name, parent_ingredient_id, category, grocery_category");
  if (!data) return [];
  return data.map((row) => ({
    id: Number(row.id),
    name: String(row.name ?? ""),
    parent_ingredient_id:
      row.parent_ingredient_id != null ? Number(row.parent_ingredient_id) : null,
    category: row.category as string | null,
    grocery_category: (row as Record<string, unknown>).grocery_category as string | null,
  }));
}

/**
 * Resolve a single ingredient name against the user's inventory using the
 * full resolution pipeline (deterministic + LLM), then apply the plan.
 *
 * Returns the resolved ingredient id and whether it was newly created.
 */
async function resolveAndApplySingleIngredient(
  supabase: Awaited<ReturnType<typeof createClient>>,
  name: string,
): Promise<
  | { ok: true; ingredientId: number; ingredientName: string; wasCreated: boolean }
  | { ok: false; error: string }
> {
  const inventory = await loadUserInventoryIngredients(supabase);
  const plan = await resolveRecipeIngredients([name], inventory);

  if (plan.resolutions.length === 0) {
    return { ok: false, error: "Could not resolve ingredient." };
  }

  const result = await applyResolutionPlan(supabase, plan);
  if (!result.ok) return result;

  const applied = result.applied[0];
  if (!applied) return { ok: false, error: "Could not resolve ingredient." };

  return {
    ok: true,
    ingredientId: applied.ingredientId,
    ingredientName: applied.ingredientName,
    wasCreated: applied.wasCreated,
  };
}

async function insertRecipeIngredientLine(
  supabase: Awaited<ReturnType<typeof createClient>>,
  recipeId: number,
  ingredientId: number,
  sectionId: string | null,
) {
  const ord = await nextLineSortOrder(supabase, recipeId, sectionId);
  if (!ord.ok) return ord;

  const defaultUnit = await resolveDefaultRecipeIngredientUnit(supabase, ingredientId);

  const { data, error } = await supabase
    .from("recipe_ingredients")
    .insert({
      recipe_id: recipeId,
      ingredient_id: ingredientId,
      amount: null,
      unit: defaultUnit,
      is_optional: false,
      section_id: sectionId,
      line_sort_order: ord.next,
    })
    .select(RECIPE_INGREDIENT_SELECT)
    .single();

  if (error || !data) {
    return { ok: false as const, error: error?.message ?? "Could not add ingredient line." };
  }
  const row = normalizeRecipeIngredientRow(data);
  if (!row) return { ok: false as const, error: "Recipe ingredient not found." };
  return { ok: true as const, row };
}

export async function createRecipeAndRedirectAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/recipes");
  }

  const { data, error } = await supabase
    .from("recipes")
    .insert({ name: "New recipe" })
    .select("id")
    .single();

  if (error || data?.id == null) {
    redirect("/recipes");
  }

  const id = Number(data.id);
  revalidatePath("/recipes");
  redirect(`/recipes/${id}`);
}

export async function updateRecipeAction(
  recipeId: number,
  patch: Record<string, unknown>,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const updates: Record<string, string | number | null | string[]> = {};

  for (const [key, raw] of Object.entries(patch)) {
    if (!UPDATABLE_KEYS.has(key)) continue;
    if (
      key === "servings" ||
      key === "calories" ||
      key === "protein_grams" ||
      key === "fat_grams" ||
      key === "carbs_grams" ||
      key === "prep_time_minutes" ||
      key === "cook_time_minutes" ||
      key === "total_time_minutes"
    ) {
      updates[key] = parseIntOrNull(raw);
    } else if (key === "name") {
      const s = String(raw ?? "").trim();
      if (!s) return { ok: false as const, error: "Name is required." };
      updates[key] = s;
    } else if (key === "image_url") {
      const s = String(raw ?? "").trim();
      updates[key] = s === "" ? null : s;
    } else if (key === "image_urls") {
      if (raw === null || raw === undefined) {
        updates[key] = null;
      } else if (Array.isArray(raw)) {
        const urls = raw.filter(
          (u): u is string => typeof u === "string" && u.trim() !== "",
        );
        updates[key] = urls.length ? urls : null;
      } else {
        continue;
      }
    } else if (key === "image_focus_y") {
      const n = parseIntOrNull(raw);
      if (n === null) {
        updates[key] = null;
      } else {
        updates[key] = Math.min(100, Math.max(0, n));
      }
    } else if (key === "meal_types") {
      updates[key] = normalizeMealTypesForStorage(raw);
    } else if (key === "description") {
      let s = String(raw ?? "").trim();
      if (s.length > RECIPE_DESCRIPTION_MAX_LENGTH) {
        s = s.slice(0, RECIPE_DESCRIPTION_MAX_LENGTH);
      }
      updates[key] = s === "" ? null : s;
    } else {
      const s = String(raw ?? "").trim();
      updates[key] = s === "" ? null : s;
    }
  }

  if (Object.keys(updates).length === 0) {
    return { ok: true as const };
  }

  const stamp = new Date().toISOString();
  const body = { ...updates, updated_at: stamp };

  let { error } = await supabase.from("recipes").update(body).eq("id", recipeId);

  const msg = error?.message ?? "";
  if (
    error &&
    Object.prototype.hasOwnProperty.call(updates, "image_focus_y") &&
    msg.includes("image_focus_y")
  ) {
    const { image_focus_y: _drop, ...withoutFocus } = updates;
    void _drop;
    const retry = await supabase
      .from("recipes")
      .update({ ...withoutFocus, updated_at: stamp })
      .eq("id", recipeId);
    error = retry.error;
  }

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);
  return { ok: true as const };
}

export async function addRecipeIngredientAction(
  recipeId: number,
  ingredientId: number,
  sectionId: string | null = null,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const result = await insertRecipeIngredientLine(supabase, recipeId, ingredientId, sectionId);
  if (!result.ok) return result;

  revalidateRecipeIngredientPaths(recipeId);
  return { ok: true as const, row: result.row };
}

export async function createIngredientAndAddToRecipeAction(
  recipeId: number,
  rawName: string,
  sectionId: string | null = null,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const name = rawName.trim();
  if (!name) {
    return { ok: false as const, error: "Ingredient name is required." };
  }

  const resolved = await resolveAndApplySingleIngredient(supabase, name);
  if (!resolved.ok) return resolved;

  const attached = await insertRecipeIngredientLine(
    supabase,
    recipeId,
    resolved.ingredientId,
    sectionId,
  );
  if (!attached.ok) return attached;

  if (resolved.wasCreated) void maybeAutofillNutrition(resolved.ingredientId);

  revalidateRecipeIngredientPaths(recipeId);
  return {
    ok: true as const,
    ingredientCreated: resolved.wasCreated,
    row: attached.row,
  };
}

export async function createIngredientAndAssignToRecipeLineAction(
  recipeId: number,
  lineId: number,
  rawName: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const name = rawName.trim();
  if (!name) {
    return { ok: false as const, error: "Ingredient name is required." };
  }

  const resolved = await resolveAndApplySingleIngredient(supabase, name);
  if (!resolved.ok) return resolved;

  const defaultUnit = await resolveDefaultRecipeIngredientUnit(
    supabase,
    resolved.ingredientId,
  );

  const { error: updateError } = await supabase
    .from("recipe_ingredients")
    .update({ ingredient_id: resolved.ingredientId, unit: defaultUnit })
    .eq("recipe_id", recipeId)
    .eq("id", lineId);

  if (updateError) {
    return { ok: false as const, error: updateError.message };
  }

  if (resolved.wasCreated) void maybeAutofillNutrition(resolved.ingredientId);

  const row = await loadRecipeIngredientRowByLineId(supabase, lineId);
  if (!row.ok) return row;

  revalidateRecipeIngredientPaths(recipeId);
  return {
    ok: true as const,
    ingredientCreated: resolved.wasCreated,
    row: row.row,
  };
}

export async function updateRecipeIngredientAction(
  recipeId: number,
  lineId: number,
  patch: {
    amount?: string | null;
    unit?: string | null;
    ingredient_id?: number;
    is_optional?: boolean;
  },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const updates: {
    amount?: string | null;
    unit?: string | null;
    ingredient_id?: number;
    is_optional?: boolean;
  } = {};

  if (Object.prototype.hasOwnProperty.call(patch, "amount")) {
    const amount = String(patch.amount ?? "").trim();
    updates.amount = amount === "" ? null : amount;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "unit")) {
    const unit = String(patch.unit ?? "").trim();
    const normalized = normalizeIngredientUnitForStorage(unit);
    if (normalized === "") {
      updates.unit = DEFAULT_RECIPE_INGREDIENT_UNIT;
    } else if (!INGREDIENT_UNIT_VALUES.has(normalized)) {
      return { ok: false as const, error: "Invalid recipe unit." };
    } else {
      updates.unit = normalized;
    }
  }

  let newIngredientIdForDefaultUnit: number | null = null;
  if (Object.prototype.hasOwnProperty.call(patch, "ingredient_id")) {
    const ingredientId = Number(patch.ingredient_id);
    if (!Number.isFinite(ingredientId) || ingredientId <= 0) {
      return { ok: false as const, error: "Invalid ingredient." };
    }
    updates.ingredient_id = Math.trunc(ingredientId);
    if (!Object.prototype.hasOwnProperty.call(patch, "unit")) {
      newIngredientIdForDefaultUnit = updates.ingredient_id;
    }
  }

  if (newIngredientIdForDefaultUnit != null) {
    updates.unit = await resolveDefaultRecipeIngredientUnit(supabase, newIngredientIdForDefaultUnit);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "is_optional")) {
    updates.is_optional = Boolean(patch.is_optional);
  }

  if (Object.keys(updates).length === 0) {
    const unchanged = await loadRecipeIngredientRowByLineId(supabase, lineId);
    if (!unchanged.ok) return unchanged;
    return { ok: true as const, row: unchanged.row };
  }

  const { error } = await supabase
    .from("recipe_ingredients")
    .update(updates)
    .eq("recipe_id", recipeId)
    .eq("id", lineId);

  if (error) return { ok: false as const, error: error.message };

  const row = await loadRecipeIngredientRowByLineId(supabase, lineId);
  if (!row.ok) return row;

  revalidateRecipeIngredientPaths(recipeId);
  return { ok: true as const, row: row.row };
}

/**
 * Sets display order for all lines in one section (or unsectioned rows when sectionId is null).
 * orderedLineIds must list every line in that section exactly once, in the new order.
 */
export async function reorderRecipeIngredientsInSectionAction(
  recipeId: number,
  sectionId: string | null,
  orderedLineIds: number[],
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  if (!Array.isArray(orderedLineIds) || orderedLineIds.length === 0) {
    return { ok: false as const, error: "Nothing to reorder." };
  }

  const seen = new Set<number>();
  for (const raw of orderedLineIds) {
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) {
      return { ok: false as const, error: "Invalid ingredient order." };
    }
    seen.add(id);
  }

  let q = supabase.from("recipe_ingredients").select("id").eq("recipe_id", recipeId);
  if (sectionId === null) {
    q = q.is("section_id", null);
  } else {
    q = q.eq("section_id", sectionId);
  }

  const { data: existing, error: fetchErr } = await q;
  if (fetchErr) return { ok: false as const, error: fetchErr.message };

  const existingIds = new Set((existing ?? []).map((r) => Number(r.id)));
  if (existingIds.size !== orderedLineIds.length) {
    return { ok: false as const, error: "Ingredient list mismatch." };
  }
  for (const id of orderedLineIds) {
    if (!existingIds.has(id)) {
      return { ok: false as const, error: "Ingredient list mismatch." };
    }
  }

  for (let i = 0; i < orderedLineIds.length; i++) {
    const lineId = orderedLineIds[i];
    const { error } = await supabase
      .from("recipe_ingredients")
      .update({ line_sort_order: i })
      .eq("recipe_id", recipeId)
      .eq("id", lineId);
    if (error) return { ok: false as const, error: error.message };
  }

  revalidateRecipeIngredientPaths(recipeId);
  return { ok: true as const };
}

/**
 * Full-table reorder for the simple (non–multi-component) ingredients UI.
 * When the recipe has exactly one component section, any orphan lines (section_id null)
 * are attached to that section so order matches what you see in one list.
 */
export async function reorderRecipeIngredientsFlatLayoutAction(
  recipeId: number,
  orderedLineIds: number[],
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  if (!Array.isArray(orderedLineIds) || orderedLineIds.length === 0) {
    return { ok: false as const, error: "Nothing to reorder." };
  }

  const seen = new Set<number>();
  for (const raw of orderedLineIds) {
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) {
      return { ok: false as const, error: "Invalid ingredient order." };
    }
    seen.add(id);
  }

  const { data: allLines, error: linesErr } = await supabase
    .from("recipe_ingredients")
    .select("id")
    .eq("recipe_id", recipeId);

  if (linesErr) return { ok: false as const, error: linesErr.message };

  const dbIds = new Set((allLines ?? []).map((r) => Number(r.id)));
  if (dbIds.size !== orderedLineIds.length) {
    return { ok: false as const, error: "Ingredient list mismatch." };
  }
  for (const id of orderedLineIds) {
    if (!dbIds.has(id)) {
      return { ok: false as const, error: "Ingredient list mismatch." };
    }
  }

  const { data: secs, error: secErr } = await supabase
    .from("recipe_ingredient_sections")
    .select("id")
    .eq("recipe_id", recipeId)
    .order("sort_order", { ascending: true });

  if (secErr) return { ok: false as const, error: secErr.message };

  const secCount = secs?.length ?? 0;
  if (secCount >= 2) {
    return { ok: false as const, error: "Use component sections to reorder." };
  }

  const soleSectionId = secCount === 1 && secs![0]?.id != null ? String(secs![0].id) : null;

  if (soleSectionId) {
    const { error: assignErr } = await supabase
      .from("recipe_ingredients")
      .update({ section_id: soleSectionId })
      .eq("recipe_id", recipeId)
      .is("section_id", null);

    if (assignErr) return { ok: false as const, error: assignErr.message };
  }

  for (let i = 0; i < orderedLineIds.length; i++) {
    const lineId = orderedLineIds[i];
    const payload: { line_sort_order: number; section_id?: string | null } = {
      line_sort_order: i,
    };
    if (soleSectionId) {
      payload.section_id = soleSectionId;
    }

    const { error } = await supabase
      .from("recipe_ingredients")
      .update(payload)
      .eq("recipe_id", recipeId)
      .eq("id", lineId);

    if (error) return { ok: false as const, error: error.message };
  }

  revalidateRecipeIngredientPaths(recipeId);
  return { ok: true as const };
}

export async function deleteRecipeIngredientAction(recipeId: number, lineId: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const { error } = await supabase
    .from("recipe_ingredients")
    .delete()
    .eq("recipe_id", recipeId)
    .eq("id", lineId);

  if (error) return { ok: false as const, error: error.message };

  revalidateRecipeIngredientPaths(recipeId);
  return { ok: true as const };
}

export async function addRecipeIngredientSectionAction(recipeId: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const { data: existingSecs, error: listErr } = await supabase
    .from("recipe_ingredient_sections")
    .select("id, sort_order")
    .eq("recipe_id", recipeId)
    .order("sort_order", { ascending: true });

  if (listErr) return { ok: false as const, error: listErr.message };

  if (!existingSecs?.length) {
    const { data: s1, error: e1 } = await supabase
      .from("recipe_ingredient_sections")
      .insert({ recipe_id: recipeId, title: "Ingredients", sort_order: 0 })
      .select("id, recipe_id, title, sort_order, created_at")
      .single();
    if (e1 || !s1) return { ok: false as const, error: e1?.message ?? "Could not create section." };

    const { data: s2, error: e2 } = await supabase
      .from("recipe_ingredient_sections")
      .insert({ recipe_id: recipeId, title: "New component", sort_order: 1 })
      .select("id, recipe_id, title, sort_order, created_at")
      .single();
    if (e2 || !s2) return { ok: false as const, error: e2?.message ?? "Could not create section." };

    const sid1 = String(s1.id);
    const { data: lines, error: linesErr } = await supabase
      .from("recipe_ingredients")
      .select("id")
      .eq("recipe_id", recipeId)
      .order("line_sort_order", { ascending: true })
      .order("id", { ascending: true });

    if (linesErr) return { ok: false as const, error: linesErr.message };

    for (let i = 0; i < (lines?.length ?? 0); i++) {
      const lid = Number(lines![i].id);
      const { error: uerr } = await supabase
        .from("recipe_ingredients")
        .update({ section_id: sid1, line_sort_order: i })
        .eq("id", lid);
      if (uerr) return { ok: false as const, error: uerr.message };
    }
  } else {
    const maxSort = existingSecs.reduce((m, s) => Math.max(m, Number(s.sort_order ?? 0)), -1);
    const { error: en } = await supabase.from("recipe_ingredient_sections").insert({
      recipe_id: recipeId,
      title: "New component",
      sort_order: maxSort + 1,
    });
    if (en) return { ok: false as const, error: en.message };
  }

  revalidateRecipeIngredientPaths(recipeId);
  return { ok: true as const };
}

export async function updateRecipeIngredientSectionAction(sectionId: string, rawTitle: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const { data: sec, error: selErr } = await supabase
    .from("recipe_ingredient_sections")
    .select("recipe_id")
    .eq("id", sectionId)
    .maybeSingle();

  if (selErr) return { ok: false as const, error: selErr.message };
  if (!sec?.recipe_id) return { ok: false as const, error: "Section not found." };

  const recipeId = Number(sec.recipe_id);
  const title = rawTitle.trim();

  const { error } = await supabase
    .from("recipe_ingredient_sections")
    .update({ title })
    .eq("id", sectionId);

  if (error) return { ok: false as const, error: error.message };

  revalidateRecipeIngredientPaths(recipeId);
  return { ok: true as const };
}

export async function deleteRecipeIngredientSectionAction(recipeId: number, sectionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const { data: sec, error: selErr } = await supabase
    .from("recipe_ingredient_sections")
    .select("recipe_id")
    .eq("id", sectionId)
    .maybeSingle();

  if (selErr) return { ok: false as const, error: selErr.message };
  if (!sec?.recipe_id) return { ok: false as const, error: "Component not found." };

  if (Number(sec.recipe_id) !== recipeId) {
    return { ok: false as const, error: "Component not found." };
  }

  const { error } = await supabase.from("recipe_ingredient_sections").delete().eq("id", sectionId);

  if (error) return { ok: false as const, error: error.message };

  revalidateRecipeIngredientPaths(recipeId);
  return { ok: true as const };
}

/**
 * Add a recipe owned by someone else to the current user's library. Library
 * entries are pointers — they always show the live recipe row.
 */
export async function addRecipeToLibraryAction(recipeId: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const { data: recipe, error: recErr } = await supabase
    .from("recipes")
    .select("id, owner_id, deleted_at")
    .eq("id", recipeId)
    .maybeSingle();

  if (recErr || !recipe) {
    return { ok: false as const, error: "Recipe not found." };
  }
  if ((recipe as { deleted_at?: string | null }).deleted_at) {
    return { ok: false as const, error: "Recipe has been removed." };
  }
  if ((recipe as { owner_id?: string | null }).owner_id === user.id) {
    return { ok: false as const, error: "You already own this recipe." };
  }

  const { error } = await supabase
    .from("user_recipe_library")
    .insert({ user_id: user.id, recipe_id: recipeId });

  // Swallow duplicate-key errors — already in the library is a success.
  if (error && !error.message.toLowerCase().includes("duplicate")) {
    return { ok: false as const, error: error.message };
  }

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/community");
  return { ok: true as const };
}

/**
 * Remove a recipe from the current user's library. This does not affect the
 * underlying recipe.
 */
export async function removeRecipeFromLibraryAction(recipeId: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const { error } = await supabase
    .from("user_recipe_library")
    .delete()
    .eq("user_id", user.id)
    .eq("recipe_id", recipeId);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/community");
  return { ok: true as const };
}

/**
 * Make an independent copy of any recipe into the current user's account.
 * Unlike the library pointer, the copy does not stay in sync with the original —
 * edits by the original author no longer reach the copy.
 */
export async function duplicateRecipeAction(sourceRecipeId: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const { data: source, error: srcErr } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", sourceRecipeId)
    .maybeSingle();

  if (srcErr || !source) {
    return { ok: false as const, error: "Recipe not found." };
  }

  if ((source as { deleted_at?: string | null }).deleted_at) {
    return { ok: false as const, error: "Recipe has been removed." };
  }

  const sourceRow = source as Record<string, unknown>;
  const recipeInsert = buildRecipeCopyInsert(sourceRow);

  const { data: newRecipe, error: insertErr } = await supabase
    .from("recipes")
    .insert(recipeInsert)
    .select("id")
    .single();

  if (insertErr || !newRecipe) {
    return { ok: false as const, error: insertErr?.message ?? "Could not save recipe." };
  }

  const newRecipeId = Number(newRecipe.id);

  const rollbackRecipe = async () => {
    await supabase.from("recipes").delete().eq("id", newRecipeId);
  };

  const { data: sourceSections, error: secErr } = await supabase
    .from("recipe_ingredient_sections")
    .select("id, title, sort_order")
    .eq("recipe_id", sourceRecipeId)
    .order("sort_order", { ascending: true });

  if (secErr) {
    await rollbackRecipe();
    return { ok: false as const, error: secErr.message };
  }

  const sectionMap = new Map<string, string>();

  if (sourceSections?.length) {
    for (const sec of sourceSections) {
      const { data: newSec, error: secInsertErr } = await supabase
        .from("recipe_ingredient_sections")
        .insert({
          recipe_id: newRecipeId,
          title: sec.title,
          sort_order: sec.sort_order,
        })
        .select("id")
        .single();
      if (secInsertErr || !newSec) {
        await rollbackRecipe();
        return { ok: false as const, error: secInsertErr?.message ?? "Could not copy ingredient sections." };
      }
      sectionMap.set(String(sec.id), String(newSec.id));
    }
  }

  const { data: sourceLines, error: linesErr } = await supabase
    .from("recipe_ingredients")
    .select("ingredient_id, section_id, line_sort_order, amount, unit, is_optional")
    .eq("recipe_id", sourceRecipeId);

  if (linesErr) {
    await rollbackRecipe();
    return { ok: false as const, error: linesErr.message };
  }

  if (sourceLines?.length) {
    // Fetch source ingredient names for all lines
    const sourceIngredientIds = [
      ...new Set(
        sourceLines
          .map((l) => Number(l.ingredient_id))
          .filter((id) => Number.isFinite(id)),
      ),
    ];

    const { data: sourceIngRows, error: srcIngErr } = await supabase
      .from("ingredients")
      .select("id, name")
      .in("id", sourceIngredientIds);

    if (srcIngErr) {
      await rollbackRecipe();
      return { ok: false as const, error: srcIngErr.message };
    }

    const sourceIngNameById = new Map<number, string>();
    for (const row of sourceIngRows ?? []) {
      sourceIngNameById.set(Number(row.id), String(row.name ?? "").trim());
    }

    // Collect unique ingredient names to resolve in one batch
    const uniqueNames = [
      ...new Set(
        sourceIngredientIds
          .map((id) => sourceIngNameById.get(id))
          .filter((n): n is string => !!n),
      ),
    ];

    // Run the resolution pipeline (deterministic + LLM) in one batch call
    const inventory = await loadUserInventoryIngredients(supabase);
    const plan = await resolveRecipeIngredients(uniqueNames, inventory);
    const planResult = await applyResolutionPlan(supabase, plan);

    if (!planResult.ok) {
      await rollbackRecipe();
      return { ok: false as const, error: planResult.error };
    }

    // Build a lookup: source ingredient name → resolved ingredient id
    const resolvedByName = new Map<string, number>();
    for (const applied of planResult.applied) {
      resolvedByName.set(applied.recipeName, applied.ingredientId);
      if (applied.wasCreated) void maybeAutofillNutrition(applied.ingredientId);
    }

    // Create recipe_ingredients rows using resolved ids
    for (const line of sourceLines) {
      const sourceIngredientId = Number(line.ingredient_id);
      if (!Number.isFinite(sourceIngredientId)) continue;

      const ingName = sourceIngNameById.get(sourceIngredientId);
      if (!ingName) continue;

      const ingredientId = resolvedByName.get(ingName);
      if (ingredientId == null) continue;

      const newSectionId = line.section_id
        ? sectionMap.get(String(line.section_id)) ?? null
        : null;

      const unit = normalizeUnitForRecipeIngredientInsert(line.unit);

      const { error: riErr } = await supabase.from("recipe_ingredients").insert({
        recipe_id: newRecipeId,
        ingredient_id: ingredientId,
        section_id: newSectionId,
        line_sort_order: line.line_sort_order,
        amount: line.amount,
        unit,
        is_optional: line.is_optional ?? false,
      });

      if (riErr) {
        await rollbackRecipe();
        return { ok: false as const, error: riErr.message };
      }
    }
  }

  const { data: sourceInstructionSteps, error: srcInstErr } = await supabase
    .from("recipe_instruction_steps")
    .select("sort_order, body, timer_seconds_low, timer_seconds_high")
    .eq("recipe_id", sourceRecipeId)
    .order("sort_order", { ascending: true });

  if (srcInstErr) {
    await rollbackRecipe();
    return { ok: false as const, error: srcInstErr.message };
  }

  if (sourceInstructionSteps?.length) {
    const { error: instInsErr } = await supabase.from("recipe_instruction_steps").insert(
      sourceInstructionSteps.map((s) => {
        const raw = s as Record<string, unknown>;
        return {
          recipe_id: newRecipeId,
          sort_order: Number(s.sort_order ?? 0),
          body: String(s.body ?? ""),
          timer_seconds_low: safeInt(raw.timer_seconds_low),
          timer_seconds_high: safeInt(raw.timer_seconds_high),
        };
      }),
    );
    if (instInsErr) {
      await rollbackRecipe();
      return { ok: false as const, error: instInsErr.message };
    }
  }

  revalidatePath("/recipes");
  revalidatePath("/community");
  revalidatePath("/inventory");
  redirect(`/recipes/${newRecipeId}`);
}

export async function addRecipeInstructionStepAction(recipeId: number, rawBody?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const body = rawBody === undefined || rawBody === null ? "" : String(rawBody);

  const { data: top } = await supabase
    .from("recipe_instruction_steps")
    .select("sort_order")
    .eq("recipe_id", recipeId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  let nextSort = 0;
  if (top != null && top.sort_order != null) {
    const n = Number(top.sort_order);
    nextSort = Number.isFinite(n) ? n + 1 : 0;
  }

  const { data, error } = await supabase
    .from("recipe_instruction_steps")
    .insert({ recipe_id: recipeId, sort_order: nextSort, body })
    .select("id, recipe_id, sort_order, body, timer_seconds_low, timer_seconds_high, created_at")
    .single();

  if (error || !data) {
    return { ok: false as const, error: error?.message ?? "Could not add step." };
  }

  const row = normalizeInstructionStepRow(data);
  if (!row) return { ok: false as const, error: "Could not add step." };

  await syncRecipeInstructionsTextFromSteps(supabase, recipeId);
  revalidateRecipeIngredientPaths(recipeId);
  return { ok: true as const, row };
}

/**
 * Split one instruction step at `splitAt` (UTF-16 offset, same as textarea selection).
 * Text before the split stays in the original step; text after becomes a new step
 * immediately below, preserving order of other steps.
 */
export async function splitRecipeInstructionStepAction(
  recipeId: number,
  stepId: number,
  splitAt: number,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  if (!Number.isInteger(splitAt) || splitAt < 0) {
    return { ok: false as const, error: "Invalid split position." };
  }

  const { data: steps, error: listErr } = await supabase
    .from("recipe_instruction_steps")
    .select("id, sort_order, body")
    .eq("recipe_id", recipeId)
    .order("sort_order", { ascending: true });

  if (listErr) return { ok: false as const, error: listErr.message };

  const list = steps ?? [];
  const idx = list.findIndex((s) => Number((s as { id: unknown }).id) === stepId);
  if (idx < 0) return { ok: false as const, error: "Step not found." };

  const body = String((list[idx] as { body: unknown }).body ?? "");
  if (splitAt > body.length) {
    return { ok: false as const, error: "Invalid split position." };
  }

  const before = body.slice(0, splitAt);
  const after = body.slice(splitAt);
  if (splitAt === body.length || after.trim() === "") {
    return { ok: false as const, error: "Nothing to move into a new step." };
  }

  const { data: top } = await supabase
    .from("recipe_instruction_steps")
    .select("sort_order")
    .eq("recipe_id", recipeId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  let nextSort = 0;
  if (top != null && top.sort_order != null) {
    const n = Number(top.sort_order);
    nextSort = Number.isFinite(n) ? n + 1 : 0;
  }

  const { data: inserted, error: insErr } = await supabase
    .from("recipe_instruction_steps")
    .insert({
      recipe_id: recipeId,
      sort_order: nextSort,
      body: after,
    })
    .select("id, recipe_id, sort_order, body, timer_seconds_low, timer_seconds_high, created_at")
    .single();

  if (insErr || !inserted) {
    return { ok: false as const, error: insErr?.message ?? "Could not add step." };
  }

  const newId = Number((inserted as { id: unknown }).id);
  if (!Number.isFinite(newId)) {
    return { ok: false as const, error: "Could not add step." };
  }

  const { error: uErr } = await supabase
    .from("recipe_instruction_steps")
    .update({ body: before })
    .eq("id", stepId)
    .eq("recipe_id", recipeId);

  if (uErr) {
    await supabase.from("recipe_instruction_steps").delete().eq("id", newId).eq("recipe_id", recipeId);
    return { ok: false as const, error: uErr.message };
  }

  const orderedIds = [
    ...list.slice(0, idx + 1).map((s) => Number((s as { id: unknown }).id)),
    newId,
    ...list.slice(idx + 1).map((s) => Number((s as { id: unknown }).id)),
  ];

  for (let i = 0; i < orderedIds.length; i++) {
    const { error: ordErr } = await supabase
      .from("recipe_instruction_steps")
      .update({ sort_order: i })
      .eq("id", orderedIds[i])
      .eq("recipe_id", recipeId);
    if (ordErr) return { ok: false as const, error: ordErr.message };
  }

  const { data: firstData } = await supabase
    .from("recipe_instruction_steps")
    .select("id, recipe_id, sort_order, body, timer_seconds_low, timer_seconds_high, created_at")
    .eq("id", stepId)
    .eq("recipe_id", recipeId)
    .single();

  const { data: secondData } = await supabase
    .from("recipe_instruction_steps")
    .select("id, recipe_id, sort_order, body, timer_seconds_low, timer_seconds_high, created_at")
    .eq("id", newId)
    .eq("recipe_id", recipeId)
    .single();

  const firstRow = normalizeInstructionStepRow(firstData);
  const newRow = normalizeInstructionStepRow(secondData);
  if (!firstRow || !newRow) return { ok: false as const, error: "Could not load steps." };

  await syncRecipeInstructionsTextFromSteps(supabase, recipeId);
  revalidateRecipeIngredientPaths(recipeId);
  return { ok: true as const, firstRow, newRow };
}

export async function updateRecipeInstructionStepAction(
  recipeId: number,
  stepId: number,
  patch: {
    body?: string;
    timer_seconds_low?: number | null;
    timer_seconds_high?: number | null;
  },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const updates: Record<string, unknown> = {};
  if (patch.body !== undefined) {
    updates.body = patch.body === null ? "" : String(patch.body);
  }
  if ("timer_seconds_low" in patch) {
    updates.timer_seconds_low = safeInt(patch.timer_seconds_low);
  }
  if ("timer_seconds_high" in patch) {
    updates.timer_seconds_high = safeInt(patch.timer_seconds_high);
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false as const, error: "Nothing to update." };
  }

  const { data: prior } = await supabase
    .from("recipe_instruction_steps")
    .select("id, recipe_id, sort_order, body, timer_seconds_low, timer_seconds_high, created_at")
    .eq("id", stepId)
    .eq("recipe_id", recipeId)
    .maybeSingle();

  if (
    prior &&
    updates.body !== undefined &&
    Object.keys(updates).length === 1 &&
    String((prior as { body: unknown }).body ?? "") === updates.body
  ) {
    const row = normalizeInstructionStepRow(prior);
    if (row) return { ok: true as const, row };
  }

  const { data, error } = await supabase
    .from("recipe_instruction_steps")
    .update(updates)
    .eq("id", stepId)
    .eq("recipe_id", recipeId)
    .select("id, recipe_id, sort_order, body, timer_seconds_low, timer_seconds_high, created_at")
    .single();

  if (error || !data) {
    return { ok: false as const, error: error?.message ?? "Could not update step." };
  }

  const row = normalizeInstructionStepRow(data);
  if (!row) return { ok: false as const, error: "Could not update step." };

  await syncRecipeInstructionsTextFromSteps(supabase, recipeId);
  revalidateRecipeIngredientPaths(recipeId);
  return { ok: true as const, row };
}

export async function deleteRecipeInstructionStepAction(recipeId: number, stepId: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const { error: delErr } = await supabase
    .from("recipe_instruction_steps")
    .delete()
    .eq("id", stepId)
    .eq("recipe_id", recipeId);

  if (delErr) return { ok: false as const, error: delErr.message };

  const { data: remaining, error: listErr } = await supabase
    .from("recipe_instruction_steps")
    .select("id")
    .eq("recipe_id", recipeId)
    .order("sort_order", { ascending: true });

  if (listErr) return { ok: false as const, error: listErr.message };

  for (let i = 0; i < (remaining ?? []).length; i++) {
    const id = Number((remaining![i] as { id: unknown }).id);
    const { error: uErr } = await supabase
      .from("recipe_instruction_steps")
      .update({ sort_order: i })
      .eq("id", id)
      .eq("recipe_id", recipeId);
    if (uErr) return { ok: false as const, error: uErr.message };
  }

  await syncRecipeInstructionsTextFromSteps(supabase, recipeId);
  revalidateRecipeIngredientPaths(recipeId);
  return { ok: true as const };
}

export async function reorderRecipeInstructionStepsAction(recipeId: number, orderedIds: number[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const { data: rows, error: listErr } = await supabase
    .from("recipe_instruction_steps")
    .select("id")
    .eq("recipe_id", recipeId);

  if (listErr) return { ok: false as const, error: listErr.message };

  const idSet = new Set((rows ?? []).map((r) => Number((r as { id: unknown }).id)));
  const uniqueOrdered = [...new Set(orderedIds)];
  if (uniqueOrdered.length !== idSet.size || !uniqueOrdered.every((id) => idSet.has(id))) {
    return { ok: false as const, error: "Invalid reorder payload." };
  }

  for (let i = 0; i < orderedIds.length; i++) {
    const { error: uErr } = await supabase
      .from("recipe_instruction_steps")
      .update({ sort_order: i })
      .eq("id", orderedIds[i])
      .eq("recipe_id", recipeId);
    if (uErr) return { ok: false as const, error: uErr.message };
  }

  await syncRecipeInstructionsTextFromSteps(supabase, recipeId);
  revalidateRecipeIngredientPaths(recipeId);
  return { ok: true as const };
}

export async function deleteRecipeAction(recipeId: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  // Soft delete: flip `deleted_at` instead of removing the row, so anyone who
  // has this recipe in their library sees a tombstone until they remove it.
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("recipes")
    .update({ deleted_at: now, updated_at: now })
    .eq("id", recipeId)
    .eq("owner_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false as const, error: error.message };
  if (!data?.id) {
    return { ok: false as const, error: "Recipe not found or you cannot delete it." };
  }

  revalidatePath("/recipes");
  revalidatePath("/plan");
  revalidatePath("/community");
  revalidatePath("/inventory");
  return { ok: true as const };
}
