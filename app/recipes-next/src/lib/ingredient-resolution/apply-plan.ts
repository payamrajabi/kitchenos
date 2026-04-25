/**
 * Apply a resolution plan — creates new ingredients, restructures hierarchy,
 * and ensures inventory rows exist.
 *
 * This module contains the Supabase writes. Everything upstream is pure logic.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  IngredientResolution,
  ResolutionPlan,
  AppliedIngredient,
  ApplyPlanResult,
} from "./types";
import { toTitleCaseAP } from "./normalize";
import { inferGroceryCategoryFromName } from "@/lib/ingredient-grocery-category";
import { buildBackboneInsertFieldsFromName } from "@/lib/ingredient-backbone-inference";
import {
  findBackboneMatchForName,
  ingredientFieldsFromCatalogue,
} from "@/lib/ingredient-backbone-catalogue";
import {
  defaultStorageLocationForNewInventoryRow,
} from "@/lib/inventory-display";
import type { IngredientRow } from "@/types/database";

type Supabase = SupabaseClient;

async function ensureInventoryRow(
  supabase: Supabase,
  ingredientId: number,
  category: string | null,
) {
  const { data: existing } = await supabase
    .from("inventory_items")
    .select("id")
    .eq("ingredient_id", ingredientId)
    .limit(1)
    .maybeSingle();

  if (existing?.id != null) return;

  const storage_location = defaultStorageLocationForNewInventoryRow(
    { id: ingredientId, category } as IngredientRow,
    "Pantry",
  );

  await supabase.from("inventory_items").insert({
    ingredient_id: ingredientId,
    storage_location,
    quantity: null,
    unit: null,
  });
}

async function createIngredientRow(
  supabase: Supabase,
  name: string,
  parentId: number | null,
  variantSortOrder: number,
  copyFieldsFrom: { category: string | null; grocery_category: string | null } | null,
): Promise<{ id: number; category: string | null } | null> {
  const displayName = toTitleCaseAP(name);

  // Pass B — catalogue lookup first. On a hit, the catalogue row supplies
  // backbone_id, variant, subcategory, units, storage, shelf life, density,
  // unit weight, and `packaged_common`/`is_composite` flags.
  const catalogueMatch = await findBackboneMatchForName(supabase, displayName);
  const catalogueFields = catalogueMatch
    ? ingredientFieldsFromCatalogue(catalogueMatch.entry)
    : null;

  // Fall back to the regex inference if the catalogue had nothing.
  const regexBackbone = catalogueFields
    ? null
    : buildBackboneInsertFieldsFromName(displayName);

  // Grocery category precedence: parent copy > catalogue > regex.
  const grocery_category =
    copyFieldsFrom?.grocery_category ??
    catalogueFields?.grocery_category ??
    inferGroceryCategoryFromName(displayName);

  const backboneDefaults = catalogueFields ?? regexBackbone ?? {};

  const { data, error } = await supabase
    .from("ingredients")
    .insert({
      name: displayName,
      parent_ingredient_id: parentId,
      variant_sort_order: variantSortOrder,
      category: copyFieldsFrom?.category ?? null,
      ...backboneDefaults,
      grocery_category,
    })
    .select("id, category")
    .single();

  if (error || !data) return null;
  return { id: Number(data.id), category: data.category as string | null };
}

async function nextVariantSortOrder(
  supabase: Supabase,
  parentId: number,
): Promise<number> {
  const { data } = await supabase
    .from("ingredients")
    .select("variant_sort_order")
    .eq("parent_ingredient_id", parentId)
    .order("variant_sort_order", { ascending: false })
    .limit(1);

  if (data?.length) {
    return (Number(data[0].variant_sort_order) || 0) + 1;
  }
  return 0;
}

async function applyUseExisting(
  _supabase: Supabase,
  resolution: Extract<IngredientResolution, { action: "use_existing" }>,
): Promise<AppliedIngredient> {
  return {
    recipeName: resolution.recipeName,
    ingredientId: resolution.existingIngredientId,
    ingredientName: resolution.existingIngredientName,
    wasCreated: false,
    action: "use_existing",
  };
}

async function applyCreateVariantUnderExisting(
  supabase: Supabase,
  resolution: Extract<IngredientResolution, { action: "create_variant_under_existing" }>,
): Promise<AppliedIngredient | null> {
  const { data: parent } = await supabase
    .from("ingredients")
    .select("id, category, grocery_category")
    .eq("id", resolution.parentIngredientId)
    .single();

  if (!parent) return null;

  const sortOrder = await nextVariantSortOrder(supabase, parent.id);
  const created = await createIngredientRow(
    supabase,
    resolution.cleanName,
    parent.id,
    sortOrder,
    {
      category: parent.category as string | null,
      grocery_category: (parent as Record<string, unknown>).grocery_category as string | null,
    },
  );
  if (!created) return null;

  await ensureInventoryRow(supabase, created.id, created.category);

  return {
    recipeName: resolution.recipeName,
    ingredientId: created.id,
    ingredientName: resolution.cleanName,
    wasCreated: true,
    action: "create_variant_under_existing",
  };
}

async function applyCreateSiblingVariant(
  supabase: Supabase,
  resolution: Extract<IngredientResolution, { action: "create_sibling_variant" }>,
): Promise<AppliedIngredient | null> {
  const { data: sibling } = await supabase
    .from("ingredients")
    .select("id, name, category, grocery_category")
    .eq("id", resolution.existingSiblingId)
    .single();

  if (!sibling) return null;

  // Step 1: Create the parent row
  const parentCreated = await createIngredientRow(
    supabase,
    resolution.parentName,
    null,
    0,
    {
      category: sibling.category as string | null,
      grocery_category: (sibling as Record<string, unknown>).grocery_category as string | null,
    },
  );
  if (!parentCreated) return null;

  await ensureInventoryRow(supabase, parentCreated.id, parentCreated.category);

  // Step 2: Reparent the existing sibling
  await supabase
    .from("ingredients")
    .update({
      parent_ingredient_id: parentCreated.id,
      variant_sort_order: 0,
    })
    .eq("id", sibling.id);

  // Step 3: Create the new variant as a second child
  const newVariant = await createIngredientRow(
    supabase,
    resolution.cleanName,
    parentCreated.id,
    1,
    {
      category: sibling.category as string | null,
      grocery_category: (sibling as Record<string, unknown>).grocery_category as string | null,
    },
  );
  if (!newVariant) return null;

  await ensureInventoryRow(supabase, newVariant.id, newVariant.category);

  return {
    recipeName: resolution.recipeName,
    ingredientId: newVariant.id,
    ingredientName: resolution.cleanName,
    wasCreated: true,
    action: "create_sibling_variant",
  };
}

async function applyCreateStandalone(
  supabase: Supabase,
  resolution: Extract<IngredientResolution, { action: "create_standalone" }>,
): Promise<AppliedIngredient | null> {
  const created = await createIngredientRow(
    supabase,
    resolution.cleanName,
    null,
    0,
    null,
  );
  if (!created) return null;

  await ensureInventoryRow(supabase, created.id, created.category);

  return {
    recipeName: resolution.recipeName,
    ingredientId: created.id,
    ingredientName: resolution.cleanName,
    wasCreated: true,
    action: "create_standalone",
  };
}

/**
 * Apply all resolutions in the plan. Returns the ingredient id for each
 * recipe ingredient name (either existing or freshly created).
 */
export async function applyResolutionPlan(
  supabase: Supabase,
  plan: ResolutionPlan,
): Promise<ApplyPlanResult> {
  const applied: AppliedIngredient[] = [];

  for (const resolution of plan.resolutions) {
    let result: AppliedIngredient | null = null;

    switch (resolution.action) {
      case "use_existing":
        result = await applyUseExisting(supabase, resolution);
        break;
      case "create_variant_under_existing":
        result = await applyCreateVariantUnderExisting(supabase, resolution);
        break;
      case "create_sibling_variant":
        result = await applyCreateSiblingVariant(supabase, resolution);
        break;
      case "create_standalone":
        result = await applyCreateStandalone(supabase, resolution);
        break;
    }

    if (!result) {
      return {
        ok: false,
        error: `Failed to apply resolution for "${resolution.recipeName}".`,
      };
    }

    applied.push(result);
  }

  return { ok: true, applied };
}
