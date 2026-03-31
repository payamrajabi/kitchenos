import type { RecipeRow } from "@/types/database";

export function primaryImageUrl(recipe: RecipeRow): string | null {
  if (recipe.image_url) return recipe.image_url;
  if (Array.isArray(recipe.image_urls) && recipe.image_urls.length) {
    const first = recipe.image_urls[0];
    return typeof first === "string" ? first : null;
  }
  return null;
}

/** Percent (0–100) for `background-position` / `object-position` Y in square cover frames. */
export function recipeImageFocusYPercent(recipe: RecipeRow): number {
  const n = recipe.image_focus_y;
  if (n == null || Number.isNaN(Number(n))) return 50;
  return Math.min(100, Math.max(0, Math.round(Number(n))));
}
