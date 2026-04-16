import type { IngredientRow } from "@/types/database";

/**
 * True when we have no usable nutrition to show — either all null or only zeros
 * (zeros often mean a failed API parse or a bad run, and should be refillable).
 */
export function isNutritionEffectivelyEmpty(ingredient: {
  kcal?: number | null;
  fat_g?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
}): boolean {
  const vals = [
    ingredient.kcal,
    ingredient.fat_g,
    ingredient.protein_g,
    ingredient.carbs_g,
  ];
  return vals.every((v) => v == null || v === 0);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** kcal per 100 g from DB, or estimated from macros when energy is missing/zero. */
export function effectiveKcalPer100g(ing: IngredientRow): number | null {
  const k = ing.kcal;
  if (typeof k === "number" && Number.isFinite(k) && k > 0) return round1(k);

  const f = ing.fat_g;
  const p = ing.protein_g;
  const c = ing.carbs_g;
  const fat = typeof f === "number" && Number.isFinite(f) ? f : 0;
  const protein = typeof p === "number" && Number.isFinite(p) ? p : 0;
  const carbs = typeof c === "number" && Number.isFinite(c) ? c : 0;
  if (fat === 0 && protein === 0 && carbs === 0) return null;

  const est = 9 * fat + 4 * protein + 4 * carbs;
  if (!Number.isFinite(est) || est <= 0) return null;
  return round1(est);
}

export type NutritionPer100gDisplay = {
  kcal: number | null;
  fatG: number | null;
  proteinG: number | null;
  carbsG: number | null;
};

/**
 * Values for the inventory table: all macros are shown **per 100 g** of product.
 * Pipeline rows use `per_100g` basis; legacy `per_unit` rows are converted when
 * a per-unit weight in grams is available.
 */
export function nutritionPer100gForDisplay(ing: IngredientRow): NutritionPer100gDisplay {
  const basis = ing.nutrition_basis ?? "per_100g";

  if (basis === "per_unit") {
    const gRaw =
      typeof ing.canonical_unit_weight_g === "number" &&
      Number.isFinite(ing.canonical_unit_weight_g) &&
      ing.canonical_unit_weight_g > 0
        ? ing.canonical_unit_weight_g
        : typeof ing.nutrition_serving_size_g === "number" &&
            Number.isFinite(ing.nutrition_serving_size_g) &&
            ing.nutrition_serving_size_g > 0
          ? ing.nutrition_serving_size_g
          : null;
    if (gRaw == null) {
      return { kcal: null, fatG: null, proteinG: null, carbsG: null };
    }
    const s = 100 / gRaw;
    const k = ing.kcal;
    const f = ing.fat_g;
    const p = ing.protein_g;
    const c = ing.carbs_g;
    return {
      kcal:
        k != null && Number.isFinite(k) ? round1(k * s) : null,
      fatG: f != null && Number.isFinite(f) ? round1(f * s) : null,
      proteinG: p != null && Number.isFinite(p) ? round1(p * s) : null,
      carbsG: c != null && Number.isFinite(c) ? round1(c * s) : null,
    };
  }

  return {
    kcal: effectiveKcalPer100g(ing),
    fatG:
      ing.fat_g != null && Number.isFinite(ing.fat_g) ? round1(ing.fat_g) : null,
    proteinG:
      ing.protein_g != null && Number.isFinite(ing.protein_g)
        ? round1(ing.protein_g)
        : null,
    carbsG:
      ing.carbs_g != null && Number.isFinite(ing.carbs_g)
        ? round1(ing.carbs_g)
        : null,
  };
}
