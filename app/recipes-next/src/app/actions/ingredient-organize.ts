"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { IngredientRow } from "@/types/database";
import { MERGE_FIELDS } from "@/lib/ingredient-organize-shared";
import type {
  MergeFieldChoice,
  MergeFieldKey,
} from "@/lib/ingredient-organize-shared";

/**
 * Make `ingredientId` a variant (child) of `parentId` by setting its
 * `parent_ingredient_id`. Keeps all existing data attached to the moved
 * ingredient — inventory rows, nutrition, products, recipes, etc.
 */
export async function moveIngredientAsVariantOfAction(
  ingredientId: number,
  parentId: number,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  if (!Number.isFinite(ingredientId) || !Number.isFinite(parentId)) {
    return { ok: false as const, error: "Invalid ingredient." };
  }
  if (ingredientId === parentId) {
    return { ok: false as const, error: "Cannot move an ingredient onto itself." };
  }

  // Block moving a parent under one of its own descendants (would create a
  // cycle). Walk up from `parentId` and bail if we hit `ingredientId`.
  let cursor: number | null = parentId;
  const seen = new Set<number>();
  while (cursor != null) {
    if (cursor === ingredientId) {
      return {
        ok: false as const,
        error: "Cannot move an ingredient under one of its own variants.",
      };
    }
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const { data: row } = (await supabase
      .from("ingredients")
      .select("parent_ingredient_id")
      .eq("id", cursor)
      .maybeSingle()) as { data: { parent_ingredient_id: number | null } | null };
    cursor = row?.parent_ingredient_id ?? null;
  }

  // Append at the end of the parent's existing variants.
  const { data: siblings } = await supabase
    .from("ingredients")
    .select("variant_sort_order")
    .eq("parent_ingredient_id", parentId)
    .order("variant_sort_order", { ascending: false })
    .limit(1);
  const nextSort =
    siblings && siblings.length > 0
      ? (siblings[0].variant_sort_order ?? 0) + 1
      : 0;

  const { error } = await supabase
    .from("ingredients")
    .update({
      parent_ingredient_id: parentId,
      variant_sort_order: nextSort,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ingredientId);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/inventory");
  revalidatePath("/recipes");
  revalidatePath("/shop");
  return { ok: true as const };
}

/**
 * Merge `sourceId` into `targetId`:
 *  - For each field in `fieldChoices`, copy `sourceId`'s value onto `targetId`
 *    when the user picked "this" === source, or leave target's value when
 *    they picked "other" === target.
 *  - Re-point all child rows (recipe_ingredients, inventory_items, products,
 *    portions, nutrients, aliases, shopping_items, child variants) from
 *    source → target. Conflicts are resolved by deleting source's row.
 *  - Delete the source ingredient.
 *
 * `fieldChoices.name`'s value `"this"` means the source's name wins. We swap
 * names atomically by renaming target to a tombstone first, then to the new
 * value, so the UNIQUE(name) constraint never trips.
 */
export async function mergeIngredientsAction(
  sourceId: number,
  targetId: number,
  fieldChoices: Partial<Record<MergeFieldKey, MergeFieldChoice>>,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  if (!Number.isFinite(sourceId) || !Number.isFinite(targetId)) {
    return { ok: false as const, error: "Invalid ingredient." };
  }
  if (sourceId === targetId) {
    return { ok: false as const, error: "Cannot merge an ingredient with itself." };
  }

  const { data: rows, error: rowsErr } = await supabase
    .from("ingredients")
    .select("*")
    .in("id", [sourceId, targetId]);
  if (rowsErr) return { ok: false as const, error: rowsErr.message };

  const source = (rows ?? []).find((r) => r.id === sourceId) as
    | IngredientRow
    | undefined;
  const target = (rows ?? []).find((r) => r.id === targetId) as
    | IngredientRow
    | undefined;
  if (!source || !target) {
    return { ok: false as const, error: "Ingredient not found." };
  }

  // ---------- 1. Build the field updates that will land on `target`. ----------
  // Only fields the user marked "this" (= source) need an update; we already
  // hold target's existing values when "other" wins.
  const updates: Record<string, unknown> = {};
  for (const f of MERGE_FIELDS) {
    if (fieldChoices[f] === "this") {
      // We special-case `name` below because of the UNIQUE constraint.
      if (f === "name") continue;
      updates[f] = (source as unknown as Record<string, unknown>)[f] ?? null;
    }
  }

  const sourceWinsName = fieldChoices.name === "this";

  // ---------- 2. Re-point all child rows from source → target. ----------
  // recipe_ingredients: PK is (recipe_id, ingredient_id). If target already
  // has a row for the same recipe, delete the source's row before remapping.
  {
    const { data: dupRecipes } = await supabase
      .from("recipe_ingredients")
      .select("recipe_id")
      .eq("ingredient_id", sourceId);
    const sourceRecipeIds = (dupRecipes ?? []).map((r) => r.recipe_id);
    if (sourceRecipeIds.length > 0) {
      const { data: targetExisting } = await supabase
        .from("recipe_ingredients")
        .select("recipe_id")
        .eq("ingredient_id", targetId)
        .in("recipe_id", sourceRecipeIds);
      const conflictIds = new Set(
        (targetExisting ?? []).map((r) => r.recipe_id),
      );
      if (conflictIds.size > 0) {
        const { error } = await supabase
          .from("recipe_ingredients")
          .delete()
          .eq("ingredient_id", sourceId)
          .in("recipe_id", Array.from(conflictIds));
        if (error) return { ok: false as const, error: error.message };
      }
    }
    const { error } = await supabase
      .from("recipe_ingredients")
      .update({ ingredient_id: targetId })
      .eq("ingredient_id", sourceId);
    if (error) return { ok: false as const, error: error.message };
  }

  // inventory_items: UNIQUE (owner_id, ingredient_id, storage_location). If
  // target already has the same (owner, location), drop source's duplicate
  // before remapping. (We don't try to add quantities — the user picked a
  // winner; this just keeps the merge moving and never deletes both rows.)
  {
    const { data: srcInv } = await supabase
      .from("inventory_items")
      .select("id, owner_id, storage_location")
      .eq("ingredient_id", sourceId);
    const { data: tgtInv } = await supabase
      .from("inventory_items")
      .select("id, owner_id, storage_location")
      .eq("ingredient_id", targetId);
    const tgtKey = new Set(
      (tgtInv ?? []).map(
        (r) => `${r.owner_id ?? ""}::${r.storage_location ?? ""}`,
      ),
    );
    const dupSrcIds: number[] = [];
    for (const r of srcInv ?? []) {
      const key = `${r.owner_id ?? ""}::${r.storage_location ?? ""}`;
      if (tgtKey.has(key)) dupSrcIds.push(r.id as number);
    }
    if (dupSrcIds.length > 0) {
      const { error } = await supabase
        .from("inventory_items")
        .delete()
        .in("id", dupSrcIds);
      if (error) return { ok: false as const, error: error.message };
    }
    const { error } = await supabase
      .from("inventory_items")
      .update({ ingredient_id: targetId })
      .eq("ingredient_id", sourceId);
    if (error) return { ok: false as const, error: error.message };
  }

  // ingredient_nutrients: PK (ingredient_id, nutrient_id). Keep target's value
  // when both exist; remap the rest.
  {
    const { data: tgtNuts } = await supabase
      .from("ingredient_nutrients")
      .select("nutrient_id")
      .eq("ingredient_id", targetId);
    const have = new Set((tgtNuts ?? []).map((r) => r.nutrient_id as number));
    if (have.size > 0) {
      const { error } = await supabase
        .from("ingredient_nutrients")
        .delete()
        .eq("ingredient_id", sourceId)
        .in("nutrient_id", Array.from(have));
      if (error) return { ok: false as const, error: error.message };
    }
    const { error } = await supabase
      .from("ingredient_nutrients")
      .update({ ingredient_id: targetId })
      .eq("ingredient_id", sourceId);
    if (error) return { ok: false as const, error: error.message };
  }

  // ingredient_aliases: UNIQUE (ingredient_id, lower(alias)). Drop source
  // aliases that target already has, then remap.
  {
    const { data: tgtAliases } = await supabase
      .from("ingredient_aliases")
      .select("alias")
      .eq("ingredient_id", targetId);
    const have = new Set(
      (tgtAliases ?? []).map((r) => String(r.alias ?? "").toLowerCase()),
    );
    if (have.size > 0) {
      const { data: srcAliases } = await supabase
        .from("ingredient_aliases")
        .select("id, alias")
        .eq("ingredient_id", sourceId);
      const dupIds = (srcAliases ?? [])
        .filter((r) => have.has(String(r.alias ?? "").toLowerCase()))
        .map((r) => r.id as number);
      if (dupIds.length > 0) {
        const { error } = await supabase
          .from("ingredient_aliases")
          .delete()
          .in("id", dupIds);
        if (error) return { ok: false as const, error: error.message };
      }
    }
    const { error } = await supabase
      .from("ingredient_aliases")
      .update({ ingredient_id: targetId })
      .eq("ingredient_id", sourceId);
    if (error) return { ok: false as const, error: error.message };
  }

  // ingredient_portions, ingredient_products, shopping_items: simple remap.
  for (const tbl of ["ingredient_portions", "ingredient_products", "shopping_items"] as const) {
    const { error } = await supabase
      .from(tbl)
      .update({ ingredient_id: targetId })
      .eq("ingredient_id", sourceId);
    if (error) return { ok: false as const, error: error.message };
  }

  // Also re-parent any variants that pointed at the source so they survive.
  {
    const { error } = await supabase
      .from("ingredients")
      .update({ parent_ingredient_id: targetId })
      .eq("parent_ingredient_id", sourceId);
    if (error) return { ok: false as const, error: error.message };
  }

  // ---------- 3. Now write the field updates onto target. ----------
  // Capture the source's name before we delete it (we'll need it if it wins).
  const sourceName = source.name;
  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from("ingredients")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", targetId);
    if (error) return { ok: false as const, error: error.message };
  }

  // ---------- 4. Delete the source ingredient. ----------
  {
    const { error } = await supabase
      .from("ingredients")
      .delete()
      .eq("id", sourceId);
    if (error) return { ok: false as const, error: error.message };
  }

  // ---------- 5. If the source's name won, rename target to it. ----------
  // Done last so the UNIQUE(name) constraint can't conflict.
  if (sourceWinsName && sourceName && sourceName !== target.name) {
    const { error } = await supabase
      .from("ingredients")
      .update({ name: sourceName, updated_at: new Date().toISOString() })
      .eq("id", targetId);
    if (error) return { ok: false as const, error: error.message };
  }

  revalidatePath("/inventory");
  revalidatePath("/recipes");
  revalidatePath("/shop");
  return { ok: true as const, targetId };
}

