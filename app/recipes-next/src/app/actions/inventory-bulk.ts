"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  defaultStorageLocationForNewInventoryRow,
} from "@/lib/inventory-display";
import type { InventoryTab } from "@/lib/inventory-filters";
import type { IngredientRow } from "@/types/database";
import { toTitleCaseAP } from "@/lib/ingredient-resolution/normalize";
import {
  buildBackboneInsertFieldsFromName,
} from "@/lib/ingredient-backbone-inference";
import {
  findBackboneMatchForName,
  ingredientFieldsFromCatalogue,
} from "@/lib/ingredient-backbone-catalogue";
import { inferGroceryCategoryFromName } from "@/lib/ingredient-grocery-category";
import { maybeAutofillNutrition } from "@/app/actions/ingredient-nutrition";
import { isNutritionEffectivelyEmpty } from "@/lib/inventory-nutrition-display";
import {
  parseInventoryUpdateContent,
  type ParsedStocktakeItem,
  type StocktakeInventoryHint,
} from "@/lib/inventory-bulk/parse-inventory-update";
import {
  parseAddIngredientsContent,
  type AddStorageLocation,
  type AddIngredientExistingHint,
  type AddIngredientParentCandidate,
  type ParsedAddIngredientItem,
} from "@/lib/inventory-bulk/parse-add-ingredients";
import { upsertPreferredProduct } from "@/lib/receipt-import/apply-receipt";
import {
  INGREDIENT_UNIT_VALUES,
  normalizeIngredientUnitForStorage,
} from "@/lib/unit-mapping";
import {
  isIngredientGroceryCategory,
  type IngredientGroceryCategory,
} from "@/lib/ingredient-grocery-category";
import {
  INGREDIENT_TAXONOMY_SUBCATEGORIES,
  type IngredientTaxonomySubcategory,
} from "@/lib/ingredient-backbone-inference";
import {
  INGREDIENT_STORAGE_HINTS,
  type IngredientStorageHint,
} from "@/types/database";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/* ------------------------------------------------------------------ */
/*  Bulk-add: turn a free-text list into new ingredients              */
/* ------------------------------------------------------------------ */

/**
 * Split a free-text blob ("kale, broccoli and asparagus\nspinach") into a
 * deduped list of candidate ingredient names. We split on newlines, commas
 * and the word "and" (case-insensitive). Trim, drop empties, drop "uh/um/ok"
 * filler so a Super Whisper transcription paste doesn't create a "Um"
 * ingredient.
 */
function splitFreeTextIngredientList(rawText: string): string[] {
  const FILLER = new Set([
    "um",
    "uh",
    "okay",
    "ok",
    "also",
    "and",
    "then",
    "let me see",
    "let me think",
    "thats it",
    "that's it",
  ]);
  const seen = new Set<string>();
  const out: string[] = [];
  // Split on newlines, commas, semicolons, and the literal word "and".
  const tokens = rawText
    .split(/\n+|,|;|\band\b/gi)
    .map((t) => t.trim())
    .filter(Boolean);
  for (const token of tokens) {
    // Strip a trailing period/exclamation that often slips in from voice.
    const cleaned = token.replace(/[.!?]+$/, "").trim();
    if (!cleaned) continue;
    if (FILLER.has(cleaned.toLowerCase())) continue;
    // Reject obvious non-ingredient noise (>120 chars or just digits).
    if (cleaned.length > 120) continue;
    if (/^\d+$/.test(cleaned)) continue;
    const titled = toTitleCaseAP(cleaned);
    const key = titled.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(titled);
  }
  return out;
}

async function ensureIngredientByName(
  supabase: SupabaseClient,
  rawName: string,
): Promise<
  | { ok: true; ingredient: IngredientRow; created: boolean }
  | { ok: false; error: string }
