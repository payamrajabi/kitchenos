"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  INGREDIENT_UNIT_VALUES,
  normalizeIngredientUnitForStorage,
} from "@/lib/unit-mapping";
import {
  defaultStorageLocationForNewInventoryRow,
} from "@/lib/inventory-display";
import type { IngredientRow } from "@/types/database";
import type { InventoryTab } from "@/lib/inventory-filters";
import { maybeAutofillNutrition } from "@/app/actions/ingredient-nutrition";
import { isNutritionEffectivelyEmpty } from "@/lib/inventory-nutrition-display";
import {
  INGREDIENT_GROCERY_CATEGORIES,
  inferGroceryCategoryFromName,
} from "@/lib/ingredient-grocery-category";
import { toTitleCaseAP } from "@/lib/ingredient-resolution/normalize";
import {
  buildBackboneInsertFieldsFromName,
  INGREDIENT_TAXONOMY_SUBCATEGORIES,
} from "@/lib/ingredient-backbone-inference";
import {
  findBackboneMatchForName,
  ingredientFieldsFromCatalogue,
} from "@/lib/ingredient-backbone-catalogue";

const VALID_GROCERY_CATEGORIES = new Set<string>(INGREDIENT_GROCERY_CATEGORIES);

const VALID_TAXONOMY_SUBCATEGORIES = new Set<string>(
  INGREDIENT_TAXONOMY_SUBCATEGORIES,
);

// Built-in storage locations the app understands for tab-based behaviours
// (e.g. Pantry tab maps to Shallow/Deep Pantry, defaults for new rows). Users
// can persist custom locations beyond these for individual rows.
const BUILT_IN_LOCATIONS = new Set([
  "Fridge",
  "Freezer",
  "Shallow Pantry",
  "Deep Pantry",
  "Other",
]);

function storageLocationForTab(tab: string): string {
  if (tab === "Pantry") return "Shallow Pantry";
  return tab;
}

function normalizeStorageLocation(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

async function resolveInventoryRowId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ingredientId: number,
  knownId: number | "",
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  if (knownId !== "") {
    return { ok: true, id: Number(knownId) };
  }

  const { data: existing } = await supabase
    .from("inventory_items")
    .select("id")
    .eq("ingredient_id", ingredientId)
    .limit(1)
    .maybeSingle();

  if (existing?.id != null) {
    return { ok: true, id: existing.id };
  }

  const { data: ing, error: ingErr } = await supabase
    .from("ingredients")
    .select("id, category")
    .eq("id", ingredientId)
    .single();

  if (ingErr || !ing) {
    return { ok: false, error: "Ingredient not found." };
  }

  const tab: InventoryTab = "Pantry";
  const storage_location = defaultStorageLocationForNewInventoryRow(
    ing as IngredientRow,
    tab,
  );

  const { data: inserted, error } = await supabase
    .from("inventory_items")
    .insert({
      ingredient_id: ingredientId,
      storage_location,
      quantity: null,
      unit: null,
    })
    .select("id")
    .single();

  if (error || !inserted?.id) {
    return { ok: false, error: error?.message ?? "Could not create inventory row." };
  }

  return { ok: true, id: inserted.id };
}

/** Empty / null → 0; truncate; must be ≥ 0. */
function parseNonNegativeInventoryQty(
  raw: unknown,
): { ok: true; n: number } | { ok: false; error: string } {
  if (raw === null || raw === undefined) return { ok: true, n: 0 };
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { ok: false, error: "Invalid number." };
    const v = Math.trunc(raw);
    if (v < 0) return { ok: false, error: "Amount cannot be negative." };
    return { ok: true, n: v };
  }
  const t = String(raw).trim();
  if (t === "") return { ok: true, n: 0 };
  const n = Number(t);
  if (!Number.isFinite(n)) return { ok: false, error: "Invalid number." };
  const v = Math.trunc(n);
  if (v < 0) return { ok: false, error: "Amount cannot be negative." };
  return { ok: true, n: v };
}

