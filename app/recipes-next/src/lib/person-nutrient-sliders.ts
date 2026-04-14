import type { PersonRow } from "@/types/database";

export type NutrientSliderField =
  | "calorie_target"
  | "protein_target_grams"
  | "fat_target_grams"
  | "carb_target_grams";

/** When true, that slider's target stays fixed unless you drag that slider yourself. */
export type NutrientLockState = Record<NutrientSliderField, boolean>;

export const DEFAULT_NUTRIENT_LOCKS: NutrientLockState = {
  calorie_target: false,
  protein_target_grams: false,
  fat_target_grams: false,
  carb_target_grams: false,
};

const ALL_NUTRIENT_SLIDER_FIELDS: readonly NutrientSliderField[] = [
  "calorie_target",
  "protein_target_grams",
  "fat_target_grams",
  "carb_target_grams",
] as const;

export function countUnlockedNutrientSliders(locks: NutrientLockState): number {
  return ALL_NUTRIENT_SLIDER_FIELDS.filter((f) => !locks[f]).length;
}

/** At least one slider must remain unlocked (cannot lock the last one). */
export function canSetNutrientLock(
  locks: NutrientLockState,
  field: NutrientSliderField,
  nextLocked: boolean,
): boolean {
  if (!nextLocked) return true;
  if (locks[field]) return true;
  return countUnlockedNutrientSliders(locks) > 1;
}

export type NutrientSliderSpec = {
  label: string;
  min: number;
  max: number;
  step: number;
  field: NutrientSliderField;
  /** Shown next to the current target value */
  unit: string;
};

/** DB columns for optional min / max band per slider (target field names the row). */
export function nutrientBandKeys(targetField: NutrientSliderField): {
  minKey: keyof PersonRow;
  maxKey: keyof PersonRow;
} {
  switch (targetField) {
    case "calorie_target":
      return { minKey: "calorie_min", maxKey: "calorie_max" };
    case "protein_target_grams":
      return { minKey: "protein_min_grams", maxKey: "protein_max_grams" };
    case "fat_target_grams":
      return { minKey: "fat_min_grams", maxKey: "fat_max_grams" };
    case "carb_target_grams":
      return { minKey: "carb_min_grams", maxKey: "carb_max_grams" };
    default:
      return { minKey: "calorie_min", maxKey: "calorie_max" };
  }
}

export function readNutrientBand(
  person: PersonRow,
  targetField: NutrientSliderField,
): { min: number | null; max: number | null } {
  const { minKey, maxKey } = nutrientBandKeys(targetField);
  return {
    min: parseStrNum(person[minKey] as string | null),
    max: parseStrNum(person[maxKey] as string | null),
  };
}

export function snapToNutrientStep(value: number, spec: NutrientSliderSpec): number {
  const s = spec.step;
  const snapped = Math.round(value / s) * s;
  return clampNutrientValue(snapped, spec.min, spec.max, value);
}

/** First “minimum” click: a bit below current target, snapped to step. */
export function suggestedBandMin(target: number, spec: NutrientSliderSpec): number {
  const span = spec.max - spec.min;
  const delta = Math.max(spec.step, Math.round((span * 0.07) / spec.step) * spec.step);
  return snapToNutrientStep(Math.max(spec.min, target - delta), spec);
}

/** First “maximum” click: a bit above current target, snapped to step. */
export function suggestedBandMax(target: number, spec: NutrientSliderSpec): number {
  const span = spec.max - spec.min;
  const delta = Math.max(spec.step, Math.round((span * 0.07) / spec.step) * spec.step);
  return snapToNutrientStep(Math.min(spec.max, target + delta), spec);
}

export function clampTargetToBand(
  target: number,
  bandMin: number | null,
  bandMax: number | null,
  spec: NutrientSliderSpec,
): number {
  let t = clampNutrientValue(target, spec.min, spec.max, target);
  if (bandMin !== null) t = Math.max(t, bandMin);
  if (bandMax !== null) t = Math.min(t, bandMax);
  return snapToNutrientStep(t, spec);
}

/** Nutrition-label (Atwater) energy from protein, fat, and digestible carbohydrate grams. */
export const ATWATER_KCAL_PER_PROTEIN_G = 4;
export const ATWATER_KCAL_PER_CARB_G = 4;
export const ATWATER_KCAL_PER_FAT_G = 9;

export function atwaterCaloriesFromGrams(
  proteinG: number,
  fatG: number,
  carbG: number,
): number {
  return (
    proteinG * ATWATER_KCAL_PER_PROTEIN_G +
    carbG * ATWATER_KCAL_PER_CARB_G +
    fatG * ATWATER_KCAL_PER_FAT_G
  );
}

