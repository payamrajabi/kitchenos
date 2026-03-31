import type { IngredientRow, InventoryItemRow } from "@/types/database";
import {
  getInventoryGroup,
  type InventoryTab,
  ingredientMatchesInventoryTab,
} from "@/lib/inventory-filters";

export function storageLocationMatchesInventoryTab(
  storageLocation: string,
  tab: InventoryTab,
): boolean {
  if (tab === "Pantry") {
    return storageLocation === "Shallow Pantry" || storageLocation === "Deep Pantry";
  }
  return storageLocation === tab;
}

function normalizeIngredientStorageCategory(ingredient: IngredientRow): string {
  return (ingredient.category ?? "").trim().toLowerCase();
}

export function defaultStorageLocationForNewInventoryRow(
  ingredient: IngredientRow,
  tab: InventoryTab,
): string {
  if (tab === "Fridge") return "Fridge";
  if (tab === "Freezer") return "Freezer";
  if (tab === "Pantry") {
    const cat = normalizeIngredientStorageCategory(ingredient);
    if (cat === "deep pantry" || cat.startsWith("deep pantry")) {
      return "Deep Pantry";
    }
    return "Shallow Pantry";
  }
  return "Other";
}

export function getInventoryRowForIngredientOnTab(
  inventory: InventoryItemRow[],
  ingredientId: number,
  tab: InventoryTab,
): InventoryItemRow | null {
  const idStr = String(ingredientId);
  const rows = inventory.filter(
    (r) =>
      String(r.ingredient_id) === idStr &&
      storageLocationMatchesInventoryTab(r.storage_location, tab),
  );
  if (!rows.length) return null;
  if (tab === "Pantry") {
    return rows.find((r) => r.storage_location === "Shallow Pantry") ?? rows[0];
  }
  return rows[0];
}

export function normalizeInventoryId(id: unknown): number | "" {
  if (id === null || id === undefined || id === "") return "";
  const n = Number(id);
  return Number.isFinite(n) ? n : "";
}

function parseLeadingNumber(text: unknown): number | null {
  if (text === null || text === undefined || text === "") return null;
  const m = String(text).trim().match(/^~?\s*([\d.]+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isNaN(n) ? null : n;
}

export function formatInventoryQtyDisplay(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  if (Number.isInteger(n)) return String(n);
  const rounded = Math.round(n * 10000) / 10000;
  const s = String(rounded);
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "");
}

export function getInventoryStockValues(
  ingredient: IngredientRow,
  invRow: InventoryItemRow | null,
  tab: InventoryTab,
) {
  const q =
    invRow?.quantity !== null && invRow?.quantity !== undefined
      ? Number(invRow.quantity)
      : parseLeadingNumber(ingredient.current_stock);
  const mn =
    invRow?.min_quantity !== null && invRow?.min_quantity !== undefined
      ? Number(invRow.min_quantity)
      : parseLeadingNumber(ingredient.minimum_stock);
  const mx =
    invRow?.max_quantity !== null && invRow?.max_quantity !== undefined
      ? Number(invRow.max_quantity)
      : parseLeadingNumber(ingredient.maximum_stock);
  const unit = invRow?.unit != null && invRow.unit !== "" ? String(invRow.unit) : "";
  const recipeUnit = invRow?.recipe_unit != null && invRow.recipe_unit !== "" ? String(invRow.recipe_unit) : "";
  const storageLocation =
    invRow?.storage_location || defaultStorageLocationForNewInventoryRow(ingredient, tab);
  return {
    quantity: Number.isNaN(q) ? null : q,
    min: Number.isNaN(mn) ? null : mn,
    max: Number.isNaN(mx) ? null : mx,
    unit,
    recipeUnit,
    storageLocation,
    inventoryId: normalizeInventoryId(invRow?.id),
  };
}

export function filterIngredientsForInventoryTab(
  ingredients: IngredientRow[],
  inventory: InventoryItemRow[],
  tab: InventoryTab,
): IngredientRow[] {
  return ingredients.filter((ing) =>
    ingredientMatchesInventoryTab(ing, inventory, tab),
  );
}

export function sortIngredientsForInventoryDisplay(
  ingredients: IngredientRow[],
): IngredientRow[] {
  return [...ingredients].sort((a, b) => {
    const categoryA = getInventoryGroup(a).toLowerCase();
    const categoryB = getInventoryGroup(b).toLowerCase();
    if (categoryA !== categoryB) return categoryA.localeCompare(categoryB);
    return (a.name || "").localeCompare(b.name || "");
  });
}

export function getInventoryRowForIngredient(
  inventory: InventoryItemRow[],
  ingredientId: number,
): InventoryItemRow | null {
  const idStr = String(ingredientId);
  const rows = inventory.filter((r) => String(r.ingredient_id) === idStr);
  if (!rows.length) return null;
  const withQty = rows.find((r) => r.quantity !== null && r.quantity !== undefined);
  return withQty ?? rows[0];
}

export type UnifiedInventoryStock = {
  quantity: number | null;
  min: number | null;
  max: number | null;
  unit: string;
  recipeUnit: string;
  storageLocation: string;
  inventoryId: number | "";
};

export function getInventoryStockValuesUnified(
  ingredient: IngredientRow,
  invRow: InventoryItemRow | null,
): UnifiedInventoryStock {
  const q =
    invRow?.quantity !== null && invRow?.quantity !== undefined
      ? Number(invRow.quantity)
      : parseLeadingNumber(ingredient.current_stock);
  const mn =
    invRow?.min_quantity !== null && invRow?.min_quantity !== undefined
      ? Number(invRow.min_quantity)
      : parseLeadingNumber(ingredient.minimum_stock);
  const mx =
    invRow?.max_quantity !== null && invRow?.max_quantity !== undefined
      ? Number(invRow.max_quantity)
      : parseLeadingNumber(ingredient.maximum_stock);
  const unit = invRow?.unit != null && invRow.unit !== "" ? String(invRow.unit) : "";
  const recipeUnit = invRow?.recipe_unit != null && invRow.recipe_unit !== "" ? String(invRow.recipe_unit) : "";
  const storageLocation = invRow?.storage_location || "";
  return {
    quantity: Number.isNaN(q) ? null : q,
    min: Number.isNaN(mn) ? null : mn,
    max: Number.isNaN(mx) ? null : mx,
    unit,
    recipeUnit,
    storageLocation,
    inventoryId: normalizeInventoryId(invRow?.id),
  };
}

const EQUIPMENT_GROUP_ORDER = [
  "Knives and cutting",
  "Cookware",
  "Bakeware and baking tools",
  "Small appliances",
  "Food prep tools",
  "Measuring",
  "Storage",
  "Cleaning",
  "Other",
];

export function getEquipmentGroup(item: { category?: string | null }): string {
  const c = (item.category ?? "").trim();
  return c || "Other";
}

export function getEquipmentGroupOrder(group: string): number {
  const index = EQUIPMENT_GROUP_ORDER.indexOf(group);
  return index === -1 ? EQUIPMENT_GROUP_ORDER.length : index;
}

export function sortEquipmentForDisplay<
  T extends { category?: string | null; name?: string | null },
>(equipment: T[]): T[] {
  return [...equipment].sort((a, b) => {
    const groupA = getEquipmentGroup(a);
    const groupB = getEquipmentGroup(b);
    const orderA = getEquipmentGroupOrder(groupA);
    const orderB = getEquipmentGroupOrder(groupB);
    if (orderA !== orderB) return orderA - orderB;
    if (groupA !== groupB) return groupA.localeCompare(groupB);
    return (a.name || "").localeCompare(b.name || "");
  });
}