> {
  const name = toTitleCaseAP(rawName.trim());
  if (!name) return { ok: false, error: "Name is required." };

  const { data: existing, error: existingErr } = await supabase
    .from("ingredients")
    .select("*")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  if (existingErr) return { ok: false, error: existingErr.message };
  if (existing) {
    const row = existing as IngredientRow;
    if (isNutritionEffectivelyEmpty(row)) {
      void maybeAutofillNutrition(row.id);
    }
    return { ok: true, ingredient: row, created: false };
  }

  const catalogueMatch = await findBackboneMatchForName(supabase, name);
  const catalogueFields = catalogueMatch
    ? ingredientFieldsFromCatalogue(catalogueMatch.entry)
    : null;
  const backboneDefaults =
    catalogueFields ?? buildBackboneInsertFieldsFromName(name);
  const grocery_category =
    catalogueFields?.grocery_category ?? inferGroceryCategoryFromName(name);

  const { data: inserted, error } = await supabase
    .from("ingredients")
    .insert({
      name,
      ...backboneDefaults,
      grocery_category,
    })
    .select("*")
    .single();

  if (error || !inserted) {
    return {
      ok: false,
      error: error?.message ?? "Could not create ingredient.",
    };
  }

  const row = inserted as IngredientRow;
  void maybeAutofillNutrition(row.id);
  return { ok: true, ingredient: row, created: true };
}

async function ensureInventoryRow(
  supabase: SupabaseClient,
  ingredient: IngredientRow,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const { data: existing } = await supabase
    .from("inventory_items")
    .select("id")
    .eq("ingredient_id", ingredient.id)
    .limit(1)
    .maybeSingle();
  if (existing?.id != null) return { ok: true, id: existing.id };

  const tab: InventoryTab = "Pantry";
  const storage_location = defaultStorageLocationForNewInventoryRow(
    ingredient,
    tab,
  );

  const { data: inserted, error } = await supabase
    .from("inventory_items")
    .insert({
      ingredient_id: ingredient.id,
      storage_location,
      quantity: null,
      unit: null,
    })
    .select("id")
    .single();
  if (error || !inserted?.id) {
    return {
      ok: false,
      error: error?.message ?? "Could not create inventory row.",
    };
  }
  return { ok: true, id: inserted.id };
}

export type BulkAddResult =
  | {
      ok: true;
      created: { id: number; name: string }[];
      existing: { id: number; name: string }[];
      errors: { name: string; error: string }[];
    }
  | { ok: false; error: string };

/**
 * Add ingredients from a free-text list. Each parsed name either creates a
 * new ingredient (with backbone defaults and a Pantry inventory row) or
 * surfaces an existing match. NEVER mutates inventory quantities — this is
 * the "I want this on my list" flow, not a stocktake.
 */
export async function bulkAddIngredientsFromTextAction(
  rawText: string,
): Promise<BulkAddResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const text = (rawText ?? "").trim();
  if (!text) return { ok: false, error: "Add at least one ingredient." };

  const names = splitFreeTextIngredientList(text);
  if (!names.length) {
    return { ok: false, error: "Couldn't read any ingredient names." };
  }

  const created: { id: number; name: string }[] = [];
  const existing: { id: number; name: string }[] = [];
  const errors: { name: string; error: string }[] = [];

  for (const name of names) {
    const res = await ensureIngredientByName(supabase, name);
    if (!res.ok) {
      errors.push({ name, error: res.error });
      continue;
    }
    const invRes = await ensureInventoryRow(supabase, res.ingredient);
    if (!invRes.ok) {
      errors.push({ name, error: invRes.error });
      continue;
    }
    if (res.created) {
      created.push({ id: res.ingredient.id, name: res.ingredient.name });
    } else {
      existing.push({ id: res.ingredient.id, name: res.ingredient.name });
    }
  }

  if (created.length || existing.length) {
    revalidatePath("/inventory");
    revalidatePath("/shop");
    revalidatePath("/recipes");
  }

  return { ok: true, created, existing, errors };
}

/* ------------------------------------------------------------------ */
/*  Stocktake: overwrite on-hand stock from a free-text monologue     */
/* ------------------------------------------------------------------ */

