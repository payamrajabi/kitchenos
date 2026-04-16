/**
 * USDA FoodData Central search client.
 *
 * Branded data in FDC comes from the GS1 (grocery industry) database,
 * so it IS manufacturer-reported official nutrition data.
 *
 * Free API key: https://fdc.nal.usda.gov/api-key-signup
 * Set USDA_FDC_API_KEY in your environment; falls back to DEMO_KEY
 * (30 req/hr, 50 req/day).
 */

import type { FoodMatch, NutritionSourceName } from "./types";

const USDA_BASE = "https://api.nal.usda.gov/fdc/v1";
const SOURCE_NAME: NutritionSourceName = "USDA FoodData Central";

const KCAL_ID = 1008;
const PROTEIN_ID = 1003;
const FAT_ID = 1004;
const CARBS_ID = 1005;

/**
 * Micronutrients we care about beyond the big-four macros.
 * USDA nutrient IDs → human-readable name + storage unit.
 */
export const TRACKED_MICRONUTRIENTS: ReadonlyMap<
  number,
  { name: string; unit: string }
> = new Map([
  [1079, { name: "Fiber", unit: "g" }],
  [1087, { name: "Calcium", unit: "mg" }],
  [1089, { name: "Iron", unit: "mg" }],
  [1090, { name: "Magnesium", unit: "mg" }],
  [1091, { name: "Phosphorus", unit: "mg" }],
  [1092, { name: "Potassium", unit: "mg" }],
  [1093, { name: "Sodium", unit: "mg" }],
  [1095, { name: "Zinc", unit: "mg" }],
  [1098, { name: "Copper", unit: "mg" }],
  [1101, { name: "Manganese", unit: "mg" }],
  [1103, { name: "Selenium", unit: "mcg" }],
  [1162, { name: "Vitamin C", unit: "mg" }],
  [1165, { name: "Thiamin (B1)", unit: "mg" }],
  [1166, { name: "Riboflavin (B2)", unit: "mg" }],
  [1167, { name: "Niacin (B3)", unit: "mg" }],
  [1170, { name: "Pantothenic Acid (B5)", unit: "mg" }],
  [1175, { name: "Vitamin B6", unit: "mg" }],
  [1177, { name: "Folate (B9)", unit: "mcg" }],
  [1178, { name: "Vitamin B12", unit: "mcg" }],
  [1106, { name: "Vitamin A (RAE)", unit: "mcg" }],
  [1114, { name: "Vitamin D", unit: "mcg" }],
  [1109, { name: "Vitamin E", unit: "mg" }],
  [1185, { name: "Vitamin K", unit: "mcg" }],
  [1253, { name: "Cholesterol", unit: "mg" }],
  [1258, { name: "Saturated Fat", unit: "g" }],
  [1292, { name: "Monounsaturated Fat", unit: "g" }],
  [1293, { name: "Polyunsaturated Fat", unit: "g" }],
  [1235, { name: "Added Sugars", unit: "g" }],
  [2000, { name: "Total Sugars", unit: "g" }],
  [1063, { name: "Total Sugars (alt)", unit: "g" }],
]);

/** A single resolved micronutrient value ready for storage. */
export type ResolvedNutrient = {
  nutrientId: number;
  name: string;
  value: number;
  unit: string;
};

interface USDANutrient {
  nutrientId?: number;
  value?: number;
  amount?: number;
  nutrient?: { id?: number; name?: string; unitName?: string };
}

interface USDAFood {
  fdcId: number;
  description: string;
  dataType: string;
  brandOwner?: string;
  brandName?: string;
  foodNutrients: USDANutrient[];
  servingSize?: number;
  servingSizeUnit?: string;
}

/** Portions from GET /v1/food/{fdcId} — used for edible gram weight (count units). */
export interface USDAFoodPortion {
  gramWeight?: number | null;
  modifier?: string | null;
  portionDescription?: string | null;
  measureUnit?: string | null;
}

export interface USDAFoodDetail {
  fdcId: number;
  description: string;
  dataType: string;
  foodPortions?: USDAFoodPortion[];
  /** All tracked micronutrients found in the detail response (per 100 g). */
  micronutrients: ResolvedNutrient[];
}

/**
 * FDC search/detail payloads vary: some use `value`, others `amount`, and
 * nutrient id may live on `nutrientId` or nested `nutrient.id`.
 */
