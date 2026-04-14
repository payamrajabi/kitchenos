"use server";

import { defaultStorageLocationForNewInventoryRow } from "@/lib/inventory-display";
import {
  INGREDIENT_UNIT_VALUES,
  normalizeIngredientUnitForStorage,
} from "@/lib/unit-mapping";
import { createClient } from "@/lib/supabase/server";
import { normalizeMealTypesForStorage } from "@/lib/recipe-meal-types";
import type { IngredientRow, RecipeIngredientRow } from "@/types/database";
import { maybeAutofillNutrition } from "@/app/actions/ingredient-nutrition";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const UPDATABLE_KEYS = new Set([
  "name",
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

/** Columns to copy when saving a community recipe into the user's account. */
const RECIPE_COMMUNITY_COPY_KEYS = [
  "name",
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

function buildRecipeCopyInsert(
  source: Record<string, unknown>,
  sourceRecipeId: number,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of RECIPE_COMMUNITY_COPY_KEYS) {
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

  out.community_source_recipe_id = sourceRecipeId;
  out.is_published_to_community = false;
  out.published_at = null;
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
  if (Array.isArray(raw)) {
    const first = raw[0];
    if (!first || typeof first !== "object") return null;
    const row = first as Record<string, unknown>;
    return {
      id: Number(row.id),
      name: String(row.name ?? ""),
    };
  }
  if (typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
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

const RECIPE_INGREDIENT_SELECT =
  "id, recipe_id, ingredient_id, section_id, line_sort_order, amount, unit, is_optional, created_at, ingredients(id, name)";

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
  });

  if (error) {
    return { ok: false as const, error: error.message };
  }
  return { ok: true as const };
}

async function insertRecipeIngredientLine(
  supabase: Awaited<ReturnType<typeof createClient>>,
  recipeId: number,
  ingredientId: number,
  sectionId: string | null,
) {
  const ord = await nextLineSortOrder(supabase, recipeId, sectionId);
  if (!ord.ok) return ord;

  const { data, error } = await supabase
    .from("recipe_ingredients")
    .insert({
      recipe_id: recipeId,
      ingredient_id: ingredientId,
      amount: null,
      unit: DEFAULT_RECIPE_INGREDIENT_UNIT,
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

  const { data: existing, error: existingError } = await supabase
    .from("ingredients")
    .select("id, name, category")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    return { ok: false as const, error: existingError.message };
  }

  let ingredient =
    existing == null
      ? null
      : ({
          id: Number(existing.id),
          name: String(existing.name ?? ""),
          category: existing.category == null ? null : String(existing.category),
        } as Pick<IngredientRow, "id" | "name" | "category">);

  let ingredientCreated = false;

  if (!ingredient) {
    const { data: inserted, error } = await supabase
      .from("ingredients")
      .insert({ name })
      .select("id, name, category")
      .single();

    if (error || !inserted) {
      return { ok: false as const, error: error?.message ?? "Could not create ingredient." };
    }

    ingredient = {
      id: Number(inserted.id),
      name: String(inserted.name ?? ""),
      category: inserted.category == null ? null : String(inserted.category),
    };
    ingredientCreated = true;
  }

  const ensuredInventory = await ensureInventoryRowForIngredient(supabase, ingredient);
  if (!ensuredInventory.ok) return ensuredInventory;

  const attached = await insertRecipeIngredientLine(supabase, recipeId, ingredient.id, sectionId);
  if (!attached.ok) return attached;

  if (ingredientCreated) void maybeAutofillNutrition(ingredient.id);

  revalidateRecipeIngredientPaths(recipeId);
  return {
    ok: true as const,
    ingredientCreated,
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

  const { data: existing, error: existingError } = await supabase
    .from("ingredients")
    .select("id, name, category")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    return { ok: false as const, error: existingError.message };
  }

  let ingredient =
    existing == null
      ? null
      : ({
          id: Number(existing.id),
          name: String(existing.name ?? ""),
          category: existing.category == null ? null : String(existing.category),
        } as Pick<IngredientRow, "id" | "name" | "category">);

  let ingredientCreated = false;

  if (!ingredient) {
    const { data: inserted, error } = await supabase
      .from("ingredients")
      .insert({ name })
      .select("id, name, category")
      .single();

    if (error || !inserted) {
      return { ok: false as const, error: error?.message ?? "Could not create ingredient." };
    }

    ingredient = {
      id: Number(inserted.id),
      name: String(inserted.name ?? ""),
      category: inserted.category == null ? null : String(inserted.category),
    };
    ingredientCreated = true;
  }

  const ensuredInventory = await ensureInventoryRowForIngredient(supabase, ingredient);
  if (!ensuredInventory.ok) return ensuredInventory;

  const { error: updateError } = await supabase
    .from("recipe_ingredients")
    .update({ ingredient_id: ingredient.id })
    .eq("recipe_id", recipeId)
    .eq("id", lineId);

  if (updateError) {
    return { ok: false as const, error: updateError.message };
  }

  if (ingredientCreated) void maybeAutofillNutrition(ingredient.id);

  const row = await loadRecipeIngredientRowByLineId(supabase, lineId);
  if (!row.ok) return row;

  revalidateRecipeIngredientPaths(recipeId);
  return {
    ok: true as const,
    ingredientCreated,
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

  if (Object.prototype.hasOwnProperty.call(patch, "ingredient_id")) {
    const ingredientId = Number(patch.ingredient_id);
    if (!Number.isFinite(ingredientId) || ingredientId <= 0) {
      return { ok: false as const, error: "Invalid ingredient." };
    }
    updates.ingredient_id = Math.trunc(ingredientId);
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

export async function publishRecipeToCommunityAction(
  recipeId: number,
  publish: boolean,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const patch: Record<string, unknown> = {
    is_published_to_community: publish,
    published_at: publish ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("recipes")
    .update(patch)
    .eq("id", recipeId)
    .eq("owner_id", user.id);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/community");
  return { ok: true as const };
}

export async function saveRecipeFromCommunityAction(sourceRecipeId: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const { data: source, error: srcErr } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", sourceRecipeId)
    .eq("is_published_to_community", true)
    .maybeSingle();

  if (srcErr || !source) {
    return { ok: false as const, error: "Recipe not found or not published." };
  }

  if (source.owner_id === user.id) {
    return { ok: false as const, error: "You already own this recipe." };
  }

  const { data: alreadySaved } = await supabase
    .from("recipes")
    .select("id")
    .eq("owner_id", user.id)
    .eq("community_source_recipe_id", sourceRecipeId)
    .limit(1)
    .maybeSingle();

  if (alreadySaved) {
    return { ok: false as const, error: "Already saved.", alreadySavedId: Number(alreadySaved.id) };
  }

  const sourceRow = source as Record<string, unknown>;
  const recipeInsert = buildRecipeCopyInsert(sourceRow, sourceRecipeId);

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

  const { data: userIngredientRows } = await supabase
    .from("ingredients")
    .select("id, name, category")
    .eq("owner_id", user.id);

  const ingredientByLowerName = new Map<
    string,
    { id: number; category: string | null }
  >();
  for (const row of userIngredientRows ?? []) {
    const n = String(row.name ?? "").trim();
    if (!n) continue;
    ingredientByLowerName.set(n.toLowerCase(), {
      id: Number(row.id),
      category: row.category as string | null,
    });
  }

  if (sourceLines?.length) {
    for (const line of sourceLines) {
      const sourceIngredientId = Number(line.ingredient_id);
      if (!Number.isFinite(sourceIngredientId)) continue;

      const { data: sourceIng, error: ingFetchErr } = await supabase
        .from("ingredients")
        .select("id, name, category")
        .eq("id", sourceIngredientId)
        .maybeSingle();

      if (ingFetchErr) {
        await rollbackRecipe();
        return { ok: false as const, error: ingFetchErr.message };
      }

      const ingName = String(sourceIng?.name ?? "").trim();
      if (!ingName) continue;

      const lower = ingName.toLowerCase();
      let ingredientId: number;
      let ingredientCategory: string | null = null;

      const cached = ingredientByLowerName.get(lower);
      if (cached) {
        ingredientId = cached.id;
        ingredientCategory = cached.category;
      } else {
        const { data: created, error: createErr } = await supabase
          .from("ingredients")
          .insert({ name: ingName })
          .select("id, category")
          .single();

        if (createErr?.code === "23505") {
          const { data: retry } = await supabase
            .from("ingredients")
            .select("id, category, name")
            .eq("owner_id", user.id);
          const match = retry?.find(
            (x) => String(x.name ?? "").trim().toLowerCase() === lower,
          );
          if (!match) {
            await rollbackRecipe();
            return {
              ok: false as const,
              error: "Could not match ingredient after duplicate.",
            };
          }
          ingredientId = Number(match.id);
          ingredientCategory = match.category as string | null;
        } else if (createErr || !created) {
          await rollbackRecipe();
          return {
            ok: false as const,
            error: createErr?.message ?? "Could not create ingredient for copy.",
          };
        } else {
          ingredientId = Number(created.id);
          ingredientCategory = created.category as string | null;
        }
        ingredientByLowerName.set(lower, { id: ingredientId, category: ingredientCategory });
        void maybeAutofillNutrition(ingredientId);
      }

      await ensureInventoryRowForIngredient(supabase, {
        id: ingredientId,
        category: ingredientCategory,
      });

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

  revalidatePath("/recipes");
  revalidatePath("/community");
  revalidatePath("/inventory");
  redirect(`/recipes/${newRecipeId}`);
}

export async function deleteRecipeAction(recipeId: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const { data, error } = await supabase
    .from("recipes")
    .delete()
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
