/**
 * Single canonical list for inventory stock unit and recipe unit (and recipe ingredient units).
 * Values are lowercase, singular, short — label matches value in the UI.
 */

export const INGREDIENT_UNITS = [
  "count",
  "g",
  "kg",
  "oz",
  "lb",
  "ml",
  "l",
  "fl oz",
  "cup",
  "tsp",
  "tbsp",
  "ea",
  "piece",
  "dozen",
  "whole",
  "clove",
  "slice",
  "sprig",
  "pinch",
  "head",
  "bunch",
  "pkg",
  "bag",
  "box",
  "block",
  "tub",
  "container",
  "jar",
  "bottle",
  "can",
  "roll",
  "sleeve",
] as const;

export type IngredientUnit = (typeof INGREDIENT_UNITS)[number];

/** Same list as `INGREDIENT_UNITS` (kept name for existing imports). */
export const RECIPE_UNITS = INGREDIENT_UNITS;

export type RecipeUnit = IngredientUnit;

export const INGREDIENT_UNIT_VALUES = new Set<string>(INGREDIENT_UNITS);

const LEGACY_UNIT_ALIASES: Record<string, string> = {
  L: "l",
};

/** Normalize before validate/save (e.g. legacy uppercase liter). */
export function normalizeIngredientUnitForStorage(raw: string): string {
  const t = raw.trim();
  if (t === "") return "";
  return LEGACY_UNIT_ALIASES[t] ?? t;
}

/** Normalize for matching dropdown options (same as storage for now). */
export function canonicalIngredientUnit(raw: string): string {
  return normalizeIngredientUnitForStorage(raw);
}

export function defaultRecipeUnitForStockUnit(stockUnit: string | null | undefined): RecipeUnit | "" {
  if (!stockUnit) return "";
  const u = normalizeIngredientUnitForStorage(stockUnit);
  if (INGREDIENT_UNIT_VALUES.has(u)) return u as RecipeUnit;
  return "";
}
