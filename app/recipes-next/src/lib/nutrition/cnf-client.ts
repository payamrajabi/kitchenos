/**
 * Canadian Nutrient File (CNF) search client.
 *
 * The CNF is the standard reference food composition database for Canada,
 * maintained by Health Canada.  Its API is public and keyless.
 *
 * https://food-nutrition.canada.ca/cnf-fce/
 */

import type { FoodMatch, NutritionSourceName } from "./types";

const CNF_BASE =
  "https://food-nutrition.canada.ca/api/canadian-nutrient-file";
const SOURCE_NAME: NutritionSourceName = "Canadian Nutrient File";

const KCAL_ID = 208;
const PROTEIN_ID = 203;
const FAT_ID = 204;
const CARBS_ID = 205;

interface CNFFood {
  food_code: number;
  food_description: string;
}

interface CNFNutrientAmount {
  nutrient_name_id: number;
  nutrient_value: number;
}

export async function searchCNF(query: string): Promise<FoodMatch[]> {
  let res: Response;
  try {
    const params = new URLSearchParams({ lang: "en", name: query });
    res = await fetch(`${CNF_BASE}/food/?${params}`, {
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return [];
  }

  if (!res.ok) return [];

  let foods: CNFFood[];
  try {
    foods = (await res.json()) as CNFFood[];
  } catch {
    return [];
  }

  if (!Array.isArray(foods) || foods.length === 0) return [];

  const top = foods.slice(0, 3);
  const results: FoodMatch[] = [];

  for (const food of top) {
    try {
      const nRes = await fetch(
        `${CNF_BASE}/nutrientamount/?lang=en&id=${food.food_code}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!nRes.ok) continue;

      const nutrients = (await nRes.json()) as CNFNutrientAmount[];
      if (!Array.isArray(nutrients)) continue;

      const findVal = (id: number) =>
        nutrients.find((n) => n.nutrient_name_id === id)?.nutrient_value ?? 0;

      results.push({
        sourceName: SOURCE_NAME,
        sourceRecordId: String(food.food_code),
        sourceUrl: `https://food-nutrition.canada.ca/cnf-fce/food-aliment?id=${food.food_code}&lang=en`,
        description: food.food_description,
        brandOwner: null,
        dataType: "CNF",
        kcalPer100g: findVal(KCAL_ID),
        fatPer100g: findVal(FAT_ID),
        proteinPer100g: findVal(PROTEIN_ID),
        carbsPer100g: findVal(CARBS_ID),
        portionGrams: null,
        portionDescription: null,
      });
    } catch {
      continue;
    }
  }

  return results;
}