function nutrientSpec(field: NutrientSliderField): NutrientSliderSpec {
  const s = PERSON_NUTRIENT_SLIDERS.find((x) => x.field === field);
  if (!s) throw new Error(`Unknown nutrient field: ${field}`);
  return s;
}

/** Snap total kcal (from macros) to the calories slider step and global min/max. */
export function snapCaloriesFromMacros(
  proteinG: number,
  fatG: number,
  carbG: number,
): number {
  const calSpec = nutrientSpec("calorie_target");
  return snapToNutrientStep(atwaterCaloriesFromGrams(proteinG, fatG, carbG), calSpec);
}

/**
 * Scale protein / fat / carbs so their Atwater total matches desired calories (after snap),
 * preserving the current macro mix. If current energy from macros is zero, uses a default
 * calorie split (30% protein, 35% carbs, 35% fat by kcal).
 */
export function scaleMacrosToCalorieTarget(
  proteinG: number,
  fatG: number,
  carbG: number,
  desiredCalories: number,
): { p: number; f: number; c: number } {
  const calSpec = nutrientSpec("calorie_target");
  const pSpec = nutrientSpec("protein_target_grams");
  const fSpec = nutrientSpec("fat_target_grams");
  const cSpec = nutrientSpec("carb_target_grams");

  const target = snapToNutrientStep(
    clampNutrientValue(desiredCalories, calSpec.min, calSpec.max, desiredCalories),
    calSpec,
  );

  const sum = atwaterCaloriesFromGrams(proteinG, fatG, carbG);
  let p2: number;
  let f2: number;
  let c2: number;

  if (sum <= 0) {
    p2 = (0.3 * target) / ATWATER_KCAL_PER_PROTEIN_G;
    c2 = (0.35 * target) / ATWATER_KCAL_PER_CARB_G;
    f2 = (0.35 * target) / ATWATER_KCAL_PER_FAT_G;
  } else {
    const k = target / sum;
    p2 = proteinG * k;
    f2 = fatG * k;
    c2 = carbG * k;
  }

  return {
    p: snapToNutrientStep(p2, pSpec),
    f: snapToNutrientStep(f2, fSpec),
    c: snapToNutrientStep(c2, cSpec),
  };
}

type MacroSliderField = Exclude<NutrientSliderField, "calorie_target">;

const MACRO_SLIDER_FIELDS: readonly MacroSliderField[] = [
  "protein_target_grams",
  "fat_target_grams",
  "carb_target_grams",
];

function macroKcalCoeff(m: MacroSliderField): number {
  switch (m) {
    case "protein_target_grams":
      return ATWATER_KCAL_PER_PROTEIN_G;
    case "fat_target_grams":
      return ATWATER_KCAL_PER_FAT_G;
    case "carb_target_grams":
      return ATWATER_KCAL_PER_CARB_G;
    default:
      return 0;
  }
}

function snapMacroField(m: MacroSliderField, grams: number): number {
  return snapToNutrientStep(grams, nutrientSpec(m));
}

function nutrientLocksAllOff(locks: NutrientLockState): boolean {
  return ALL_NUTRIENT_SLIDER_FIELDS.every((f) => !locks[f]);
}

/**
 * Assign remainderKcal across the given macro fields in proportion to each field’s previous
 * contribution to food energy (so the mix stays familiar when multiple macros move).
 */
function distributeKcalAcrossMacroFields(
  prev: Record<NutrientSliderField, number>,
  fields: readonly MacroSliderField[],
  remainderKcal: number,
): Partial<Record<MacroSliderField, number>> {
  const out: Partial<Record<MacroSliderField, number>> = {};
  if (fields.length === 0) return out;

  if (fields.length === 1) {
    const m = fields[0];
    const coef = macroKcalCoeff(m);
    const g = coef > 0 ? remainderKcal / coef : 0;
    out[m] = snapMacroField(m, g);
    return out;
  }

  let sumPrevK = 0;
  for (const m of fields) {
    sumPrevK += macroKcalCoeff(m) * prev[m];
  }

  if (sumPrevK <= 0) {
    const perFieldKcal = remainderKcal / fields.length;
    for (const m of fields) {
      const coef = macroKcalCoeff(m);
      out[m] = snapMacroField(m, coef > 0 ? perFieldKcal / coef : 0);
    }
    return out;
  }

  for (const m of fields) {
    const shareK = remainderKcal * ((macroKcalCoeff(m) * prev[m]) / sumPrevK);
    const coef = macroKcalCoeff(m);
    out[m] = snapMacroField(m, coef > 0 ? shareK / coef : 0);
  }
  return out;
}

