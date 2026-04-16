"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { parseAmount } from "@/lib/parse-amount";
import { planDateKeyLocalAnchor, addDaysToDateString } from "@/lib/dates";
import {
  defaultStorageLocationForNewInventoryRow,
  DEFAULT_NEW_INVENTORY_MAX_QUANTITY,
  DEFAULT_NEW_INVENTORY_MIN_QUANTITY,
} from "@/lib/inventory-display";
import type { IngredientRow } from "@/types/database";
import type { InventoryTab } from "@/lib/inventory-filters";
import { normalizeIngredientUnitForStorage } from "@/lib/unit-mapping";
import { inferGroceryCategoryFromName } from "@/lib/ingredient-grocery-category";

export type ShoppingListItem = {
  ingredientId: number;
  ingredientName: string;
  /** Raw ingredient category from the catalog (used for grocery-aisle grouping). */
  category: string;
  /** Store section (Produce, Pantry, …) when set. */
  groceryCategory: string;
  neededAmount: number;
  neededUnit: string;
  /** How much inventory we subtracted (0 if units didn't match or none on hand). */
  onHandAmount: number;
  onHandUnit: string;
  /** Whether we were able to compare units and do the subtraction. */
  unitsMatch: boolean;
  /**
   * When the same ingredient appeared with different recipe units, one row is shown but
   * check-off runs once per line (each amount/unit pair).
   */
  checkOffLines?: { amount: number; unit: string }[];
};

type IngredientNeed = {
  ingredientId: number;
  ingredientName: string;
  category: string;
  groceryCategory: string;
  amount: number;
  unit: string;
};

function mergeShoppingListItemsByIngredient(
  items: ShoppingListItem[],
): ShoppingListItem[] {
  const byId = new Map<number, ShoppingListItem[]>();
  for (const it of items) {
    const arr = byId.get(it.ingredientId) ?? [];
    arr.push(it);
    byId.set(it.ingredientId, arr);
  }

  const merged: ShoppingListItem[] = [];
  for (const group of byId.values()) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }

    const base = group[0];
    const sameUnit = group.every((g) => g.neededUnit === base.neededUnit);
    const totalNeeded =
      Math.round(group.reduce((s, g) => s + g.neededAmount, 0) * 100) / 100;

    if (sameUnit) {
      merged.push({
        ...base,
        neededAmount: totalNeeded,
        onHandAmount: base.onHandAmount,
        onHandUnit: base.onHandUnit,
        unitsMatch: group.every((g) => g.unitsMatch),
      });
    } else {
      merged.push({
        ...base,
        neededAmount: totalNeeded,
        neededUnit: base.neededUnit,
        checkOffLines: group.map((g) => ({
          amount: g.neededAmount,
          unit: g.neededUnit,
        })),
        onHandAmount: base.onHandAmount,
        onHandUnit: base.onHandUnit,
        unitsMatch: group.every((g) => g.unitsMatch),
      });
    }
  }

  merged.sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));
  return merged;
}