function coerceInventoryQtyColumn(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

export async function fetchRecipesUsingIngredientAction(
  ingredientId: number,
): Promise<{ id: number; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recipe_ingredients")
    .select("recipe_id, recipes:recipe_id(id, name)")
    .eq("ingredient_id", ingredientId);

  if (!data) return [];

  const seen = new Set<number>();
  const result: { id: number; name: string }[] = [];
  for (const row of data) {
    const r = row.recipes as unknown as { id: number; name: string } | null;
    if (r && !seen.has(r.id)) {
      seen.add(r.id);
      result.push({ id: r.id, name: r.name });
    }
  }
  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

export async function deleteIngredientAction(ingredientId: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const { error: invErr } = await supabase
    .from("inventory_items")
    .delete()
    .eq("ingredient_id", ingredientId);
  if (invErr) return { ok: false as const, error: invErr.message };

  const { error } = await supabase
    .from("ingredients")
    .delete()
    .eq("id", ingredientId);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/inventory");
  revalidatePath("/recipes");
  revalidatePath("/shop");
  return { ok: true as const };
}

export async function moveIngredientAction(
  ingredientId: number,
  fromTab: string,
  toTab: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const newLocation = storageLocationForTab(toTab);
  // Drag-between-tabs only ever lands on a built-in tab destination.
  if (!BUILT_IN_LOCATIONS.has(newLocation)) {
    return { ok: false as const, error: "Invalid destination." };
  }

  const oldLocation = storageLocationForTab(fromTab);

  const { data: existing } = await supabase
    .from("inventory_items")
    .select("id")
    .eq("ingredient_id", ingredientId)
    .eq("storage_location", oldLocation)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("inventory_items")
      .update({ storage_location: newLocation })
      .eq("id", existing.id);
    if (error) return { ok: false as const, error: error.message };
  } else {
    const { error } = await supabase.from("inventory_items").insert({
      ingredient_id: ingredientId,
      storage_location: newLocation,
      quantity: null,
      unit: null,
    });
    if (error) return { ok: false as const, error: error.message };
  }

  revalidatePath("/inventory");
  return { ok: true as const };
}

export async function batchDeleteIngredientsAction(ingredientIds: number[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  for (const ingredientId of ingredientIds) {
    const { error: invErr } = await supabase
      .from("inventory_items")
      .delete()
      .eq("ingredient_id", ingredientId);
    if (invErr) return { ok: false as const, error: invErr.message };

    const { error } = await supabase
      .from("ingredients")
      .delete()
      .eq("id", ingredientId);
    if (error) return { ok: false as const, error: error.message };
  }

  revalidatePath("/inventory");
  return { ok: true as const };
}

export async function batchMoveIngredientsAction(
  ingredientIds: number[],
  fromTab: string,
  toTab: string,
) {
  for (const id of ingredientIds) {
    const r = await moveIngredientAction(id, fromTab, toTab);
    if (!r.ok) return r;
  }
  return { ok: true as const };
}

export async function updateRecipeUnitAction(
  recipeUnit: string,
  inventoryId: number | "",
  ingredientId: number,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const recipeNorm = normalizeIngredientUnitForStorage(recipeUnit);
  if (recipeNorm !== "" && !INGREDIENT_UNIT_VALUES.has(recipeNorm)) {
    return { ok: false as const, error: "Invalid recipe unit." };
  }

  const resolved = await resolveInventoryRowId(supabase, ingredientId, inventoryId);
  if (!resolved.ok) return resolved;

  const { error } = await supabase
    .from("inventory_items")
    .update({ recipe_unit: recipeNorm || null })
    .eq("id", resolved.id);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/inventory");
  revalidatePath("/shop");
  return { ok: true as const };
}

export async function updateIngredientNameAction(
  ingredientId: number,
  name: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const trimmed = toTitleCaseAP(name.trim());
  if (!trimmed) {
    return { ok: false as const, error: "Name is required." };
  }

  const { error } = await supabase
    .from("ingredients")
    .update({ name: trimmed })
    .eq("id", ingredientId);

  if (error) return { ok: false as const, error: error.message };

  void maybeAutofillNutrition(ingredientId);

  revalidatePath("/inventory");
  return { ok: true as const };
}

export async function updateIngredientTaxonomySubcategoryAction(
  ingredientId: number,
  subcategory: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const trimmed = (subcategory ?? "").trim();
  // Empty string clears the field back to "Uncategorised".
  if (trimmed && !VALID_TAXONOMY_SUBCATEGORIES.has(trimmed)) {
    return { ok: false as const, error: "Unknown subcategory." };
  }

  const { error } = await supabase
    .from("ingredients")
    .update({ taxonomy_subcategory: trimmed || null })
    .eq("id", ingredientId);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/inventory");
  revalidatePath("/shop");
  return { ok: true as const };
}

export async function updateIngredientNutritionServingSizeAction(
  ingredientId: number,
  rawGrams: unknown,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const n =
    typeof rawGrams === "number"
      ? rawGrams
      : Number(String(rawGrams ?? "").trim());
  if (!Number.isFinite(n) || n <= 0 || n > 100_000) {
    return {
      ok: false as const,
      error: "Serving size must be a positive number (grams).",
    };
  }
  const g = Math.round(n * 10) / 10;

  const { error } = await supabase
    .from("ingredients")
    .update({
      nutrition_serving_size_g: g,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ingredientId);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/inventory");
  revalidatePath("/shop");
  return { ok: true as const };
}

export async function updateIngredientGroceryCategoryAction(
  ingredientId: number,
  groceryCategory: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  if (!VALID_GROCERY_CATEGORIES.has(groceryCategory)) {
    return { ok: false as const, error: "Invalid grocery category." };
  }

  const { error } = await supabase
    .from("ingredients")
    .update({
      grocery_category: groceryCategory,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ingredientId);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/inventory");
  revalidatePath("/shop");
  revalidatePath("/recipes");
  return { ok: true as const };
}

export async function updateInventoryStorageLocationAction(
  ingredientId: number,
  inventoryId: number | "",
  storageLocation: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const loc = normalizeStorageLocation(storageLocation);
  // Free-form: accept any non-empty trimmed string. The DB no longer enforces
  // a CHECK list — users can persist locations like "Cold Room" or "Cellar".
  if (!loc) {
    return { ok: false as const, error: "Storage location is required." };
  }
  if (loc.length > 64) {
    return { ok: false as const, error: "Storage location is too long." };
  }

  const resolved = await resolveInventoryRowId(supabase, ingredientId, inventoryId);
  if (!resolved.ok) return resolved;

  const { error } = await supabase
    .from("inventory_items")
    .update({ storage_location: loc })
    .eq("id", resolved.id);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/inventory");
  revalidatePath("/shop");
  return { ok: true as const };
}

export async function updateInventoryStockUnitAction(
  ingredientId: number,
  inventoryId: number | "",
  unit: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  // Stock units are free-form: try to canonicalise to a known unit, but fall
  // back to the user's typed value (e.g. "tub", "sleeve") so they can extend
  // the list without an admin having to touch INGREDIENT_UNIT_VALUES.
  const canonical = normalizeIngredientUnitForStorage(unit);
  let u: string;
  if (canonical && INGREDIENT_UNIT_VALUES.has(canonical)) {
    u = canonical;
  } else {
    u = unit.replace(/\s+/g, " ").trim().toLowerCase();
    if (u.length > 32) {
      return { ok: false as const, error: "Stock unit is too long." };
    }
  }

  const resolved = await resolveInventoryRowId(supabase, ingredientId, inventoryId);
  if (!resolved.ok) return resolved;

  const { error } = await supabase
    .from("inventory_items")
    .update({ unit: u || null })
    .eq("id", resolved.id);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/inventory");
  revalidatePath("/shop");
  return { ok: true as const };
}

export async function createIngredientForInventoryAction(rawName: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const name = toTitleCaseAP(rawName.trim());
  if (!name) return { ok: false as const, error: "Name is required." };

  const { data: existing, error: existingError } = await supabase
    .from("ingredients")
    .select("*")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    return { ok: false as const, error: existingError.message };
  }

  let ingredientRow: IngredientRow;

  if (existing) {
    ingredientRow = existing as IngredientRow;
    if (isNutritionEffectivelyEmpty(ingredientRow)) {
      void maybeAutofillNutrition(ingredientRow.id);
    }
  } else {
    const catalogueMatch = await findBackboneMatchForName(supabase, name);
    const catalogueFields = catalogueMatch
      ? ingredientFieldsFromCatalogue(catalogueMatch.entry)
      : null;
    const backboneDefaults =
      catalogueFields ?? buildBackboneInsertFieldsFromName(name);
    const grocery_category =
      catalogueFields?.grocery_category ?? inferGroceryCategoryFromName(name);

    const { data: inserted, error } = await supabase
      .from("ingredients")
      .insert({
        name,
        ...backboneDefaults,
        grocery_category,
      })
      .select("*")
      .single();

    if (error || !inserted) {
      return {
        ok: false as const,
        error: error?.message ?? "Could not create ingredient.",
      };
    }

    ingredientRow = inserted as IngredientRow;
    void maybeAutofillNutrition(ingredientRow.id);
  }

  const { data: invExists } = await supabase
    .from("inventory_items")
    .select("id")
    .eq("ingredient_id", ingredientRow.id)
    .limit(1)
    .maybeSingle();

  if (!invExists?.id) {
    const tab: InventoryTab = "Pantry";
    const storage_location = defaultStorageLocationForNewInventoryRow(
      ingredientRow,
      tab,
    );
    const { error: invErr } = await supabase.from("inventory_items").insert({
      ingredient_id: ingredientRow.id,
      storage_location,
      quantity: null,
      unit: null,
    });
    if (invErr) return { ok: false as const, error: invErr.message };
  }

  revalidatePath("/inventory");
  revalidatePath("/shop");
  revalidatePath("/recipes");
  return { ok: true as const, ingredientId: ingredientRow.id };
}

export async function addIngredientVariantAction(
  parentIngredientId: number,
  variantName: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const trimmed = toTitleCaseAP(variantName.trim());
  if (!trimmed) return { ok: false as const, error: "Name is required." };

  const { data: parent, error: parentErr } = await supabase
    .from("ingredients")
    .select("id, category, grocery_category")
    .eq("id", parentIngredientId)
    .single();
  if (parentErr || !parent) {
    return { ok: false as const, error: "Parent ingredient not found." };
  }

  const { data: siblings } = await supabase
    .from("ingredients")
    .select("variant_sort_order")
    .eq("parent_ingredient_id", parentIngredientId)
    .order("variant_sort_order", { ascending: false })
    .limit(1);

  const nextSort =
    siblings && siblings.length > 0
      ? (siblings[0].variant_sort_order ?? 0) + 1
      : 0;

  const parentGrocery =
    (parent as { grocery_category?: string | null }).grocery_category ?? null;

  const catalogueMatch = await findBackboneMatchForName(supabase, trimmed);
  const catalogueFields = catalogueMatch
    ? ingredientFieldsFromCatalogue(catalogueMatch.entry)
    : null;
  const backboneDefaults =
    catalogueFields ?? buildBackboneInsertFieldsFromName(trimmed);

  // Parent's grocery category wins when set, then catalogue, then regex.
  const grocery_category =
    parentGrocery && VALID_GROCERY_CATEGORIES.has(parentGrocery)
      ? parentGrocery
      : (catalogueFields?.grocery_category ?? inferGroceryCategoryFromName(trimmed));

  const { data: newIng, error: ingErr } = await supabase
    .from("ingredients")
    .insert({
      name: trimmed,
      parent_ingredient_id: parentIngredientId,
      variant_sort_order: nextSort,
      category: (parent as { category?: string | null }).category ?? null,
      ...backboneDefaults,
      grocery_category,
    })
    .select("id")
    .single();

  if (ingErr || !newIng) {
    return { ok: false as const, error: ingErr?.message ?? "Could not create variant." };
  }

  const tab: InventoryTab = "Pantry";
  const storage_location = defaultStorageLocationForNewInventoryRow(
    parent as IngredientRow,
    tab,
  );

  await supabase.from("inventory_items").insert({
    ingredient_id: newIng.id,
    storage_location,
    quantity: null,
    unit: null,
  });

  void maybeAutofillNutrition(newIng.id);

  revalidatePath("/inventory");
  revalidatePath("/recipes");
  return { ok: true as const, ingredientId: newIng.id };
}

export async function reorderVariantsAction(
  parentIngredientId: number,
  orderedVariantIds: number[],
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  for (let i = 0; i < orderedVariantIds.length; i++) {
    const { error } = await supabase
      .from("ingredients")
      .update({ variant_sort_order: i })
      .eq("id", orderedVariantIds[i])
      .eq("parent_ingredient_id", parentIngredientId);
    if (error) return { ok: false as const, error: error.message };
  }

  revalidatePath("/inventory");
  revalidatePath("/recipes");
  return { ok: true as const };
}

/**
 * Bumps the user's on-hand stock for `ingredientId` by +1 unit. If the viewer
 * has no `inventory_items` row for the ingredient yet, one is created in the
 * default Pantry location (matching how other "quick stock" entry points
 * behave). Used by the recipe detail view to let users resolve an "Out of
 * stock" badge with a single tap.
 */
export async function incrementInventoryStockForIngredientAction(
  ingredientId: number,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  if (!Number.isFinite(ingredientId) || ingredientId <= 0) {
    return { ok: false as const, error: "Invalid ingredient." };
  }

  const resolved = await resolveInventoryRowId(supabase, ingredientId, "");
  if (!resolved.ok) return resolved;

  const { data: existing, error: fetchErr } = await supabase
    .from("inventory_items")
    .select("quantity")
    .eq("id", resolved.id)
    .maybeSingle();
  if (fetchErr) return { ok: false as const, error: fetchErr.message };

  const current = coerceInventoryQtyColumn(existing?.quantity);
  const next = current + 1;

  const { error } = await supabase
    .from("inventory_items")
    .update({ quantity: next })
    .eq("id", resolved.id);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/inventory");
  revalidatePath("/shop");
  revalidatePath("/recipes");
  return { ok: true as const, quantity: next };
}

export async function updateInventoryQuantityFieldAction(
  ingredientId: number,
  inventoryId: number | "",
  field: "quantity",
  value: unknown,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const parsed = parseNonNegativeInventoryQty(value);
  if (!parsed.ok) return { ok: false as const, error: parsed.error };

  const resolved = await resolveInventoryRowId(supabase, ingredientId, inventoryId);
  if (!resolved.ok) return resolved;

  const { error } = await supabase
    .from("inventory_items")
    .update({ [field]: parsed.n })
    .eq("id", resolved.id);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/inventory");
  revalidatePath("/shop");
  return { ok: true as const };
}
