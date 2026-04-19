import type {
  IngredientStorageHint,
} from "@/types/database";
import type {
  IngredientTaxonomySubcategory,
} from "@/lib/ingredient-backbone-inference";
import type {
  IngredientGroceryCategory,
} from "@/lib/ingredient-grocery-category";

/**
 * A single entry in the ingredient backbone catalogue. Authoritative
 * reference data for deterministic autofill before any LLM call.
 *
 * Seed entries are written in TypeScript and upserted into the
 * `ingredient_backbone_catalogue` table by the seed server action.
 */
export type BackboneCatalogueEntry = {
  /**
   * Stable slug: dot-delimited path in the taxonomy tree.
   * Example: "produce.vegetables.alliums.onion.yellow".
   * This becomes `ingredients.backbone_id` for matched rows and is the PK
   * in `ingredient_backbone_catalogue`.
   */
  backbone_id: string;
  /** Human display name, AP title case (e.g. "Yellow Onion"). */
  canonical_name: string;
  /** Optional form/state qualifier (e.g. "yellow", "canned diced"). */
  variant?: string;
  /** Optional parent catalogue entry (e.g. "produce.vegetables.alliums.onion"). */
  parent_backbone_id?: string;

  taxonomy_subcategory?: IngredientTaxonomySubcategory;
  grocery_category?: IngredientGroceryCategory;
  default_units?: string[];
  storage_hints?: IngredientStorageHint[];
  shelf_life_counter_days?: number;
  shelf_life_fridge_days?: number;
  shelf_life_freezer_days?: number;
  packaged_common?: boolean;
  is_composite?: boolean;
  /** Apparent density in grams per millilitre (oils, milks, syrups, etc.). */
  density_g_per_ml?: number;
  /** Typical gram weight of one "each" piece (onion, egg, lemon, tomato). */
  canonical_unit_weight_g?: number;

  /**
   * Synonyms, regional names, and common misspellings. Applied verbatim
   * by the seed action (not auto-normalised) so seed authors can double-check
   * what will match; the seed action runs each one through
   * `normalizeForMatch()` before writing to the DB.
   */
  aliases?: string[];

  /** Free-form editorial notes (provenance, caveats). */
  notes?: string;
};