export async function getShoppingListAction(): Promise<
  { ok: true; items: ShoppingListItem[] } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const today = planDateKeyLocalAnchor();
  const endDate = addDaysToDateString(today, 6);

  // Get all meal plan entries for the next 7 days that reference a recipe
  const { data: plans, error: planErr } = await supabase
    .from("meal_plans")
    .select(
      "id, week_start, meal_plan_entries(id, plan_date, recipe_id, servings)",
    )
    .gte("week_start", addDaysToDateString(today, -6))
    .lte("week_start", endDate);

  if (planErr) return { ok: false, error: planErr.message };

  const entries = (plans ?? []).flatMap((p) =>
    (p.meal_plan_entries ?? []).filter(
      (e: { plan_date: string; recipe_id: number | null }) =>
        e.recipe_id != null && e.plan_date >= today && e.plan_date <= endDate,
    ),
  ) as { id: number; plan_date: string; recipe_id: number; servings: number | null }[];

  if (!entries.length) return { ok: true, items: [] };

  const recipeIds = [...new Set(entries.map((e) => e.recipe_id))];

  // Fetch recipe base servings
  const { data: recipes, error: recErr } = await supabase
    .from("recipes")
    .select("id, name, servings")
    .in("id", recipeIds);
  if (recErr) return { ok: false, error: recErr.message };

  const recipeMap = new Map(
    (recipes ?? []).map((r: { id: number; name: string; servings: number | null }) => [
      r.id,
      r,
    ]),
  );

  // Fetch structured recipe ingredients for those recipes
  const { data: recipeIngredients, error: riErr } = await supabase
    .from("recipe_ingredients")
    .select(
      "recipe_id, ingredient_id, amount, unit, is_optional, ingredients(id, name, category, grocery_category)",
    )
    .in("recipe_id", recipeIds);
  if (riErr) return { ok: false, error: riErr.message };

  // Build the list of needs: for each meal plan entry, scale recipe ingredients
  const needs: IngredientNeed[] = [];

  for (const entry of entries) {
    const recipe = recipeMap.get(entry.recipe_id);
    if (!recipe) continue;

    const baseServings = recipe.servings ?? 4;
    const plannedServings = entry.servings ?? 4;
    const scale = plannedServings / baseServings;

    const lines = (recipeIngredients ?? []).filter(
      (ri: { recipe_id: number }) => ri.recipe_id === entry.recipe_id,
    );

    for (const line of lines) {
      if (line.is_optional) continue;

      const parsed = parseAmount(line.amount as string | null);
      if (parsed == null || parsed === 0) continue;

      // Supabase returns the FK join as an array; unwrap to single object.
      const ingRaw = line.ingredients as unknown;
      const ing = (Array.isArray(ingRaw) ? ingRaw[0] : ingRaw) as
        | {
            id: number;
            name: string;
            category: string | null;
            grocery_category: string | null;
          }
        | null
        | undefined;
      if (!ing) continue;

      const groceryCategory =
        (ing.grocery_category ?? "").trim() ||
        inferGroceryCategoryFromName(ing.name);

      needs.push({
        ingredientId: ing.id,
        ingredientName: ing.name,
        category: (ing.category ?? "").trim() || "Other",
        groceryCategory,
        amount: parsed * scale,
        unit: normalizeIngredientUnitForStorage(line.unit ?? ""),
      });
    }
  }

  if (!needs.length) return { ok: true, items: [] };

  // Aggregate needs by ingredient + unit
  type AggKey = string;
  const aggMap = new Map<
    AggKey,
    {
      ingredientId: number;
      ingredientName: string;
      category: string;
      groceryCategory: string;
      totalAmount: number;
      unit: string;
    }
  >();

  for (const n of needs) {
    const key: AggKey = `${n.ingredientId}::${n.unit}`;
    const existing = aggMap.get(key);
    if (existing) {
      existing.totalAmount += n.amount;
    } else {
      aggMap.set(key, {
        ingredientId: n.ingredientId,
        ingredientName: n.ingredientName,
        category: n.category,
        groceryCategory: n.groceryCategory,
        totalAmount: n.amount,
        unit: n.unit,
      });
    }
  }

  // Fetch current inventory
  const ingredientIds = [...new Set(needs.map((n) => n.ingredientId))];
  const { data: inventory } = await supabase
    .from("inventory_items")
    .select("ingredient_id, quantity, unit, recipe_unit")
    .in("ingredient_id", ingredientIds);

  // Sum inventory per ingredient (across all storage locations)
  const invByIngredient = new Map<
    number,
    { totalQty: number; unit: string; recipeUnit: string }
  >();
  for (const row of inventory ?? []) {
    const id = row.ingredient_id as number;
    const qty = row.quantity != null ? Number(row.quantity) : 0;
    const u = (row.unit ?? "") as string;
    const ru = (row.recipe_unit ?? "") as string;
    const existing = invByIngredient.get(id);
    if (existing) {
      existing.totalQty += qty;
      if (!existing.unit && u) existing.unit = u;
      if (!existing.recipeUnit && ru) existing.recipeUnit = ru;
    } else {
      invByIngredient.set(id, { totalQty: qty, unit: u, recipeUnit: ru });
    }
  }

  // Subtract inventory from needs
  const items: ShoppingListItem[] = [];

  for (const agg of aggMap.values()) {
    const inv = invByIngredient.get(agg.ingredientId);
    const invQty = inv?.totalQty ?? 0;
    const invUnit = inv?.unit ?? "";
    const invRecipeUnit = inv?.recipeUnit ?? "";

    const neededUnit = agg.unit;
    const unitsMatch =
      neededUnit !== "" &&
      (neededUnit === invUnit ||
        neededUnit === invRecipeUnit ||
        (invUnit === "" && invRecipeUnit === ""));

    let shortfall: number;
    let onHandAmount: number;

    if (unitsMatch || (invUnit === "" && invRecipeUnit === "")) {
      shortfall = agg.totalAmount - invQty;
      onHandAmount = invQty;
    } else {
      shortfall = agg.totalAmount;
      onHandAmount = 0;
    }

    if (shortfall <= 0) continue;

    items.push({
      ingredientId: agg.ingredientId,
      ingredientName: agg.ingredientName,
      category: agg.category,
      groceryCategory: agg.groceryCategory,
      neededAmount: Math.round(shortfall * 100) / 100,
      neededUnit: neededUnit,
      onHandAmount,
      onHandUnit: unitsMatch ? invUnit || invRecipeUnit : "",
      unitsMatch: unitsMatch || (invUnit === "" && invRecipeUnit === ""),
    });
  }

  items.sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));

  return { ok: true, items: mergeShoppingListItemsByIngredient(items) };
}

