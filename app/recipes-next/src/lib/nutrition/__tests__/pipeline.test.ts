import { describe, it, expect, vi } from "vitest";
import { runNutritionPipeline } from "../pipeline";
import {
  NUTRITION_SOURCE_LLM_ESTIMATE,
  type FoodMatch,
  type PipelineInput,
  type NutritionSources,
} from "../types";
import type { USDAFoodDetail } from "../usda-client";

function mockSources(overrides?: {
  usda?: (q: string, o?: Record<string, unknown>) => Promise<FoodMatch[]>;
  cnf?: FoodMatch[];
}): NutritionSources {
  return {
    searchUSDA:
      (overrides?.usda as NutritionSources["searchUSDA"]) ??
      vi.fn().mockResolvedValue([]),
    searchCNF: vi.fn().mockResolvedValue(overrides?.cnf ?? []),
  };
}

const noopLlm = vi.fn().mockResolvedValue(null);
/** Default: no approximate LLM fill (preserves old “no_match when APIs empty” behavior). */
const noopLlmEstimate = vi.fn().mockResolvedValue(null);
const pipelineTestDeps = { llmAssist: noopLlm, llmEstimate: noopLlmEstimate };

const chickenCnf: FoodMatch = {
  sourceName: "Canadian Nutrient File",
  sourceRecordId: "814",
  sourceUrl: "https://food-nutrition.canada.ca/cnf-fce/food-aliment?id=814&lang=en",
  description: "Chicken breast, without skin, raw",
  brandOwner: null,
  dataType: "CNF",
  kcalPer100g: 120,
  fatPer100g: 2.6,
  proteinPer100g: 22.5,
  carbsPer100g: 0,
  portionGrams: null,
  portionDescription: null,
};

const chickenFoundation: FoodMatch = {
  sourceName: "USDA FoodData Central",
  sourceRecordId: "171077",
  sourceUrl: "https://fdc.nal.usda.gov/food-details/171077/nutrients",
  description: "Chicken, broilers or fryers, breast, meat only, raw",
  brandOwner: null,
  dataType: "Foundation",
  kcalPer100g: 121,
  fatPer100g: 2.6,
  proteinPer100g: 22.5,
  carbsPer100g: 0,
  portionGrams: null,
  portionDescription: null,
};

const heinzKetchup: FoodMatch = {
  sourceName: "USDA FoodData Central",
  sourceRecordId: "2093087",
  sourceUrl: "https://fdc.nal.usda.gov/food-details/2093087/nutrients",
  description: "HEINZ, Tomato Ketchup",
  brandOwner: "Heinz",
  dataType: "Branded",
  kcalPer100g: 100,
  fatPer100g: 0,
  proteinPer100g: 1.2,
  carbsPer100g: 26,
  portionGrams: 17,
  portionDescription: "g",
};

const flourA: FoodMatch = {
  sourceName: "USDA FoodData Central",
  sourceRecordId: "169761",
  sourceUrl: "https://fdc.nal.usda.gov/food-details/169761/nutrients",
  description: "Wheat flour, white, all-purpose, enriched, bleached",
  brandOwner: null,
  dataType: "Foundation",
  kcalPer100g: 364,
  fatPer100g: 1.0,
  proteinPer100g: 10.3,
  carbsPer100g: 76.3,
  portionGrams: null,
  portionDescription: null,
};

const flourB: FoodMatch = {
  sourceName: "USDA FoodData Central",
  sourceRecordId: "169762",
  sourceUrl: "https://fdc.nal.usda.gov/food-details/169762/nutrients",
  description: "Wheat flour, white, bread, enriched",
  brandOwner: null,
  dataType: "Foundation",
  kcalPer100g: 361,
  fatPer100g: 1.7,
  proteinPer100g: 12.0,
  carbsPer100g: 72.5,
  portionGrams: null,
  portionDescription: null,
};

describe("generic whole food — CNF first", () => {
  it("uses CNF when confidence is sufficient", async () => {
    const sources = mockSources({
      cnf: [chickenCnf],
      usda: vi.fn().mockResolvedValue([]),
    });
    const input: PipelineInput = {
      ingredientId: 1,
      name: "Chicken Breast",
      brand: null,
      stockUnit: "g",
    };

    const result = await runNutritionPipeline(input, sources, pipelineTestDeps);

    expect(result.status).toBe("filled");
    expect(result.basis).toBe("per_100g");
    expect(result.kcal).toBe(120);
    expect(result.source_name).toBe("Canadian Nutrient File");
    expect(sources.searchUSDA).not.toHaveBeenCalled();
  });
});

describe("generic — Foundation when CNF missing", () => {
  it("falls through to USDA Foundation only", async () => {
    const usda = vi.fn(async (_q: string, opts?: { dataTypes?: string[] }) => {
      if (opts?.dataTypes?.includes("Foundation")) {
        return [chickenFoundation];
      }
      return [];
    });
    const sources = mockSources({ cnf: [], usda });

    const result = await runNutritionPipeline(
      {
        ingredientId: 2,
        name: "Chicken Breast",
        brand: null,
        stockUnit: "g",
      },
      sources,
      pipelineTestDeps,
    );

    expect(result.status).toBe("filled");
    expect(result.source_name).toBe("USDA FoodData Central");
    expect(result.basis).toBe("per_100g");
    expect(usda).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ dataTypes: ["Foundation"] }),
    );
  });
});

