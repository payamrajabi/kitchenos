import { describe, it, expect } from "vitest";
import { isNutritionEffectivelyEmpty } from "@/lib/inventory-nutrition-display";

describe("isNutritionEffectivelyEmpty", () => {
  it("is true when all macros are null", () => {
    expect(
      isNutritionEffectivelyEmpty({
        kcal: null,
        fat_g: null,
        protein_g: null,
        carbs_g: null,
      }),
    ).toBe(true);
  });

  it("is true when all stored values are zero (refillable)", () => {
    expect(
      isNutritionEffectivelyEmpty({
        kcal: 0,
        fat_g: 0,
        protein_g: 0,
        carbs_g: 0,
      }),
    ).toBe(true);
  });

  it("is false when any value is non-zero", () => {
    expect(
      isNutritionEffectivelyEmpty({
        kcal: null,
        fat_g: 0.1,
        protein_g: null,
        carbs_g: null,
      }),
    ).toBe(false);
  });

  it("is false when kcal is set", () => {
    expect(
      isNutritionEffectivelyEmpty({
        kcal: 100,
        fat_g: null,
        protein_g: null,
        carbs_g: null,
      }),
    ).toBe(false);
  });
});