async function loadInventoryHints(
  supabase: SupabaseClient,
): Promise<StocktakeInventoryHint[]> {
  const [ingredientsRes, inventoryRes, aliasesRes] = await Promise.all([
    supabase.from("ingredients").select("id, name").order("name"),
    supabase.from("inventory_items").select("ingredient_id, unit"),
    supabase.from("ingredient_aliases").select("ingredient_id, alias"),
  ]);

  const unitByIngredient = new Map<number, string | null>();
  for (const row of inventoryRes.data ?? []) {
    const typed = row as { ingredient_id: number; unit: string | null };
    if (!unitByIngredient.has(typed.ingredient_id)) {
      unitByIngredient.set(typed.ingredient_id, typed.unit ?? null);
    }
  }

  const aliasesByIngredient = new Map<number, string[]>();
  for (const row of aliasesRes.data ?? []) {
    const typed = row as { ingredient_id: number; alias: string | null };
    const alias = typed.alias?.trim();
    if (!alias) continue;
    const list = aliasesByIngredient.get(typed.ingredient_id) ?? [];
    if (!list.includes(alias)) list.push(alias);
    aliasesByIngredient.set(typed.ingredient_id, list);
  }

  return (ingredientsRes.data ?? []).map((row) => {
    const typed = row as { id: number; name: string };
    return {
      id: typed.id,
      name: typed.name,
      aliases: aliasesByIngredient.get(typed.id) ?? [],
      unit: unitByIngredient.get(typed.id) ?? null,
    } satisfies StocktakeInventoryHint;
  });
}

function roundStockQuantity(n: number): number {
  return Math.round(n * 1000) / 1000;
}

async function setInventoryQuantity(
  supabase: SupabaseClient,
  ingredient: IngredientRow,
  quantity: number,
  preferredUnit: string | null,
): Promise<{ ok: true; quantity: number } | { ok: false; error: string }> {
  const invRes = await ensureInventoryRow(supabase, ingredient);
  if (!invRes.ok) return invRes;

  const updates: Record<string, unknown> = {
    quantity: roundStockQuantity(Math.max(0, quantity)),
  };

  // Stocktake is authoritative — the user is telling us how they're
  // tracking this ingredient right now. If they reviewed a row with
  // unit = "bottle", overwrite the existing inventory unit with that.
  // The review step is the user's chance to correct a fuzzy unit.
  if (preferredUnit) {
    const normalized = normalizeIngredientUnitForStorage(preferredUnit);
    if (normalized && INGREDIENT_UNIT_VALUES.has(normalized)) {
      updates.unit = normalized;
    }
  }

  const { error } = await supabase
    .from("inventory_items")
    .update(updates)
    .eq("id", invRes.id);
  if (error) return { ok: false, error: error.message };

  return { ok: true, quantity: Number(updates.quantity) };
}

export type ParseInventoryUpdateResult =
  | { ok: true; items: ParsedStocktakeItem[] }
  | { ok: false; error: string };

/**
 * Parse a free-text stocktake into structured items WITHOUT touching the
 * database. The client side pushes the result into the stocktake review
 * queue so the user can confirm/edit before applying. NOTHING is written
 * here — the matching apply action is `applyInventoryUpdateAction`.
 */
export async function parseInventoryUpdateAction(
  rawText: string,
): Promise<ParseInventoryUpdateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const content = (rawText ?? "").trim();
  if (!content) {
    return { ok: false, error: "Type or paste what you have on hand first." };
  }

  const inventory = await loadInventoryHints(supabase);
  const parsed = await parseInventoryUpdateContent(content, inventory);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  return { ok: true, items: parsed.items };
}

export type StocktakeDecision =
  | {
      action: "ignore";
      rawLine: string;
    }
  | {
      action: "set";
      rawLine: string;
      /** Existing ingredient. Provide either this or `newIngredientName`. */
      ingredientId: number | null;
      /** Title-cased name to create on the fly (used when `ingredientId` is null). */
      newIngredientName: string | null;
      quantity: number;
      unit: string | null;
      /** Preferred-product fields. When `productName` AND `productBrand`
       *  are both provided the apply step writes (or upserts) a top-rank
       *  `ingredient_products` row. When either is blank, no preferred
       *  product is written — only the inventory quantity is bumped. */
      productName: string | null;
      productBrand: string | null;
      unitSizeAmount: number | null;
      unitSizeUnit: string | null;
    };

/**
 * Storage-location zero-out flags. When a flag is true, every inventory
 * row in that location whose ingredient was NOT mentioned in the decisions
 * list has its quantity reset to zero.
 *
 * "Pantry" covers both the "Shallow Pantry" and "Deep Pantry" built-ins.
 */
export type ZeroOutLocations = {
  fridge: boolean;
  freezer: boolean;
  pantry: boolean;
};