function computeLinkedNutrientStateLegacy(
  prev: Record<NutrientSliderField, number>,
  field: NutrientSliderField,
  value: number,
): Record<NutrientSliderField, number> {
  if (field === "calorie_target") {
    const scaled = scaleMacrosToCalorieTarget(
      prev.protein_target_grams,
      prev.fat_target_grams,
      prev.carb_target_grams,
      value,
    );
    return {
      ...prev,
      protein_target_grams: scaled.p,
      fat_target_grams: scaled.f,
      carb_target_grams: scaled.c,
      calorie_target: snapCaloriesFromMacros(scaled.p, scaled.f, scaled.c),
    };
  }

  const p = field === "protein_target_grams" ? value : prev.protein_target_grams;
  const f = field === "fat_target_grams" ? value : prev.fat_target_grams;
  const c = field === "carb_target_grams" ? value : prev.carb_target_grams;

  return {
    ...prev,
    [field]: value,
    calorie_target: snapCaloriesFromMacros(p, f, c),
  };
}

function applyCalorieDragWithLocks(
  prev: Record<NutrientSliderField, number>,
  value: number,
  locks: NutrientLockState,
): Record<NutrientSliderField, number> {
  const calSpec = nutrientSpec("calorie_target");
  const targetCal = snapToNutrientStep(
    clampNutrientValue(value, calSpec.min, calSpec.max, value),
    calSpec,
  );

  const unlockedMacros = MACRO_SLIDER_FIELDS.filter((m) => !locks[m]);

  if (unlockedMacros.length === 3) {
    return computeLinkedNutrientStateLegacy(prev, "calorie_target", value);
  }

  const next: Record<NutrientSliderField, number> = { ...prev };
  for (const m of MACRO_SLIDER_FIELDS) {
    if (locks[m]) next[m] = prev[m];
  }

  let lockedK = 0;
  for (const m of MACRO_SLIDER_FIELDS) {
    if (locks[m]) lockedK += macroKcalCoeff(m) * prev[m];
  }

  const rem = targetCal - lockedK;

  if (unlockedMacros.length === 0) {
    next.calorie_target = snapCaloriesFromMacros(
      next.protein_target_grams,
      next.fat_target_grams,
      next.carb_target_grams,
    );
    return next;
  }

  const dist = distributeKcalAcrossMacroFields(prev, unlockedMacros, rem);
  for (const m of unlockedMacros) {
    const v = dist[m];
    if (v !== undefined) next[m] = v;
  }

  next.calorie_target = snapCaloriesFromMacros(
    next.protein_target_grams,
    next.fat_target_grams,
    next.carb_target_grams,
  );
  return next;
}

function applyMacroDragWithCalorieLock(
  prev: Record<NutrientSliderField, number>,
  field: MacroSliderField,
  value: number,
  locks: NutrientLockState,
): Record<NutrientSliderField, number> {
  const spec = nutrientSpec(field);
  const v = snapToNutrientStep(
    clampNutrientValue(value, spec.min, spec.max, value),
    spec,
  );
  const T = prev.calorie_target;

  const next: Record<NutrientSliderField, number> = { ...prev };
  for (const m of MACRO_SLIDER_FIELDS) {
    if (locks[m]) next[m] = prev[m];
  }
  next[field] = v;

  const adjustable = MACRO_SLIDER_FIELDS.filter((m) => !locks[m] && m !== field);

  let kFixed = 0;
  for (const m of MACRO_SLIDER_FIELDS) {
    if (locks[m] || m === field) kFixed += macroKcalCoeff(m) * next[m];
  }

  const R = T - kFixed;

  if (adjustable.length === 0) {
    const othersK = MACRO_SLIDER_FIELDS.filter((m) => m !== field).reduce(
      (s, m) => s + macroKcalCoeff(m) * next[m],
      0,
    );
    next[field] = snapMacroField(field, (T - othersK) / macroKcalCoeff(field));
  } else {
    const dist = distributeKcalAcrossMacroFields(prev, adjustable, R);
    for (const m of adjustable) {
      const nv = dist[m];
      if (nv !== undefined) next[m] = nv;
    }
  }

  next.calorie_target = snapCaloriesFromMacros(
    next.protein_target_grams,
    next.fat_target_grams,
    next.carb_target_grams,
  );
  return next;
}

