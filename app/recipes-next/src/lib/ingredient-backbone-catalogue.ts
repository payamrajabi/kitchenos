/**
 * Ingredient backbone catalogue — lookup + row helpers.
 *
 * Separate from `ingredient-backbone-catalogue-seed.ts` so the lookup path
 * doesn't have to import the whole seed array.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeForMatch } from "@/lib/ingredient-resolution/normalize";
import type {
  IngredientStorageHint,
  IngredientRow,
} from "@/types/database";
import type { IngredientTaxonomySubcategory } from "@/lib/ingredient-backbone-inference";
import type { IngredientGroceryCategory } from "@/lib/ingredient-grocery-category";

/**
 * Row shape as returned by Supabase. Intentionally kept close to the DB
 * schema so it can be read/written without extra mapping.
 */
export type BackboneCatalogueRow = {
  backbone_id: string;
  canonical_name: string;
  variant: string | null;
  parent_backbone_id: string | null;
  match_key: string;
  taxonomy_subcategory: IngredientTaxonomySubcategory | null;
  grocery_category: IngredientGroceryCategory | null;
  default_units: string[] | null;
  storage_hints: IngredientStorageHint[] | null;
  shelf_life_counter_days: number | null;
  shelf_life_fridge_days: number | null;
  shelf_life_freezer_days: number | null;
  packaged_common: boolean;
  is_composite: boolean;
  density_g_per_ml: number | null;
  canonical_unit_weight_g: number | null;
  aliases: string[];
  notes: string | null;
};

export type BackboneMatch = {
  entry: BackboneCatalogueRow;
  matchType: "canonical" | "alias";
};

/**
 * Find a backbone catalogue entry that matches the given ingredient name.
 *
 * Strategy (deterministic, no LLM):
 *   1. Normalise the name with the same `normalizeForMatch()` used by the
 *      rest of the resolution pipeline (case, plurals, hyphens, package
 *      sizes, word order).
 *   2. Exact `match_key` hit → canonical match.
 *   3. Alias array contains the normalised key → alias match.
 *   4. Otherwise no match (null).
 *
 * The catalogue is small and well-indexed; these are two O(log n) index
 * lookups against a table of ~100 rows, safe to call on the insert hot path.
 */
export async function findBackboneMatchForName(
  supabase: SupabaseClient,
  name: string,
): Promise<BackboneMatch | null> {
  const key = normalizeForMatch(name);
  if (!key) return null;

  const canonical = await supabase
    .from("ingredient_backbone_catalogue")
    .select("*")
    .eq("match_key", key)
    .maybeSingle();

  if (canonical.data) {
    return {
      entry: canonical.data as BackboneCatalogueRow,
      matchType: "canonical",
    };
  }

  const alias = await supabase
    .from("ingredient_backbone_catalogue")
    .select("*")
    .contains("aliases", [key])
    .limit(1)
    .maybeSingle();

  if (alias.data) {
    return {
      entry: alias.data as BackboneCatalogueRow,
      matchType: "alias",
    };
  }

  return null;
}

/**
 * Batched version of {@link findBackboneMatchForName} for the resolution
 * pipeline. Takes a list of recipe ingredient names and returns a Map from
 * the original name to its catalogue entry for everything that matched.
 *
 * Does at most two DB round-trips regardless of input size:
 *   1. One `in('match_key', keys)` query for canonical hits.
 *   2. One `overlaps('aliases', remainingKeys)` query for alias hits.
 *
 * Names that don't hit the catalogue simply don't appear in the returned
 * map — the caller decides what to do with them.
 */
export async function findBackboneMatchesForNames(
  supabase: SupabaseClient,
  names: string[],
): Promise<Map<string, BackboneMatch>> {
  const out = new Map<string, BackboneMatch>();
  if (names.length === 0) return out;

  // Map from the normalised key back to every original name that produced
  // it (two recipe names can collapse to the same key).
  const keyToNames = new Map<string, string[]>();
  for (const name of names) {
    const key = normalizeForMatch(name);
    if (!key) continue;
    const bucket = keyToNames.get(key);
    if (bucket) bucket.push(name);
    else keyToNames.set(key, [name]);
  }
  if (keyToNames.size === 0) return out;

  const allKeys = Array.from(keyToNames.keys());

  const canonical = await supabase
    .from("ingredient_backbone_catalogue")
    .select("*")
    .in("match_key", allKeys);

  if (canonical.data) {
    for (const row of canonical.data as BackboneCatalogueRow[]) {
      const originals = keyToNames.get(row.match_key);
      if (!originals) continue;
      for (const original of originals) {
        out.set(original, { entry: row, matchType: "canonical" });
      }
    }
  }

  const remainingKeys = allKeys.filter(
    (key) => !Array.from(keyToNames.get(key) ?? []).every((n) => out.has(n)),
  );
  if (remainingKeys.length === 0) return out;

  const alias = await supabase
    .from("ingredient_backbone_catalogue")
    .select("*")
    .overlaps("aliases", remainingKeys);

  if (alias.data) {
    for (const row of alias.data as BackboneCatalogueRow[]) {
      for (const aliasKey of row.aliases ?? []) {
        const originals = keyToNames.get(aliasKey);
        if (!originals) continue;
        for (const original of originals) {
          if (!out.has(original)) {
            out.set(original, { entry: row, matchType: "alias" });
          }
        }
      }
    }
  }

  return out;
}