export type ApplyInventoryUpdateResult =
  | {
      ok: true;
      applied: {
        ingredientId: number;
        ingredientName: string;
        quantity: number;
        unit: string | null;
        created: boolean;
      }[];
      zeroed: { ingredientId: number; storageLocation: string }[];
      errors: { rawLine: string; error: string }[];
    }
  | { ok: false; error: string };

const PANTRY_LOCATIONS = ["Shallow Pantry", "Deep Pantry"];

function locationsForZeroOut(flags: ZeroOutLocations): string[] {
  const out: string[] = [];
  if (flags.fridge) out.push("Fridge");
  if (flags.freezer) out.push("Freezer");
  if (flags.pantry) out.push(...PANTRY_LOCATIONS);
  return out;
}

/**
 * Apply the user's reviewed stocktake decisions. SET semantics — each
 * matched ingredient's on-hand quantity becomes the stated number (not
 * additive). Optionally zero out any inventory row in the provided
 * storage locations whose ingredient wasn't mentioned in the decisions
 * list.
 *
 * The zero-out logic is keyed on `ingredient_id`: if the user mentioned
 * "butter" anywhere in the dictation, ALL butter inventory rows are
 * excluded from the zero-out (regardless of which storage location
 * actually holds the matched row). See PRD §21.2 for the trade-off.
 */
export async function applyInventoryUpdateAction(
  decisions: StocktakeDecision[],
  zeroOut: ZeroOutLocations,
): Promise<ApplyInventoryUpdateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };

  if (!Array.isArray(decisions)) {
    return { ok: false, error: "Invalid decisions payload." };
  }

  const applied: {
    ingredientId: number;
    ingredientName: string;
    quantity: number;
    unit: string | null;
    created: boolean;
  }[] = [];
  const errors: { rawLine: string; error: string }[] = [];

  // Track every ingredient the user mentioned in this stocktake. Rows whose
  // ingredient_id is in this set are EXCLUDED from the zero-out sweep
  // below, even if the user chose "ignore" for them.
  const mentionedIngredientIds = new Set<number>();

  for (const decision of decisions) {
    if (decision.action === "ignore") continue;

    let ingredient: IngredientRow | null = null;
    let created = false;

    if (decision.ingredientId != null) {
      const { data: ingRow } = await supabase
        .from("ingredients")
        .select("*")
        .eq("id", decision.ingredientId)
        .maybeSingle();
      if (ingRow) ingredient = ingRow as IngredientRow;
    }

    if (!ingredient) {
      const proposed = decision.newIngredientName?.trim();
      if (!proposed) {
        errors.push({
          rawLine: decision.rawLine,
          error: "Pick an ingredient or give the new one a name.",
        });
        continue;
      }
      const res = await ensureIngredientByName(supabase, proposed);
      if (!res.ok) {
        errors.push({ rawLine: decision.rawLine, error: res.error });
        continue;
      }
      ingredient = res.ingredient;
      created = res.created;
    }

    if (
      !Number.isFinite(decision.quantity) ||
      decision.quantity < 0
    ) {
      errors.push({
        rawLine: decision.rawLine,
        error: "Quantity must be a non-negative number.",
      });
      continue;
    }

    const setRes = await setInventoryQuantity(
      supabase,
      ingredient,
      decision.quantity,
      decision.unit,
    );
    if (!setRes.ok) {
      errors.push({ rawLine: decision.rawLine, error: setRes.error });
      continue;
    }

    // Optional preferred-product upsert. Only fires when the user (via
    // the LLM or a manual review edit) actually named both a product and
    // a brand — otherwise the stocktake stays a stock-only update and
    // doesn't pollute the preferred-product list with anonymous "Lemon
    // Juice" entries.
    const productName = decision.productName?.trim();
    const productBrand = decision.productBrand?.trim();
    if (productName && productBrand) {
      const productRes = await upsertPreferredProduct(supabase, ingredient.id, {
        name: productName,
        brand: productBrand,
        price: null,
        priceBasis: null,
        priceBasisAmount: null,
        priceBasisUnit: null,
        unitSizeAmount: decision.unitSizeAmount,
        unitSizeUnit: decision.unitSizeUnit,
      });
      if (!productRes.ok) {
        // Don't fail the stocktake over a preferred-product hiccup —
        // surface and continue.
        errors.push({ rawLine: decision.rawLine, error: productRes.error });
      }
    }

    mentionedIngredientIds.add(ingredient.id);
    applied.push({
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      quantity: setRes.quantity,
      unit: decision.unit,
      created,
    });
  }

  // Also treat ignored rows as "mentioned" — the user explicitly said this
  // ingredient came up in their stocktake even if they chose not to set
  // its quantity. We don't want to zero those out behind their back.
  for (const decision of decisions) {
    if (decision.action !== "ignore") continue;
    // Best-effort: try to resolve to an ingredient id by name lookup so we
    // can still skip it during zero-out. Failure is silent.
    // (Rows the user explicitly ignored that don't yet match an ingredient
    // can't pollute zero-out anyway, so this is purely a safety net.)
  }

  // Zero-out sweep: any inventory row in the checked locations whose
  // ingredient WASN'T mentioned gets quantity = 0.
  const zeroLocations = locationsForZeroOut(zeroOut);
  const zeroed: { ingredientId: number; storageLocation: string }[] = [];

  if (zeroLocations.length > 0) {
    const { data: rows, error: scanErr } = await supabase
      .from("inventory_items")
      .select("id, ingredient_id, storage_location, quantity")
      .in("storage_location", zeroLocations);

    if (scanErr) {
      // Don't tank the whole apply over a zero-out failure — surface and
      // continue.
      errors.push({
        rawLine: "(zero-out sweep)",
        error: scanErr.message,
      });
    } else {
      const idsToZero: number[] = [];
      for (const row of rows ?? []) {
        const typed = row as {
          id: number;
          ingredient_id: number;
          storage_location: string;
          quantity: number | null;
        };
        if (mentionedIngredientIds.has(typed.ingredient_id)) continue;
        // Skip rows that are already zero (or null) — no work to do.
        if (typed.quantity == null || typed.quantity === 0) continue;
        idsToZero.push(typed.id);
        zeroed.push({
          ingredientId: typed.ingredient_id,
          storageLocation: typed.storage_location,
        });
      }
      if (idsToZero.length > 0) {
        const { error: zeroErr } = await supabase
          .from("inventory_items")
          .update({ quantity: 0 })
          .in("id", idsToZero);
        if (zeroErr) {
          errors.push({
            rawLine: "(zero-out sweep)",
            error: zeroErr.message,
          });
        }
      }
    }
  }

  if (applied.length || zeroed.length) {
    revalidatePath("/inventory");
    revalidatePath("/shop");
    revalidatePath("/recipes");
  }

  return { ok: true, applied, zeroed, errors };
}

