"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { INGREDIENT_BACKBONE_CATALOGUE_SEED } from "@/lib/ingredient-backbone-catalogue-seed";
import { normalizeForMatch } from "@/lib/ingredient-resolution/normalize";
import {
  findBackboneMatchForName,
  patchExistingFromCatalogue,
  type BackboneCatalogueRow,
} from "@/lib/ingredient-backbone-catalogue";
import type { IngredientRow } from "@/types/database";

/* ------------------------------------------------------------------ */
/*  Seed / upsert                                                     */
/* ------------------------------------------------------------------ */

export type SeedCatalogueResult =
  | {
      ok: true;
      total: number;
      upserted: number;
      aliasesNormalised: number;
      skippedDuplicates: string[];
    }
  | { ok: false; error: string };

/**
 * Upsert every entry in the TypeScript seed into the catalogue table.
 * Idempotent: re-running is safe and will pick up edits to the seed.
 *
 * The seed's human-authored aliases are run through `normalizeForMatch()`
 * before being stored so the runtime lookup is one O(1) index/array hit.
 */
export async function seedIngredientBackboneCatalogueAction(): Promise<SeedCatalogueResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const seen = new Set<string>();
  const skippedDuplicates: string[] = [];
  let aliasesNormalised = 0;

  const rows = INGREDIENT_BACKBONE_CATALOGUE_SEED.map((e) => {
    const matchKey = normalizeForMatch(e.canonical_name);
    const aliasKeysRaw = (e.aliases ?? []).map((a) => normalizeForMatch(a));
    const aliasKeys = Array.from(
      new Set(aliasKeysRaw.filter((k) => k && k !== matchKey)),
    );
    aliasesNormalised += aliasKeys.length;

    if (seen.has(matchKey)) {
      skippedDuplicates.push(`${e.backbone_id} (match_key="${matchKey}")`);
    } else {
      seen.add(matchKey);
    }

    return {
      backbone_id: e.backbone_id,
      canonical_name: e.canonical_name,
      variant: e.variant ?? null,
      parent_backbone_id: e.parent_backbone_id ?? null,
      match_key: matchKey,
      taxonomy_subcategory: e.taxonomy_subcategory ?? null,
      grocery_category: e.grocery_category ?? null,
      default_units: e.default_units ?? null,
      storage_hints: e.storage_hints ?? null,
      shelf_life_counter_days: e.shelf_life_counter_days ?? null,
      shelf_life_fridge_days: e.shelf_life_fridge_days ?? null,
      shelf_life_freezer_days: e.shelf_life_freezer_days ?? null,
      packaged_common: e.packaged_common ?? false,
      is_composite: e.is_composite ?? false,
      density_g_per_ml: e.density_g_per_ml ?? null,
      canonical_unit_weight_g: e.canonical_unit_weight_g ?? null,
      aliases: aliasKeys,
      notes: e.notes ?? null,
    };
  });

  const { error } = await supabase
    .from("ingredient_backbone_catalogue")
    .upsert(rows, { onConflict: "backbone_id" });

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/admin/ingredient-autofill");
  return {
    ok: true as const,
    total: rows.length,
    upserted: rows.length,
    aliasesNormalised,
    skippedDuplicates,
  };
}

/* ------------------------------------------------------------------ */
/*  Apply catalogue to existing ingredients                           */
/* ------------------------------------------------------------------ */

type ApplyableFields =
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
  | "canonical_unit_weight_g";

export type ApplyCatalogueResult =
  | {
      ok: true;
      dryRun: boolean;
      examined: number;
      matched: number;
      updated: number;
      fieldCounts: Record<ApplyableFields, number>;
      unmatched: string[];
      matchedByCanonical: number;
      matchedByAlias: number;
    }
  | { ok: false; error: string };