/**
 * Detach `ingredientId` from any parent, returning it to the top level of
 * the variant taxonomy. Keeps all attached data — inventory, products,
 * recipes, nutrition — exactly as it was.
 */
export async function moveIngredientOutOfParentAction(ingredientId: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  if (!Number.isFinite(ingredientId)) {
    return { ok: false as const, error: "Invalid ingredient." };
  }

  const { error } = await supabase
    .from("ingredients")
    .update({
      parent_ingredient_id: null,
      variant_sort_order: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ingredientId);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/inventory");
  revalidatePath("/recipes");
  revalidatePath("/shop");
  return { ok: true as const };
}

/**
 * Lightweight ingredient list for picker UIs (Move to / Merge with). Excludes
 * a single ingredient (the one currently open) so users can't pick it.
 */
export async function listIngredientsForPickerAction(excludeId: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ingredients")
    .select("id, name, variant, parent_ingredient_id, grocery_category")
    .neq("id", excludeId)
    .order("name", { ascending: true })
    .limit(2000);
  if (error) return [] as Array<{
    id: number;
    name: string;
    variant: string | null;
    parent_ingredient_id: number | null;
    grocery_category: string | null;
  }>;
  return (data ?? []) as Array<{
    id: number;
    name: string;
    variant: string | null;
    parent_ingredient_id: number | null;
    grocery_category: string | null;
  }>;
}

/** Fetch full row pair for merge preview UI. */
export async function getIngredientPairForMergeAction(
  sourceId: number,
  targetId: number,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ingredients")
    .select("*")
    .in("id", [sourceId, targetId]);
  if (error || !data) return null;
  const source = data.find((r) => r.id === sourceId) as IngredientRow | undefined;
  const target = data.find((r) => r.id === targetId) as IngredientRow | undefined;
  if (!source || !target) return null;
  return { source, target };
}
