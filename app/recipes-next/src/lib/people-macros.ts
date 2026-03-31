import type { PersonRow } from "@/types/database";

const CAL_PER_PROTEIN_G = 4;
const CAL_PER_CARB_G = 4;
const CAL_PER_FAT_G = 9;

function parseNum(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function gramsFromMinMax(min: number | null, max: number | null): number | null {
  if (min !== null && max !== null) return (min + max) / 2;
  if (max !== null) return max;
  if (min !== null) return min;
  return null;
}

export type PersonMacroCalories = {
  targetCalories: number;
  proteinCal: number;
  fatCal: number;
  carbCal: number;
  proteinGrams: number;
  fatGrams: number;
  carbGrams: number;
};

/**
 * Pie uses slider targets when set (fat_target_grams, carb_target_grams); otherwise fat/carbs
 * fall back to min–max midpoint or calorie remainder.
 */
export function macroCaloriesFromPerson(person: PersonRow): PersonMacroCalories | null {
  const target =
    parseNum(person.calorie_target) ?? parseNum(person.daily_calorie_expenditure);
  if (target === null || target <= 0) return null;

  const proteinGrams = parseNum(person.protein_target_grams) ?? 0;
  const fatTarget = parseNum(person.fat_target_grams);
  const fatGrams =
    fatTarget !== null
      ? fatTarget
      : gramsFromMinMax(parseNum(person.fat_min_grams), parseNum(person.fat_max_grams)) ?? 0;

  const carbTarget = parseNum(person.carb_target_grams);
  const carbFromBand = gramsFromMinMax(
    parseNum(person.carb_min_grams),
    parseNum(person.carb_max_grams),
  );

  let proteinCal = Math.max(0, proteinGrams * CAL_PER_PROTEIN_G);
  let fatCal = Math.max(0, fatGrams * CAL_PER_FAT_G);
  let carbCal: number;
  let carbGrams: number;

  if (carbTarget !== null) {
    carbGrams = carbTarget;
    carbCal = Math.max(0, carbGrams * CAL_PER_CARB_G);
  } else if (carbFromBand !== null) {
    carbGrams = carbFromBand;
    carbCal = Math.max(0, carbGrams * CAL_PER_CARB_G);
  } else {
    const pf = proteinCal + fatCal;
    if (pf > target && pf > 0) {
      const s = target / pf;
      proteinCal *= s;
      fatCal *= s;
    }
    carbCal = Math.max(0, target - proteinCal - fatCal);
    carbGrams = carbCal / CAL_PER_CARB_G;
  }

  return {
    targetCalories: target,
    proteinCal,
    fatCal,
    carbCal,
    proteinGrams,
    fatGrams,
    carbGrams,
  };
}

/** Pie diameter scales linearly with calorie target (largest target → maxPx). */
export function pieDiameterForTarget(
  targetCalories: number,
  maxTarget: number,
  minPx: number,
  maxPx: number,
): number {
  if (maxTarget <= 0) return minPx;
  const t = Math.max(0, targetCalories);
  const ratio = Math.min(1, t / maxTarget);
  return minPx + ratio * (maxPx - minPx);
}