function emptyFieldCounts(): Record<ApplyableFields, number> {
  return {
    backbone_id: 0,
    variant: 0,
    taxonomy_subcategory: 0,
    grocery_category: 0,
    default_units: 0,
    storage_hints: 0,
    shelf_life_counter_days: 0,
    shelf_life_fridge_days: 0,
    shelf_life_freezer_days: 0,
    packaged_common: 0,
    is_composite: 0,
    density_g_per_ml: 0,
    canonical_unit_weight_g: 0,
  };
}

type ExistingRow = Pick<
  IngredientRow,
  | "id"
  | "name"
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
>;

/**
 * Walk every ingredient, look it up in the catalogue, and apply any fields
 * the catalogue knows about that are currently empty on the row. Reuses the
 * never-overwrite patching logic in `patchExistingFromCatalogue`.
 */
export async function applyCatalogueToExistingIngredientsAction(options?: {
  dryRun?: boolean;
}): Promise<ApplyCatalogueResult> {
  const dryRun = options?.dryRun === true;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const { data: ingredients, error: ingErr } = await supabase
    .from("ingredients")
    .select(
      "id, name, backbone_id, variant, taxonomy_subcategory, grocery_category, default_units, storage_hints, shelf_life_counter_days, shelf_life_fridge_days, shelf_life_freezer_days, packaged_common, is_composite, density_g_per_ml, canonical_unit_weight_g",
    )
    .order("id");
  if (ingErr) return { ok: false as const, error: ingErr.message };

  const rows = (ingredients ?? []) as ExistingRow[];

  // Pull the whole catalogue once — it's small. Build in-memory indices
  // so we don't issue one query per ingredient.
  const { data: catalogueRows, error: catErr } = await supabase
    .from("ingredient_backbone_catalogue")
    .select("*");
  if (catErr) return { ok: false as const, error: catErr.message };

  const catalogue = (catalogueRows ?? []) as BackboneCatalogueRow[];
  const byMatchKey = new Map<string, BackboneCatalogueRow>();
  const byAlias = new Map<string, BackboneCatalogueRow>();
  for (const entry of catalogue) {
    byMatchKey.set(entry.match_key, entry);
    for (const a of entry.aliases ?? []) {
      if (!byAlias.has(a)) byAlias.set(a, entry);
    }
  }

  const fieldCounts = emptyFieldCounts();
  const unmatched: string[] = [];
  let matched = 0;
  let matchedByCanonical = 0;
  let matchedByAlias = 0;
  let updated = 0;

  for (const row of rows) {
    const key = normalizeForMatch(row.name);
    if (!key) {
      unmatched.push(row.name);
      continue;
    }
    let entry = byMatchKey.get(key);
    let matchType: "canonical" | "alias" | null = null;
    if (entry) {
      matchType = "canonical";
    } else {
      entry = byAlias.get(key);
      if (entry) matchType = "alias";
    }
    if (!entry || !matchType) {
      unmatched.push(row.name);
      continue;
    }

    matched++;
    if (matchType === "canonical") matchedByCanonical++;
    else matchedByAlias++;

    const patch = patchExistingFromCatalogue(row, entry);
    const patchKeys = Object.keys(patch) as ApplyableFields[];
    if (patchKeys.length === 0) continue;

    for (const k of patchKeys) fieldCounts[k]++;

    if (dryRun) continue;

    const { error: updErr } = await supabase
      .from("ingredients")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", row.id);

    if (updErr) return { ok: false as const, error: updErr.message };
    updated++;
  }

  if (!dryRun && updated > 0) {
    revalidatePath("/inventory");
    revalidatePath("/shop");
    revalidatePath("/recipes");
  }

  return {
    ok: true as const,
    dryRun,
    examined: rows.length,
    matched,
    matchedByCanonical,
    matchedByAlias,
    updated,
    fieldCounts,
    unmatched,
  };
}

/* ------------------------------------------------------------------ */
/*  Single-ingredient lookup (exposed for debug/admin UI)             */
/* ------------------------------------------------------------------ */

export async function lookupBackboneForNameAction(name: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const match = await findBackboneMatchForName(supabase, name);
  if (!match) return { ok: true as const, match: null };
  return { ok: true as const, match };
}
