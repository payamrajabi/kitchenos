/** Nutrition data source identifier. */
export type NutritionSourceName =
  | "USDA FoodData Central"
  | "Canadian Nutrient File"
  | "manufacturer";

/** Stored macro columns are always **per 100 g**; count units add `canonical_unit_weight_g` from FDC portions. */
export type NutritionBasis = "per_100g" | "per_unit";

/** Input the pipeline needs for one ingredient. */
export interface PipelineInput {
  ingredientId: number;
  name: string;
  brand: string | null;
  /** Stock unit from inventory_items (e.g. "g", "count", "can"). */
  stockUnit: string | null;
}

/** A single food hit returned by a nutrition data source. */
export interface FoodMatch {
  sourceName: NutritionSourceName;
  sourceRecordId: string;
  sourceUrl: string;
  description: string;
  brandOwner: string | null;
  dataType: string;
  /** kcal per 100 g as reported by the source. */
  kcalPer100g: number;
  fatPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  /** Gram weight for one household portion, when the source provides it. */
  portionGrams: number | null;
  portionDescription: string | null;
}

/** Final pipeline output saved to the ingredient row. */
export interface NutritionPipelineResult {
  ingredientId: number;
  status: "filled" | "needs_review" | "no_match";
  kcal: number | null;
  fat_g: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  basis: NutritionBasis | null;
  canonical_unit_weight_g: number | null;
  source_name: string | null;
  source_record_id: string | null;
  source_url: string | null;
  confidence: number;
  needs_review: boolean;
  notes: string | null;
}

/** Injectable source adapters — keeps the pipeline testable without real HTTP. */
export interface NutritionSources {
  searchUSDA: (
    query: string,
    opts?: { dataTypes?: string[]; brandOwner?: string; pageSize?: number },
  ) => Promise<FoodMatch[]>;
  searchCNF: (query: string) => Promise<FoodMatch[]>;
}
