/**
 * Shared, non-server constants and types for ingredient organize/merge UIs.
 * Lives outside the "use server" actions file because Next.js 16 forbids
 * non-async exports from a server-actions module.
 */

export type MergeFieldKey =
  | "name"
  | "variant"
  | "category"
  | "grocery_category"
  | "taxonomy_subcategory"
  | "food_type"
  | "brand_or_manufacturer"
  | "barcode"
  | "preferred_vendor"
  | "notes"
  | "ingredients_text"
  | "kcal"
  | "fat_g"
  | "protein_g"
  | "carbs_g"
  | "nutrition_basis"
  | "canonical_unit_weight_g"
  | "nutrition_source_name"
  | "nutrition_source_record_id"
  | "nutrition_source_url"
  | "nutrition_confidence"
  | "nutrition_notes"
  | "nutrition_serving_size_g"
  | "density_g_per_ml"
  | "is_composite"
  | "packaged_common";

export const MERGE_FIELDS: MergeFieldKey[] = [
  "name",
  "variant",
  "category",
  "grocery_category",
  "taxonomy_subcategory",
  "food_type",
  "brand_or_manufacturer",
  "barcode",
  "preferred_vendor",
  "notes",
  "ingredients_text",
  "kcal",
  "fat_g",
  "protein_g",
  "carbs_g",
  "nutrition_basis",
  "canonical_unit_weight_g",
  "nutrition_source_name",
  "nutrition_source_record_id",
  "nutrition_source_url",
  "nutrition_confidence",
  "nutrition_notes",
  "nutrition_serving_size_g",
  "density_g_per_ml",
];

export type MergeFieldChoice = "this" | "other";
