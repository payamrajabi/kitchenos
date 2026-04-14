/** Rough day schedule: snacks sit midway between adjacent main meals. */
export const planSlotOrder = [
  {
    key: "breakfast",
    label: "Breakfast",
    timeLabel: "8:00a",
    dbMealSlot: "breakfast",
    sortBase: 0,
  },
  {
    key: "snack_am",
    label: "Snack",
    timeLabel: "10:00a",
    dbMealSlot: "snack",
    sortBase: 100,
  },
  {
    key: "lunch",
    label: "Lunch",
    timeLabel: "12:00p",
    dbMealSlot: "lunch",
    sortBase: 200,
  },
  {
    key: "snack_pm",
    label: "Snack",
    timeLabel: "2:30p",
    dbMealSlot: "snack",
    sortBase: 300,
  },
  {
    key: "dinner",
    label: "Dinner",
    timeLabel: "5:00p",
    dbMealSlot: "dinner",
    sortBase: 400,
  },
  {
    key: "dessert",
    label: "Dessert",
    timeLabel: "8:00p",
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

export function getPlanSlotTimeLabel(key: PlanSlotKey): string {
  return getPlanSlot(key).timeLabel;
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