/**
 * The subset of `ingredients` columns we want to set from a catalogue hit.
 * Shaped for direct `{ ...ingredientFieldsFromCatalogue(row) }` spread into
 * a Supabase insert/update payload.
 *
 * Booleans (`packaged_common`, `is_composite`) are always included because
 * a `false` is meaningful in the catalogue (authoritatively "not packaged"
 * or "not composite").
 */
export type IngredientInsertFieldsFromCatalogue = {
  backbone_id: string;
  variant?: string;
  taxonomy_subcategory?: IngredientTaxonomySubcategory;
  grocery_category?: IngredientGroceryCategory;
  default_units?: string[];
  storage_hints?: IngredientStorageHint[];
  shelf_life_counter_days?: number;
  shelf_life_fridge_days?: number;
  shelf_life_freezer_days?: number;
  packaged_common: boolean;
  is_composite: boolean;
  density_g_per_ml?: number;
  canonical_unit_weight_g?: number;
};

export function ingredientFieldsFromCatalogue(
  entry: BackboneCatalogueRow,
): IngredientInsertFieldsFromCatalogue {
  const out: IngredientInsertFieldsFromCatalogue = {
    backbone_id: entry.backbone_id,
    packaged_common: entry.packaged_common,
    is_composite: entry.is_composite,
  };
  if (entry.variant) out.variant = entry.variant;
  if (entry.taxonomy_subcategory) out.taxonomy_subcategory = entry.taxonomy_subcategory;
  if (entry.grocery_category) out.grocery_category = entry.grocery_category;
  if (entry.default_units && entry.default_units.length > 0) {
    out.default_units = entry.default_units;
  }
  if (entry.storage_hints && entry.storage_hints.length > 0) {
    out.storage_hints = entry.storage_hints;
  }
  if (entry.shelf_life_counter_days != null) {
    out.shelf_life_counter_days = entry.shelf_life_counter_days;
  }
  if (entry.shelf_life_fridge_days != null) {
    out.shelf_life_fridge_days = entry.shelf_life_fridge_days;
  }
  if (entry.shelf_life_freezer_days != null) {
    out.shelf_life_freezer_days = entry.shelf_life_freezer_days;
  }
  if (entry.density_g_per_ml != null) {
    out.density_g_per_ml = entry.density_g_per_ml;
  }
  if (entry.canonical_unit_weight_g != null) {
    out.canonical_unit_weight_g = entry.canonical_unit_weight_g;
  }
  return out;
}

/**
 * Compute the subset of catalogue fields that would actually change an
 * existing ingredient row. Used by the backfill "apply catalogue to existing"
 * action: never overwrites non-null user values, only fills gaps.
 *
 * Booleans are flipped false → true only; a `true` on the existing row is
 * preserved even if the catalogue says `false`.
 */
export function patchExistingFromCatalogue(
  row: Pick<
    IngredientRow,
    | "backbone_id"
    | "variant"
    | "taxonomy_subcategory"
    | "grocery_category"
    | "default_units"
    | "storage_hints"
    | "shelf_life_counter_days"
    | "shelf_life_fridge_days"
    | "shelf_life_freezer_days"
    | "packaged_common"
    | "is_composite"
    | "density_g_per_ml"
    | "canonical_unit_weight_g"
  >,
  entry: BackboneCatalogueRow,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (row.backbone_id == null) patch.backbone_id = entry.backbone_id;
  if (row.variant == null && entry.variant) patch.variant = entry.variant;
  if (row.taxonomy_subcategory == null && entry.taxonomy_subcategory) {
    patch.taxonomy_subcategory = entry.taxonomy_subcategory;
  }
  if (row.grocery_category == null && entry.grocery_category) {
    patch.grocery_category = entry.grocery_category;
  }
  if (
    (row.default_units == null || row.default_units.length === 0) &&
    entry.default_units &&
    entry.default_units.length > 0
  ) {
    patch.default_units = entry.default_units;
  }
  if (
    (row.storage_hints == null || row.storage_hints.length === 0) &&
    entry.storage_hints &&
    entry.storage_hints.length > 0
  ) {
    patch.storage_hints = entry.storage_hints;
  }
  if (row.shelf_life_counter_days == null && entry.shelf_life_counter_days != null) {
    patch.shelf_life_counter_days = entry.shelf_life_counter_days;
  }
  if (row.shelf_life_fridge_days == null && entry.shelf_life_fridge_days != null) {
    patch.shelf_life_fridge_days = entry.shelf_life_fridge_days;
  }
  if (row.shelf_life_freezer_days == null && entry.shelf_life_freezer_days != null) {
    patch.shelf_life_freezer_days = entry.shelf_life_freezer_days;
  }
  if (!row.packaged_common && entry.packaged_common) {
    patch.packaged_common = true;
  }
  if (!row.is_composite && entry.is_composite) {
    patch.is_composite = true;
  }
  if (row.density_g_per_ml == null && entry.density_g_per_ml != null) {
    patch.density_g_per_ml = entry.density_g_per_ml;
  }
  if (
    row.canonical_unit_weight_g == null &&
    entry.canonical_unit_weight_g != null
  ) {
    patch.canonical_unit_weight_g = entry.canonical_unit_weight_g;
  }
  return patch;
}