describe("branded packaged food", () => {
  it("uses FDC Branded (manufacturer label data)", async () => {
    const usda = vi.fn(async (_q: string, opts?: { dataTypes?: string[] }) => {
      if (opts?.dataTypes?.includes("Branded")) return [heinzKetchup];
      return [];
    });
    const sources = mockSources({ usda });

    const result = await runNutritionPipeline(
      {
        ingredientId: 3,
        name: "Heinz Ketchup",
        brand: "Heinz",
        stockUnit: "g",
      },
      sources,
      pipelineTestDeps,
    );

    expect(result.kcal).toBe(100);
    expect(result.basis).toBe("per_100g");
    expect(result.source_record_id).toBe("2093087");
  });
});

describe("macros always per 100 g", () => {
  it("does not scale macros into per-unit storage", async () => {
    const detail: USDAFoodDetail = {
      fdcId: 171287,
      description: "Egg",
      dataType: "Foundation",
      foodPortions: [{ gramWeight: 50, modifier: "1 large" }],
      micronutrients: [],
    };
    const fetchFoodDetail = vi.fn().mockResolvedValue(detail);

    const usda = vi.fn(async (_q: string, opts?: { dataTypes?: string[] }) => {
      if (opts?.dataTypes?.includes("Foundation")) {
        return [
          {
            ...chickenFoundation,
            sourceRecordId: "171287",
            description: "Egg, whole, raw, fresh",
            kcalPer100g: 143,
            fatPer100g: 9.5,
            proteinPer100g: 12.6,
            carbsPer100g: 0.7,
          },
        ];
      }
      return [];
    });
    const sources = mockSources({ cnf: [], usda });

    const result = await runNutritionPipeline(
      {
        ingredientId: 4,
        name: "Egg",
        brand: null,
        stockUnit: "count",
      },
      sources,
      { ...pipelineTestDeps, fetchFoodDetail },
    );

    expect(result.kcal).toBe(143);
    expect(result.basis).toBe("per_100g");
    expect(result.canonical_unit_weight_g).toBe(50);
  });
});

describe("ambiguous Foundation matches", () => {
  it("flags review when two Foundation foods score similarly", async () => {
    const usda = vi.fn(async (_q: string, opts?: { dataTypes?: string[] }) => {
      if (opts?.dataTypes?.includes("Foundation")) return [flourA, flourB];
      return [];
    });
    const sources = mockSources({ cnf: [], usda });

    const result = await runNutritionPipeline(
      {
        ingredientId: 5,
        name: "Flour",
        brand: null,
        stockUnit: "g",
      },
      sources,
      pipelineTestDeps,
    );

    expect(result.kcal).toBeGreaterThan(0);
    expect(result.needs_review).toBe(true);
    expect(result.basis).toBe("per_100g");
  });
});

describe("deterministic JSON shape", () => {
  it("returns all expected keys", async () => {
    const sources = mockSources({ cnf: [chickenCnf], usda: vi.fn() });
    const result = await runNutritionPipeline(
      {
        ingredientId: 6,
        name: "Chicken Breast",
        brand: null,
        stockUnit: "g",
      },
      sources,
      pipelineTestDeps,
    );

    for (const key of [
      "ingredientId",
      "status",
      "kcal",
      "fat_g",
      "protein_g",
      "carbs_g",
      "basis",
      "canonical_unit_weight_g",
      "source_name",
      "source_record_id",
      "source_url",
      "confidence",
      "needs_review",
      "notes",
      "micronutrients",
      "portions",
      "food_type",
    ] as const) {
      expect(result).toHaveProperty(key);
    }
  });
});

describe("no official match", () => {
  it("returns no_match when APIs are empty and LLM estimate is unavailable", async () => {
    const sources = mockSources({
      cnf: [],
      usda: vi.fn().mockResolvedValue([]),
    });
    const result = await runNutritionPipeline(
      {
        ingredientId: 7,
        name: "zzzznonexistent99999",
        brand: null,
        stockUnit: "g",
      },
      sources,
      pipelineTestDeps,
    );

    expect(result.status).toBe("no_match");
    expect(result.kcal).toBeNull();
    expect(result.notes ?? "").toMatch(
      /OPENAI_API_KEY|Approximate AI fallback did not return usable/,
    );
  });

  it("uses approximate LLM values when official sources find nothing", async () => {
    const sources = mockSources({
      cnf: [],
      usda: vi.fn().mockResolvedValue([]),
    });
    const mockEstimate = vi.fn().mockResolvedValue({
      kcalPer100g: 31,
      fatPer100g: 0.3,
      proteinPer100g: 1,
      carbsPer100g: 7,
      gramsPerCountUnit: null,
      rationale: "Assumed raw sweet green pepper.",
    });

    const result = await runNutritionPipeline(
      {
        ingredientId: 42,
        name: "Green bell pepper",
        brand: null,
        stockUnit: "g",
      },
      sources,
      { llmAssist: noopLlm, llmEstimate: mockEstimate },
    );

    expect(result.status).toBe("needs_review");
    expect(result.source_name).toBe(NUTRITION_SOURCE_LLM_ESTIMATE);
    expect(result.kcal).toBe(31);
    expect(result.protein_g).toBe(1);
    expect(result.needs_review).toBe(true);
    expect(mockEstimate).toHaveBeenCalled();
  });
});
