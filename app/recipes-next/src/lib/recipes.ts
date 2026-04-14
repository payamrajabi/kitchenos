import type { RecipeRow } from "@/types/database";

/** Supabase/PostgREST often returns integer PKs as strings; Map keys must match. */
export function coerceNumericId(id: unknown): number | null {
  if (id == null) return null;
  const n = typeof id === "bigint" ? Number(id) : Number(id);
  return Number.isFinite(n) ? n : null;
}

function imageUrlStringsFromUnknown(raw: unknown): string[] {
  if (raw == null) return [];
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return [];
    if (t.startsWith("[") || t.startsWith("{")) {
      try {
        return imageUrlStringsFromUnknown(JSON.parse(t));
      } catch {
        return [t];
      }
    }
    return [t];
  }
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.trim() !== "") out.push(item.trim());
  }
  return out;
}

export function primaryImageUrl(recipe: RecipeRow): string | null {
  const direct = recipe.image_url?.trim();
  if (direct) return direct;
  const fromList = imageUrlStringsFromUnknown(recipe.image_urls);
  return fromList[0] ?? null;
}

/** Percent (0–100) for `background-position` / `object-position` Y in square cover frames. */
export function recipeImageFocusYPercent(recipe: RecipeRow): number {
  const n = recipe.image_focus_y;
  if (n == null || Number.isNaN(Number(n))) return 50;
  return Math.min(100, Math.max(0, Math.round(Number(n))));
}