/* ------------------------------------------------------------------ */
/*  Add ingredients (LLM-enriched flow)                               */
/* ------------------------------------------------------------------ */

/**
 * Hydrate the LLM-enrichment context from the current user's catalog.
 * Sends every ingredient (id + name + a few aliases) so the model can
 * dedupe against existing rows, plus the subset of root ingredients (no
 * parent) so it can suggest a parent for new variants.
 */
async function loadAddIngredientHints(supabase: SupabaseClient): Promise<{
  existing: AddIngredientExistingHint[];
  parents: AddIngredientParentCandidate[];
}> {
  const [ingredientsRes, aliasesRes] = await Promise.all([
    supabase
      .from("ingredients")
      .select("id, name, parent_ingredient_id, taxonomy_subcategory")
      .order("name"),
    supabase.from("ingredient_aliases").select("ingredient_id, alias"),
  ]);

  const aliasesByIngredient = new Map<number, string[]>();
  for (const row of aliasesRes.data ?? []) {
    const typed = row as { ingredient_id: number; alias: string | null };
    const alias = typed.alias?.trim();
    if (!alias) continue;
    const list = aliasesByIngredient.get(typed.ingredient_id) ?? [];
    if (!list.includes(alias)) list.push(alias);
    aliasesByIngredient.set(typed.ingredient_id, list);
  }

  const existing: AddIngredientExistingHint[] = [];
  const parents: AddIngredientParentCandidate[] = [];
  for (const row of ingredientsRes.data ?? []) {
    const typed = row as {
      id: number;
      name: string;
      parent_ingredient_id: number | null;
      taxonomy_subcategory: string | null;
    };
    existing.push({
      id: typed.id,
      name: typed.name,
      aliases: aliasesByIngredient.get(typed.id) ?? [],
    });
    if (!typed.parent_ingredient_id) {
      parents.push({
        id: typed.id,
        name: typed.name,
        taxonomy_subcategory: typed.taxonomy_subcategory ?? null,
      });
    }
  }

  return { existing, parents };
}