export async function checkOffShoppingItemAction(
  ingredientId: number,
  quantity: number,
  unit: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, error: "Invalid quantity." };
  }

  // Find existing inventory row(s) for this ingredient
  const { data: existing } = await supabase
    .from("inventory_items")
    .select("id, quantity, unit, recipe_unit, storage_location")
    .eq("ingredient_id", ingredientId)
    .order("quantity", { ascending: false });

  const normalizedUnit = normalizeIngredientUnitForStorage(unit);

  if (existing && existing.length > 0) {
    // Prefer a row whose unit or recipe_unit matches
    const matchRow =
      existing.find(
        (r) =>
          normalizedUnit &&
          (r.unit === normalizedUnit || r.recipe_unit === normalizedUnit),
      ) ??
      existing.find((r) => !r.unit && !r.recipe_unit) ??
      existing[0];

    const currentQty = matchRow.quantity != null ? Number(matchRow.quantity) : 0;
    const newQty = Math.round((currentQty + quantity) * 100) / 100;

    const { error } = await supabase
      .from("inventory_items")
      .update({ quantity: newQty })
      .eq("id", matchRow.id);

    if (error) return { ok: false, error: error.message };
  } else {
    // No inventory row exists — create one
    const { data: ing } = await supabase
      .from("ingredients")
      .select("id, category")
      .eq("id", ingredientId)
      .single();

    const tab: InventoryTab = "Pantry";
    const storage_location = defaultStorageLocationForNewInventoryRow(
      (ing ?? { category: null }) as IngredientRow,
      tab,
    );

    const { error } = await supabase.from("inventory_items").insert({
      ingredient_id: ingredientId,
      storage_location,
      quantity: Math.round(quantity * 100) / 100,
      unit: normalizedUnit || null,
      min_quantity: DEFAULT_NEW_INVENTORY_MIN_QUANTITY,
      max_quantity: DEFAULT_NEW_INVENTORY_MAX_QUANTITY,
    });

    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/shop");
  revalidatePath("/inventory");
  return { ok: true };
}

/** Reverses a successful `checkOffShoppingItemAction` for the same row / quantity / unit. */
export async function undoCheckOffShoppingItemAction(
  ingredientId: number,
  quantity: number,
  unit: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, error: "Invalid quantity." };
  }

  const { data: existing } = await supabase
    .from("inventory_items")
    .select("id, quantity, unit, recipe_unit, storage_location")
    .eq("ingredient_id", ingredientId)
    .order("quantity", { ascending: false });

  if (!existing?.length) {
    return { ok: false, error: "Nothing to undo." };
  }

  const normalizedUnit = normalizeIngredientUnitForStorage(unit);

  const matchRow =
    existing.find(
      (r) =>
        normalizedUnit &&
        (r.unit === normalizedUnit || r.recipe_unit === normalizedUnit),
    ) ??
    existing.find((r) => !r.unit && !r.recipe_unit) ??
    existing[0];

  const currentQty = matchRow.quantity != null ? Number(matchRow.quantity) : 0;
  const newQty = Math.round(Math.max(0, currentQty - quantity) * 100) / 100;

  const { error } = await supabase
    .from("inventory_items")
    .update({ quantity: newQty })
    .eq("id", matchRow.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/shop");
  revalidatePath("/inventory");
  return { ok: true };
}
