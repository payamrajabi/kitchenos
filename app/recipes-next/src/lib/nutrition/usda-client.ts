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

interface USDANutrient {
  nutrientId: number;
  value: number;
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
}

function extractNutrient(nutrients: USDANutrient[], id: number): number {
  return nutrients.find((n) => n.nutrientId === id)?.value ?? 0;
}

function getApiKey(explicit?: string): string {
  return explicit || process.env.USDA_FDC_API_KEY || "DEMO_KEY";
}

/**
 * Full food record including **foodPortions** (gram weights for count-based derivation).
 * Search results often omit portions — call this when you need edible weight.
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
