import type { PlanSlotKey } from "@/lib/meal-plan";

/** Canonical order: tabs on the recipes list match this sequence. */
export const RECIPE_MEAL_TYPES = [
  "Breakfast",
  "Snack",
  "Lunch",
  "Dinner",
  "Dessert",
  "Drink",
  "Component",
] as const;

export type RecipeMealType = (typeof RECIPE_MEAL_TYPES)[number];

const ALLOWED = new Set<string>(RECIPE_MEAL_TYPES);

/** Maps legacy stored labels to current ones; unmapped legacy values are dropped. */
function canonicalizeStoredTag(raw: string): string | null {
  if (raw === "School snack") return "Snack";
  if (raw === "Brunch") return null;
  if (raw === "Beverage") return "Drink";
  if (ALLOWED.has(raw)) return raw;
  return null;
}

export function normalizeMealTypesFromDb(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const picked = new Set<string>();
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const t = canonicalizeStoredTag(x.trim());
    if (t) picked.add(t);
  }
  return RECIPE_MEAL_TYPES.filter((t) => picked.has(t));
}

/** Returns null when nothing selected (stored as SQL NULL). */
export function normalizeMealTypesForStorage(raw: unknown): string[] | null {
  if (raw === null || raw === undefined) return null;
  if (!Array.isArray(raw)) return null;
  const next = normalizeMealTypesFromDb(raw);
  return next.length ? next : null;
}

export function mealTypesEqual(a: unknown, b: unknown): boolean {
  const na = normalizeMealTypesFromDb(a);
  const nb = normalizeMealTypesFromDb(b);
  if (na.length !== nb.length) return false;
  return na.every((v, i) => v === nb[i]);
}

/** Recipe tags that count as a “match” when picking for a plan row. */
export function planSlotPreferredRecipeTags(slot: PlanSlotKey): readonly string[] {
  switch (slot) {
    case "breakfast":
      return ["Breakfast"];
    case "snack_am":
    case "snack_pm":
      return ["Snack"];
    case "lunch":
      return ["Lunch"];
    case "dinner":
      return ["Dinner"];
    case "dessert":
      return ["Dessert"];
    default: {
      const _x: never = slot;
      return _x;
    }
  }
}