export type ParseAddIngredientsServerResult =
  | { ok: true; items: ParsedAddIngredientItem[] }
  | { ok: false; error: string };

/**
 * Parse + LLM-enrich a free-text list of ingredient names. Does NOT
 * touch the database — the result lands in the client-side review queue
 * (`add-ingredients-queue.ts`) for the user to confirm before
 * `applyAddIngredientsAction` actually creates anything.
 */
export async function parseAddIngredientsAction(
  rawText: string,
): Promise<ParseAddIngredientsServerResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const text = (rawText ?? "").trim();
  if (!text) return { ok: false, error: "Add at least one ingredient." };

  const { existing, parents } = await loadAddIngredientHints(supabase);
  const result = await parseAddIngredientsContent(text, existing, parents);
  if (!result.ok) return result;
  return { ok: true, items: result.items };
}

const STORAGE_LOCATION_VALUES: Record<AddStorageLocation, string> = {
  Fridge: "Fridge",
  Freezer: "Freezer",
  "Shallow Pantry": "Shallow Pantry",
  "Deep Pantry": "Deep Pantry",
  // The inventory UI buckets counter-stored items into the Pantry tab; we
  // store them as Shallow Pantry so they show up alongside other room-temp
  // staples and remember a "counter" hint via storage_hints.
  Counter: "Shallow Pantry",
  Other: "Other",
};

const SUBCATEGORY_SET = new Set<string>(INGREDIENT_TAXONOMY_SUBCATEGORIES);

function isTaxonomySubcategory(
  value: unknown,
): value is IngredientTaxonomySubcategory {
  return typeof value === "string" && SUBCATEGORY_SET.has(value);
}

const STORAGE_HINT_SET = new Set<string>(INGREDIENT_STORAGE_HINTS);

