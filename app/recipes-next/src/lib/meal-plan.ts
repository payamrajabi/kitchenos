export const planSlotOrder = [
  {
    key: "breakfast",
    label: "Breakfast",
    dbMealSlot: "breakfast",
    sortBase: 0,
  },
  {
    key: "snack_am",
    label: "Snack",
    dbMealSlot: "snack",
    sortBase: 100,
  },
  {
    key: "lunch",
    label: "Lunch",
    dbMealSlot: "lunch",
    sortBase: 200,
  },
  {
    key: "snack_pm",
    label: "Snack",
    dbMealSlot: "snack",
    sortBase: 300,
  },
  {
    key: "dinner",
    label: "Dinner",
    dbMealSlot: "dinner",
    sortBase: 400,
  },
  {
    key: "dessert",
    label: "Dessert",
    dbMealSlot: "other",
    sortBase: 500,
  },
] as const;

export type PlanSlotKey = (typeof planSlotOrder)[number]["key"];
export type StoredMealSlot = "breakfast" | "lunch" | "dinner" | "snack" | "other";

const planSlotMap = new Map(planSlotOrder.map((slot) => [slot.key, slot]));

export function getPlanSlot(key: PlanSlotKey) {
  return planSlotMap.get(key)!;
}

export function classifyStoredMealEntry(
  mealSlot: string | null | undefined,
  sortOrder: number | null | undefined,
): PlanSlotKey | null {
  const slot = String(mealSlot ?? "").toLowerCase();

  if (slot === "breakfast") return "breakfast";
  if (slot === "lunch") return "lunch";
  if (slot === "dinner") return "dinner";
  if (slot === "other") return "dessert";

  if (slot !== "snack") return null;

  if (typeof sortOrder === "number") {
    if (sortOrder >= 300) return "snack_pm";
    if (sortOrder >= 100) return "snack_am";
  }

  return null;
}

export function normalizeStoredMealSlot(rawSlot: string | null | undefined): StoredMealSlot {
  const slot = String(rawSlot ?? "").toLowerCase();

  if (slot === "breakfast" || slot === "lunch" || slot === "dinner" || slot === "snack") {
    return slot;
  }

  if (slot === "dessert") return "other";
  return "other";
}
