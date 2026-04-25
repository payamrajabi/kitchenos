/**
 * Shared helpers used by the receipt-import server actions.
 *
 * Two responsibilities:
 *  - applyStockDelta: read-modify-write `inventory_items.quantity` so purchased
 *    quantities ADD to current stock (the existing inventory actions only
 *    support absolute sets or a hard-coded +1).
 *  - upsertPreferredProduct: write the purchased product into the ingredient's
 *    `ingredient_products` list at rank 0 (top of the stack), either by
 *    updating a matching name+brand row or by inserting new and bumping the
 *    existing ranks down by one.
 */

import { createClient } from "@/lib/supabase/server";
import type { IngredientProductRow, ProductPriceBasis } from "@/types/database";
import {
  defaultStorageLocationForNewInventoryRow,
} from "@/lib/inventory-display";
import type { IngredientRow } from "@/types/database";
import type { InventoryTab } from "@/lib/inventory-filters";
import {
  INGREDIENT_UNIT_VALUES,
  normalizeIngredientUnitForStorage,
} from "@/lib/unit-mapping";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

function coerceQty(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

function roundStockQuantity(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function normalizeForCompare(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function ensureInventoryRow(
  supabase: SupabaseClient,
  ingredientId: number,
): Promise<
  | { ok: true; id: number; unit: string | null }
  | { ok: false; error: string }
> {
  const { data: existing } = await supabase
    .from("inventory_items")
    .select("id, unit")
    .eq("ingredient_id", ingredientId)
    .limit(1)
    .maybeSingle();

  if (existing?.id != null) {
    return { ok: true, id: existing.id, unit: existing.unit ?? null };
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
    .select("id, unit")
    .single();

  if (error || !inserted?.id) {
    return {
      ok: false,
      error: error?.message ?? "Could not create inventory row.",
    };
  }

  return { ok: true, id: inserted.id, unit: inserted.unit ?? null };
}

/**
 * Add `delta` units to `inventory_items.quantity` for the given ingredient,
 * creating the inventory row if one does not exist yet. If the inventory row
 * has no unit set and `preferredUnit` is provided, the unit is stored too.
 *
 * Returns the new quantity on success.
 */
export async function applyStockDelta(
  supabase: SupabaseClient,
  ingredientId: number,
  delta: number,
  preferredUnit?: string | null,
): Promise<{ ok: true; quantity: number } | { ok: false; error: string }> {
  if (!Number.isFinite(delta) || delta < 0) {
    return { ok: false, error: "Quantity must be non-negative." };
  }
  const resolved = await ensureInventoryRow(supabase, ingredientId);
  if (!resolved.ok) return resolved;

  const { data: row, error: fetchErr } = await supabase
    .from("inventory_items")
    .select("quantity, unit")
    .eq("id", resolved.id)
    .maybeSingle();
  if (fetchErr) return { ok: false, error: fetchErr.message };

  const current = coerceQty(row?.quantity);
  const next = roundStockQuantity(current + delta);

  const updates: Record<string, unknown> = { quantity: next };
  if (!row?.unit && preferredUnit) {
    const normalized = normalizeIngredientUnitForStorage(preferredUnit);
    if (normalized && INGREDIENT_UNIT_VALUES.has(normalized)) {
      updates.unit = normalized;
    }
  }

  const { error } = await supabase
    .from("inventory_items")
    .update(updates)
    .eq("id", resolved.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, quantity: next };
}

export type PreferredProductInput = {
  name: string;
  brand: string | null;
  price: number | null;
  priceBasis?: ProductPriceBasis | null;
  priceBasisAmount?: number | null;
  priceBasisUnit?: string | null;
  unitSizeAmount: number | null;
  unitSizeUnit: string | null;
};

/**
 * Upsert the purchased product as the TOP (rank 0) preferred product for an
 * ingredient. If a row with a matching (case-insensitive) name + brand
 * already exists, we update its price/pack size and bump it to rank 0,
 * sliding everything above it down. Otherwise we insert a new row at rank 0
 * and bump all existing products down.
 */
export async function upsertPreferredProduct(
  supabase: SupabaseClient,
  ingredientId: number,
  input: PreferredProductInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Product name is required." };

  const brand = input.brand?.trim() || null;
  const price = input.price != null && Number.isFinite(input.price)
    ? Math.round(input.price * 100) / 100
    : null;
  const requestedPriceBasis = input.priceBasis ?? "package";
  const normalizedPriceBasisUnit = input.priceBasisUnit
    ? normalizeIngredientUnitForStorage(input.priceBasisUnit)
    : "";
  const validPriceBasisUnit =
    normalizedPriceBasisUnit && INGREDIENT_UNIT_VALUES.has(normalizedPriceBasisUnit)
      ? normalizedPriceBasisUnit
      : null;
  const price_basis: ProductPriceBasis | null =
    price == null
      ? null
      : requestedPriceBasis === "weight"
        ? validPriceBasisUnit
          ? "weight"
          : null
        : requestedPriceBasis === "unit"
          ? "unit"
          : "package";
  const price_basis_amount =
    price_basis === "weight" || price_basis === "unit"
      ? input.priceBasisAmount != null &&
        Number.isFinite(input.priceBasisAmount) &&
        input.priceBasisAmount > 0
        ? Math.round(input.priceBasisAmount * 1000) / 1000
        : 1
      : null;
  const price_basis_unit =
    price_basis === "weight"
      ? validPriceBasisUnit
      : price_basis === "unit"
        ? (validPriceBasisUnit ?? "ea")
        : null;
  const unit_size_amount =
    input.unitSizeAmount != null && Number.isFinite(input.unitSizeAmount)
      ? Math.round(input.unitSizeAmount * 1000) / 1000
      : null;
  const unitNormalized = input.unitSizeUnit
    ? normalizeIngredientUnitForStorage(input.unitSizeUnit)
    : "";
  const unit_size_unit =
    unitNormalized && INGREDIENT_UNIT_VALUES.has(unitNormalized)
      ? unitNormalized
      : null;
  // Orphaned halves get cleared.
  const safeAmount = unit_size_unit == null ? null : unit_size_amount;
  const safeUnit = unit_size_amount == null ? null : unit_size_unit;

  const { data: existingRows, error: listErr } = await supabase
    .from("ingredient_products")
    .select("*")
    .eq("ingredient_id", ingredientId)
    .order("rank", { ascending: true });
  if (listErr) return { ok: false, error: listErr.message };
  const existing = (existingRows ?? []) as IngredientProductRow[];

  const match = existing.find(
    (row) =>
      normalizeForCompare(row.name) === normalizeForCompare(name) &&
      normalizeForCompare(row.brand) === normalizeForCompare(brand),
  );

  if (match) {
    // Update this row's price/pack size and move it to rank 0 by bumping any
    // rows that currently sit above it.
    const { error: updErr } = await supabase
      .from("ingredient_products")
      .update({
        name,
        brand,
        price,
        price_basis,
        price_basis_amount,
        price_basis_unit,
        unit_size_amount: safeAmount,
        unit_size_unit: safeUnit,
        rank: 0,
      })
      .eq("id", match.id);
    if (updErr) return { ok: false, error: updErr.message };

    let nextRank = 1;
    for (const row of existing) {
      if (row.id === match.id) continue;
      const { error } = await supabase
        .from("ingredient_products")
        .update({ rank: nextRank })
        .eq("id", row.id);
      if (error) return { ok: false, error: error.message };
      nextRank += 1;
    }
    return { ok: true };
  }

  // Shift existing rows down by one so the new row can land at rank 0.
  for (let i = existing.length - 1; i >= 0; i -= 1) {
    const row = existing[i];
    const { error } = await supabase
      .from("ingredient_products")
      .update({ rank: i + 1 })
      .eq("id", row.id);
    if (error) return { ok: false, error: error.message };
  }

  const { error: insErr } = await supabase
    .from("ingredient_products")
    .insert({
      ingredient_id: ingredientId,
      rank: 0,
      name,
      brand,
      price,
      price_basis,
      price_basis_amount,
      price_basis_unit,
      unit_size_amount: safeAmount,
      unit_size_unit: safeUnit,
    });
  if (insErr) return { ok: false, error: insErr.message };

  return { ok: true };
}