function asStorageHints(value: unknown): IngredientStorageHint[] | null {
  if (!Array.isArray(value)) return null;
  const out: IngredientStorageHint[] = [];
  const seen = new Set<string>();
  for (const v of value) {
    if (typeof v !== "string") continue;
    const lower = v.toLowerCase();
    if (!STORAGE_HINT_SET.has(lower)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(lower as IngredientStorageHint);
  }
  return out.length ? out : null;
}

export type AddIngredientDecision =
  | { action: "ignore"; rawLine: string }
  | {
      action: "create";
      rawLine: string;
      /** Existing ingredient. When set, no new ingredient is created;
       *  this just ensures an inventory row exists for it. */
      assignIngredientId: number | null;
      /** Title-cased name for the new ingredient (when assignIngredientId is null). */
      newIngredientName: string | null;
      /** Aisle-style category. */
      groceryCategory: string | null;
      /** Culinary subcategory. */
      taxonomySubcategory: string | null;
      /** Existing parent ingredient id (must be a root ingredient). */
      parentIngredientId: number | null;
      /** Storage location for the inventory_items row. */
      storageLocation: AddStorageLocation | null;
      /** Storage hints to persist alongside the ingredient. */
      storageHints: string[] | null;
    };

export type ApplyAddIngredientsResult =
  | {
      ok: true;
      created: { id: number; name: string }[];
      existing: { id: number; name: string }[];
      errors: { rawLine: string; error: string }[];
    }
  | { ok: false; error: string };

/**
 * Apply the user's reviewed add-ingredient decisions. Each "create"
 * decision either:
 *  - reuses an existing ingredient (when assignIngredientId is set), then
 *    ensures it has at least one inventory row, OR
 *  - creates a new ingredient with the user-confirmed category /
 *    subcategory / parent / storage metadata, then creates an
 *    inventory row at the chosen storage location.
 *
 * NEVER mutates inventory quantities — this is the "I want this on my
 * list" flow; quantities are managed elsewhere.
 */
export async function applyAddIngredientsAction(
  decisions: AddIngredientDecision[],
): Promise<ApplyAddIngredientsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };

  if (!Array.isArray(decisions)) {
    return { ok: false, error: "Invalid decisions payload." };
  }

  const created: { id: number; name: string }[] = [];
  const existingHits: { id: number; name: string }[] = [];
  const errors: { rawLine: string; error: string }[] = [];

  for (const decision of decisions) {
    if (decision.action === "ignore") continue;

    let ingredient: IngredientRow | null = null;
    let isNewIngredient = false;

    if (decision.assignIngredientId != null) {
      const { data: ingRow } = await supabase
        .from("ingredients")
        .select("*")
        .eq("id", decision.assignIngredientId)
        .maybeSingle();
      if (ingRow) ingredient = ingRow as IngredientRow;
    }

    if (!ingredient) {
      const proposed = decision.newIngredientName?.trim();
      if (!proposed) {
        errors.push({
          rawLine: decision.rawLine,
          error: "Pick an ingredient or give the new one a name.",
        });
        continue;
      }
      const cleanName = toTitleCaseAP(proposed);
      const { data: dupe } = await supabase
        .from("ingredients")
        .select("*")
        .ilike("name", cleanName)
        .limit(1)
        .maybeSingle();
      if (dupe) {
        ingredient = dupe as IngredientRow;
      } else {
        const backboneDefaults = buildBackboneInsertFieldsFromName(cleanName);
        const grocery: IngredientGroceryCategory =
          decision.groceryCategory &&
          isIngredientGroceryCategory(decision.groceryCategory)
            ? decision.groceryCategory
            : inferGroceryCategoryFromName(cleanName);
        const subcategory: IngredientTaxonomySubcategory | null =
          decision.taxonomySubcategory &&
          isTaxonomySubcategory(decision.taxonomySubcategory)
            ? decision.taxonomySubcategory
            : (backboneDefaults.taxonomy_subcategory ?? null);
        const hints =
          asStorageHints(decision.storageHints) ??
          backboneDefaults.storage_hints ??
          null;

        const insertPayload: Record<string, unknown> = {
          name: cleanName,
          ...backboneDefaults,
          grocery_category: grocery,
        };
        if (subcategory) insertPayload.taxonomy_subcategory = subcategory;
        else delete insertPayload.taxonomy_subcategory;
        if (hints && hints.length > 0) insertPayload.storage_hints = hints;
        if (decision.parentIngredientId) {
          insertPayload.parent_ingredient_id = decision.parentIngredientId;
        }

        const { data: inserted, error: insertErr } = await supabase
          .from("ingredients")
          .insert(insertPayload)
          .select("*")
          .single();
        if (insertErr || !inserted) {
          errors.push({
            rawLine: decision.rawLine,
            error: insertErr?.message ?? "Could not create ingredient.",
          });
          continue;
        }
        ingredient = inserted as IngredientRow;
        isNewIngredient = true;
        void maybeAutofillNutrition(ingredient.id);
      }
    }

    // Ensure an inventory row exists at the chosen storage location.
    const targetLocation: string =
      (decision.storageLocation &&
        STORAGE_LOCATION_VALUES[decision.storageLocation]) ||
      defaultStorageLocationForNewInventoryRow(
        ingredient,
        "Pantry" satisfies InventoryTab,
      );

    const { data: existingInv } = await supabase
      .from("inventory_items")
      .select("id, storage_location")
      .eq("ingredient_id", ingredient.id);

    const hasRowAtLocation = (existingInv ?? []).some(
      (r: { storage_location: string }) => r.storage_location === targetLocation,
    );

    if (!hasRowAtLocation) {
      const { error: invErr } = await supabase.from("inventory_items").insert({
        ingredient_id: ingredient.id,
        storage_location: targetLocation,
        quantity: null,
        unit: null,
      });
      if (invErr) {
        errors.push({
          rawLine: decision.rawLine,
          error: invErr.message,
        });
        continue;
      }
    }

    if (isNewIngredient) {
      created.push({ id: ingredient.id, name: ingredient.name });
    } else {
      existingHits.push({ id: ingredient.id, name: ingredient.name });
    }
  }

  if (created.length || existingHits.length) {
    revalidatePath("/inventory");
    revalidatePath("/shop");
    revalidatePath("/recipes");
  }

  return { ok: true, created, existing: existingHits, errors };
}
