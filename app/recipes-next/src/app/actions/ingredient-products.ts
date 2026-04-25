"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { IngredientProductRow, ProductPriceBasis } from "@/types/database";
import {
  INGREDIENT_UNIT_VALUES,
  normalizeIngredientUnitForStorage,
} from "@/lib/unit-mapping";

export type IngredientProductInput = {
  name: string;
  brand?: string | null;
  notes?: string | null;
  barcode?: string | null;
  /** Accepts a number, a decimal string, or empty/null for "no price". */
  price?: number | string | null;
  /** Defaults to package pricing when a price is present. */
  priceBasis?: ProductPriceBasis | null;
  priceBasisAmount?: number | string | null;
  priceBasisUnit?: string | null;
  /** Package/unit size amount (e.g. 500 for "500 g"). */
  unitSizeAmount?: number | string | null;
  /** Package/unit size unit (e.g. "g", "l", "oz"). */
  unitSizeUnit?: string | null;
};

/** Parse a loose user-entered price into a non-negative 2-decimal number or null. */
function parsePrice(raw: unknown): number | null | "invalid" {
  if (raw === null || raw === undefined) return null;
  const str = typeof raw === "number" ? String(raw) : String(raw).trim();
  if (str === "") return null;
  const cleaned = str.replace(/[^\d.\-]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return "invalid";
  return Math.round(n * 100) / 100;
}

/** Parse a unit-size amount (must be positive). Returns null for empty input. */
function parseUnitSizeAmount(raw: unknown): number | null | "invalid" {
  if (raw === null || raw === undefined) return null;
  const str = typeof raw === "number" ? String(raw) : String(raw).trim();
  if (str === "") return null;
  const cleaned = str.replace(/[^\d.\-]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return "invalid";
  // 3 decimal places max (covers things like "0.5 L" or "1.25 kg").
  return Math.round(n * 1000) / 1000;
}

type SanitizedProduct = {
  name: string;
  brand: string | null;
  notes: string | null;
  barcode: string | null;
  price: number | null;
  price_basis: ProductPriceBasis | null;
  price_basis_amount: number | null;
  price_basis_unit: string | null;
  unit_size_amount: number | null;
  unit_size_unit: string | null;
};

function sanitize(
  input: IngredientProductInput,
):
  | { ok: true; value: SanitizedProduct }
  | { ok: false; error: string } {
  const name = (input.name ?? "").trim();
  const brand = (input.brand ?? "").trim() || null;
  const notes = (input.notes ?? "").trim() || null;
  const barcode = (input.barcode ?? "").trim() || null;

  const price = parsePrice(input.price);
  if (price === "invalid") {
    return { ok: false, error: "Price must be a non-negative number." };
  }

  const requestedPriceBasis = input.priceBasis ?? "package";
  const rawPriceBasisAmount = parseUnitSizeAmount(input.priceBasisAmount);
  if (rawPriceBasisAmount === "invalid") {
    return { ok: false, error: "Price basis amount must be a positive number." };
  }
  const rawPriceBasisUnit = (input.priceBasisUnit ?? "").trim();
  const priceBasisUnitNormalized = rawPriceBasisUnit
    ? normalizeIngredientUnitForStorage(rawPriceBasisUnit)
    : "";
  if (
    priceBasisUnitNormalized !== "" &&
    !INGREDIENT_UNIT_VALUES.has(priceBasisUnitNormalized)
  ) {
    return { ok: false, error: "Unrecognised price basis unit." };
  }
  const price_basis: ProductPriceBasis | null =
    price == null
      ? null
      : requestedPriceBasis === "weight" && priceBasisUnitNormalized
        ? "weight"
        : requestedPriceBasis === "unit"
          ? "unit"
          : "package";
  const price_basis_amount =
    price_basis === "weight" || price_basis === "unit"
      ? (rawPriceBasisAmount ?? 1)
      : null;
  const price_basis_unit =
    price_basis === "weight"
      ? priceBasisUnitNormalized || null
      : price_basis === "unit"
        ? priceBasisUnitNormalized || "ea"
        : null;

  const unitSizeAmount = parseUnitSizeAmount(input.unitSizeAmount);
  if (unitSizeAmount === "invalid") {
    return { ok: false, error: "Unit size must be a positive number." };
  }

  const rawUnit = (input.unitSizeUnit ?? "").trim();
  const unitNormalized = rawUnit
    ? normalizeIngredientUnitForStorage(rawUnit)
    : "";
  if (unitNormalized !== "" && !INGREDIENT_UNIT_VALUES.has(unitNormalized)) {
    return { ok: false, error: "Unrecognised unit." };
  }

  // Coerce orphaned halves to null: a lone unit with no amount, or a lone
  // amount with no unit, is meaningless to persist.
  const unit_size_amount = unitNormalized === "" ? null : unitSizeAmount;
  const unit_size_unit = unitSizeAmount == null ? null : unitNormalized || null;

  return {
    ok: true,
    value: {
      name,
      brand,
      notes,
      barcode,
      price,
      price_basis,
      price_basis_amount,
      price_basis_unit,
      unit_size_amount,
      unit_size_unit,
    },
  };
}

export async function listIngredientProductsAction(
  ingredientId: number,
): Promise<IngredientProductRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ingredient_products")
    .select("*")
    .eq("ingredient_id", ingredientId)
    .order("rank", { ascending: true })
    .order("id", { ascending: true });
  return (data ?? []) as IngredientProductRow[];
}

export async function addIngredientProductAction(
  ingredientId: number,
  input: IngredientProductInput,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const cleanResult = sanitize(input);
  if (!cleanResult.ok) {
    return { ok: false as const, error: cleanResult.error };
  }
  const clean = cleanResult.value;
  if (!clean.name) {
    return { ok: false as const, error: "Product name is required." };
  }

  // Append to the bottom of the list by default.
  const { data: last } = await supabase
    .from("ingredient_products")
    .select("rank")
    .eq("ingredient_id", ingredientId)
    .order("rank", { ascending: false })
    .limit(1);

  const nextRank =
    last && last.length > 0 ? Number(last[0].rank ?? 0) + 1 : 0;

  const { data: inserted, error } = await supabase
    .from("ingredient_products")
    .insert({
      ingredient_id: ingredientId,
      rank: nextRank,
      name: clean.name,
      brand: clean.brand,
      notes: clean.notes,
      barcode: clean.barcode,
      price: clean.price,
      price_basis: clean.price_basis,
      price_basis_amount: clean.price_basis_amount,
      price_basis_unit: clean.price_basis_unit,
      unit_size_amount: clean.unit_size_amount,
      unit_size_unit: clean.unit_size_unit,
    })
    .select("*")
    .single();

  if (error || !inserted) {
    return {
      ok: false as const,
      error: error?.message ?? "Could not add product.",
    };
  }

  revalidatePath("/inventory");
  return { ok: true as const, product: inserted as IngredientProductRow };
}

export async function updateIngredientProductAction(
  productId: number,
  input: IngredientProductInput,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const cleanResult = sanitize(input);
  if (!cleanResult.ok) {
    return { ok: false as const, error: cleanResult.error };
  }
  const clean = cleanResult.value;
  if (!clean.name) {
    return { ok: false as const, error: "Product name is required." };
  }

  const { error } = await supabase
    .from("ingredient_products")
    .update({
      name: clean.name,
      brand: clean.brand,
      notes: clean.notes,
      barcode: clean.barcode,
      price: clean.price,
      price_basis: clean.price_basis,
      price_basis_amount: clean.price_basis_amount,
      price_basis_unit: clean.price_basis_unit,
      unit_size_amount: clean.unit_size_amount,
      unit_size_unit: clean.unit_size_unit,
    })
    .eq("id", productId);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/inventory");
  return { ok: true as const };
}

export async function deleteIngredientProductAction(productId: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const { error } = await supabase
    .from("ingredient_products")
    .delete()
    .eq("id", productId);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/inventory");
  return { ok: true as const };
}

/**
 * Persist a new rank order for every product tied to an ingredient.
 * Caller passes product IDs in the desired display order (top = rank 0).
 */
export async function reorderIngredientProductsAction(
  ingredientId: number,
  orderedProductIds: number[],
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  for (let i = 0; i < orderedProductIds.length; i++) {
    const { error } = await supabase
      .from("ingredient_products")
      .update({ rank: i })
      .eq("id", orderedProductIds[i])
      .eq("ingredient_id", ingredientId);
    if (error) return { ok: false as const, error: error.message };
  }

  revalidatePath("/inventory");
  return { ok: true as const };
}
