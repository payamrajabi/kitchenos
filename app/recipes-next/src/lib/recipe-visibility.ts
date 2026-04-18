import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Load the set of recipe ids the current user has saved to their library.
 * Returns an empty array (not an error) when the user has nothing saved or
 * when they are signed out.
 */
export async function loadLibraryRecipeIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<number[]> {
  const { data, error } = await supabase
    .from("user_recipe_library")
    .select("recipe_id")
    .eq("user_id", userId);

  if (error || !data) return [];

  const ids: number[] = [];
  for (const row of data) {
    const n = Number((row as { recipe_id: unknown }).recipe_id);
    if (Number.isFinite(n)) ids.push(n);
  }
  return ids;
}

/**
 * Build a Supabase `.or()` clause that matches recipes the user owns OR that
 * are in their library. Returns null when the user owns nothing and has
 * nothing saved (use this to short-circuit the query).
 */
export function ownedOrLibraryOrClause(
  userId: string,
  libraryIds: number[],
): string {
  if (!libraryIds.length) return `owner_id.eq.${userId}`;
  return `owner_id.eq.${userId},id.in.(${libraryIds.join(",")})`;
}
