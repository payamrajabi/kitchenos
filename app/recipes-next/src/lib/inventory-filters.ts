import type { IngredientRow, InventoryItemRow } from "@/types/database";

export type InventoryTab = "Fridge" | "Freezer" | "Pantry" | "Equipment";

export function getInventoryGroup(ingredient: IngredientRow): InventoryTab {
  const category = (ingredient.category ?? "").toLowerCase();
  if (category === "fridge") return "Fridge";
  if (category === "freezer") return "Freezer";
  if (category === "shallow pantry" || category === "deep pantry") return "Pantry";
  if (category.startsWith("freezer")) return "Freezer";
  if (category.startsWith("fridge")) return "Fridge";
  if (category.includes("cleaning") || category.includes("laundry")) return "Pantry";
  if (category.startsWith("pantry")) return "Pantry";
  return "Pantry";
}

function locationsForIngredient(
  inventory: InventoryItemRow[],
  ingredientId: number,
): Set<string> {
  const locations = new Set<string>();
  for (const row of inventory) {
    if (String(row.ingredient_id) === String(ingredientId)) {
      locations.add(row.storage_location);
    }
  }
  return locations;
}

export function ingredientMatchesInventoryTab(
  ingredient: IngredientRow,
  inventory: InventoryItemRow[],
  tab: InventoryTab,
): boolean {
  const fromInv = locationsForIngredient(inventory, ingredient.id);
  if (fromInv.size > 0) {
    for (const loc of fromInv) {
      if (tab === "Pantry") {
        if (loc === "Shallow Pantry" || loc === "Deep Pantry") return true;
      } else if (loc === tab) {
        return true;
      }
    }
    return false;
  }
  return getInventoryGroup(ingredient) === tab;
}