/** One slider moved: keep calories = Atwater(macros), or scale macros when calories move. With locks, fixed targets stay put and other sliders absorb the change. */
export function computeLinkedNutrientState(
  prev: Record<NutrientSliderField, number>,
  field: NutrientSliderField,
  value: number,
  locks: NutrientLockState = DEFAULT_NUTRIENT_LOCKS,
): Record<NutrientSliderField, number> {
  if (nutrientLocksAllOff(locks)) {
    return computeLinkedNutrientStateLegacy(prev, field, value);
  }

  if (field === "calorie_target") {
    return applyCalorieDragWithLocks(prev, value, locks);
  }

  if (locks.calorie_target) {
    return applyMacroDragWithCalorieLock(prev, field, value, locks);
  }

  return computeLinkedNutrientStateLegacy(prev, field, value);
}

export function patchNutrientTargetsIfChanged(
  person: PersonRow,
  next: Record<NutrientSliderField, number>,
): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const spec of PERSON_NUTRIENT_SLIDERS) {
    const f = spec.field;
    const stored = parseStrNum(readNutrientSliderField(person, f));
    const nv = next[f];
    if (stored === null || Math.round(stored) !== Math.round(nv)) {
      patch[f] = String(nv);
    }
  }
  return patch;
}

export const PERSON_NUTRIENT_SLIDERS: readonly NutrientSliderSpec[] = [
  {
    label: "Calories",
    min: 1000,
    max: 3000,
    step: 10,
    field: "calorie_target",
    unit: "cal",
  },
  {
    label: "Protein",
    min: 50,
    max: 250,
    step: 1,
    field: "protein_target_grams",
    unit: "g",
  },
  {
    label: "Fat",
    min: 0,
    max: 200,
    step: 1,
    field: "fat_target_grams",
    unit: "g",
  },
  {
    label: "Carbs",
    min: 0,
    max: 500,
    step: 5,
    field: "carb_target_grams",
    unit: "g",
  },
] as const;

export function clampNutrientValue(
  value: number | null | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function parseStrNum(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function midpointMinMax(
  minRaw: string | null | undefined,
  maxRaw: string | null | undefined,
): number | null {
  const a = parseStrNum(minRaw);
  const b = parseStrNum(maxRaw);
  if (a !== null && b !== null) return (a + b) / 2;
  if (b !== null) return b;
  if (a !== null) return a;
  return null;
}

export function readNutrientSliderField(
  person: PersonRow,
  field: NutrientSliderField,
): string | null {
  switch (field) {
    case "calorie_target":
      return person.calorie_target;
    case "protein_target_grams":
      return person.protein_target_grams;
    case "fat_target_grams":
      return person.fat_target_grams;
    case "carb_target_grams":
      return person.carb_target_grams;
    default:
      return null;
  }
}

function initialMacroGrams(person: PersonRow): {
  p: number;
  f: number;
  c: number;
} {
  const pSpec = nutrientSpec("protein_target_grams");
  const fSpec = nutrientSpec("fat_target_grams");
  const cSpec = nutrientSpec("carb_target_grams");
  return {
    p: initialNutrientSliderValue(person, pSpec),
    f: initialNutrientSliderValue(person, fSpec),
    c: initialNutrientSliderValue(person, cSpec),
  };
}

/** Seed slider from stored target, sensible fallbacks (e.g. fat from min–max band), then midpoint. */
export function initialNutrientSliderValue(
  person: PersonRow,
  spec: NutrientSliderSpec,
): number {
  const band = readNutrientBand(person, spec.field);
  const fallback = Math.round((spec.min + spec.max) / 2);
  const finish = (v: number) => clampTargetToBand(v, band.min, band.max, spec);

  if (spec.field === "calorie_target") {
    const { p, f, c } = initialMacroGrams(person);
    return finish(snapCaloriesFromMacros(p, f, c));
  }

  const stored = parseStrNum(readNutrientSliderField(person, spec.field));
  if (stored !== null) {
    return finish(clampNutrientValue(stored, spec.min, spec.max, fallback));
  }

  switch (spec.field) {
    case "fat_target_grams": {
      const m = midpointMinMax(person.fat_min_grams, person.fat_max_grams);
      if (m !== null) return finish(clampNutrientValue(m, spec.min, spec.max, fallback));
      break;
    }
    case "carb_target_grams": {
      const m = midpointMinMax(person.carb_min_grams, person.carb_max_grams);
      if (m !== null) return finish(clampNutrientValue(m, spec.min, spec.max, fallback));
      break;
    }
    default:
      break;
  }

  return finish(fallback);
}