function extractNutrient(nutrients: USDANutrient[] | undefined, id: number): number {
  if (!Array.isArray(nutrients)) return 0;
  for (const raw of nutrients) {
    if (!raw || typeof raw !== "object") continue;
    const n = raw as USDANutrient;
    const nutId =
      typeof n.nutrientId === "number"
        ? n.nutrientId
        : typeof n.nutrient?.id === "number"
          ? n.nutrient.id
          : undefined;
    if (nutId !== id) continue;
    const v =
      typeof n.value === "number"
        ? n.value
        : typeof n.amount === "number"
          ? n.amount
          : NaN;
    if (Number.isFinite(v)) return v;
  }
  return 0;
}

function getApiKey(explicit?: string): string {
  return explicit || process.env.USDA_FDC_API_KEY || "DEMO_KEY";
}

/**
 * Extract all tracked micronutrients from a USDA nutrient array.
 * Returns only nutrients with a finite positive value.
 */
export function extractMicronutrients(
  nutrients: USDANutrient[] | undefined,
): ResolvedNutrient[] {
  if (!Array.isArray(nutrients)) return [];
  const results: ResolvedNutrient[] = [];

  for (const raw of nutrients) {
    if (!raw || typeof raw !== "object") continue;
    const nutId =
      typeof raw.nutrientId === "number"
        ? raw.nutrientId
        : typeof raw.nutrient?.id === "number"
          ? raw.nutrient.id
          : undefined;
    if (nutId == null) continue;

    const meta = TRACKED_MICRONUTRIENTS.get(nutId);
    if (!meta) continue;

    const v =
      typeof raw.value === "number"
        ? raw.value
        : typeof raw.amount === "number"
          ? raw.amount
          : NaN;
    if (!Number.isFinite(v) || v <= 0) continue;

    results.push({
      nutrientId: nutId,
      name: meta.name,
      value: Math.round(v * 1000) / 1000,
      unit: meta.unit,
    });
  }

  return results;
}

/**
 * Full food record including **foodPortions** (gram weights for count-based derivation)
 * and **micronutrients** (all tracked nutrients beyond the big-four macros).
 * Search results often omit portions — call this when you need edible weight or micros.
 */
export async function fetchUSDAFoodDetail(
  fdcId: string | number,
  apiKey?: string,
): Promise<USDAFoodDetail | null> {
  const key = getApiKey(apiKey);
  let res: Response;
  try {
    res = await fetch(
      `${USDA_BASE}/food/${fdcId}?api_key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(12_000) },
    );
  } catch {
    return null;
  }
  if (!res.ok) return null;
  try {
    const data = (await res.json()) as USDAFoodDetail & {
      foodNutrients?: USDANutrient[];
    };
    if (data?.fdcId == null) return null;
    return {
      fdcId: Number(data.fdcId),
      description: String(data.description ?? ""),
      dataType: String(data.dataType ?? ""),
      foodPortions: Array.isArray(data.foodPortions) ? data.foodPortions : [],
      micronutrients: extractMicronutrients(data.foodNutrients),
    };
  } catch {
    return null;
  }
}

export async function searchUSDA(
  query: string,
  opts: {
    dataTypes?: string[];
    brandOwner?: string;
    pageSize?: number;
    apiKey?: string;
  } = {},
): Promise<FoodMatch[]> {
  const apiKey = getApiKey(opts.apiKey);
  const pageSize = opts.pageSize ?? 5;

  const params = new URLSearchParams({
    query,
    api_key: apiKey,
    pageSize: String(pageSize),
  });

  if (opts.dataTypes?.length) {
    params.set("dataType", opts.dataTypes.join(","));
  }
  if (opts.brandOwner) {
    params.set("brandOwner", opts.brandOwner);
  }

  let res: Response;
  try {
    res = await fetch(`${USDA_BASE}/foods/search?${params}`, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return [];
  }

  if (!res.ok) return [];

  let data: { foods?: USDAFood[] };
  try {
    data = (await res.json()) as { foods?: USDAFood[] };
  } catch {
    return [];
  }

  if (!data.foods?.length) return [];

  return data.foods.map(
    (f): FoodMatch => ({
      sourceName: SOURCE_NAME,
      sourceRecordId: String(f.fdcId),
      sourceUrl: `https://fdc.nal.usda.gov/food-details/${f.fdcId}/nutrients`,
      description: f.description,
      brandOwner: f.brandOwner ?? f.brandName ?? null,
      dataType: f.dataType,
      kcalPer100g: extractNutrient(f.foodNutrients, KCAL_ID),
      fatPer100g: extractNutrient(f.foodNutrients, FAT_ID),
      proteinPer100g: extractNutrient(f.foodNutrients, PROTEIN_ID),
      carbsPer100g: extractNutrient(f.foodNutrients, CARBS_ID),
      portionGrams: f.servingSize ?? null,
      portionDescription: f.servingSizeUnit ?? null,
    }),
  );
}
