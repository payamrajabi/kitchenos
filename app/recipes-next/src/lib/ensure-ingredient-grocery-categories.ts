import type { SupabaseClient } from "@supabase/supabase-js";
import type { IngredientRow } from "@/types/database";
import {
  inferGroceryCategoryFromName,
  isIngredientGroceryCategory,
} from "@/lib/ingredient-grocery-category";

/**
 * Persists inferred grocery categories for rows that are missing or invalid,
 * and returns the merged list for the current request (no extra round trip).
 */
export async function ensureIngredientGroceryCategoriesInDb(
  supabase: SupabaseClient,
  ingredients: IngredientRow[],
): Promise<IngredientRow[]> {
  const updates: { id: number; grocery_category: string }[] = [];
  for (const ing of ingredients) {
    if (isIngredientGroceryCategory(ing.grocery_category)) continue;
    updates.push({
      id: ing.id,
      grocery_category: inferGroceryCategoryFromName(ing.name ?? ""),
    });
  }
  if (!updates.length) return ingredients;

  await Promise.all(
    updates.map((u) =>
      supabase
        .from("ingredients")
        .update({ grocery_category: u.grocery_category })
        .eq("id", u.id),
    ),
  );

  const patch = new Map(updates.map((u) => [u.id, u.grocery_category]));
  return ingredients.map((ing) => {
    const g = patch.get(ing.id);
    if (g === undefined) return ing;
    return { ...ing, grocery_category: g };
  });
}
