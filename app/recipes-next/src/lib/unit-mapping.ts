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

const UNIT_PLURALS: Record<string, string> = {
  cup: "cups",
  piece: "pieces",
  clove: "cloves",
  slice: "slices",
  sprig: "sprigs",
  pinch: "pinches",
  head: "heads",
  bunch: "bunches",
  bag: "bags",
  box: "boxes",
  block: "blocks",
  tub: "tubs",
  container: "containers",
  jar: "jars",
  bottle: "bottles",
  can: "cans",
  roll: "rolls",
  sleeve: "sleeves",
  lb: "lbs",
};

/** Display-only plural form for a unit when the quantity is not 1. */
export function pluralizeUnit(unit: string, amount: string | number | null | undefined): string {
  if (amount == null || amount === "") return unit;
  const n = typeof amount === "number" ? amount : parseFloat(String(amount));
  if (isNaN(n) || n === 1 || n === -1) return unit;
  return UNIT_PLURALS[unit] ?? unit;
}

export function defaultRecipeUnitForStockUnit(stockUnit: string | null | undefined): RecipeUnit | "" {
  if (!stockUnit) return "";
  const u = normalizeIngredientUnitForStorage(stockUnit);
  if (INGREDIENT_UNIT_VALUES.has(u)) return u as RecipeUnit;
  return "";
}
