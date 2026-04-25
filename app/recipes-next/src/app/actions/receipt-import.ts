"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type {
  IngredientProductRow,
  IngredientRow,
  ProductPriceBasis,
} from "@/types/database";
import {
  parseReceiptContent,
  type ReceiptInventoryHint,
} from "@/lib/receipt-import/parse-receipt";
import { cleanReceiptContent } from "@/lib/receipt-import/clean-receipt";
import {
  applyStockDelta,
  upsertPreferredProduct,
} from "@/lib/receipt-import/apply-receipt";
import {
  enrichRowsWithWebSearch,
  shouldEnrichRow,
  type EnrichmentInput,
} from "@/lib/receipt-import/enrich-with-web-search";
import {
  buildInventoryMatchIndex,
  matchReceiptLineToInventory,
} from "@/lib/receipt-import/match-inventory";
import { toTitleCaseAP } from "@/lib/ingredient-resolution/normalize";
import { buildBackboneInsertFieldsFromName } from "@/lib/ingredient-backbone-inference";
import {
  findBackboneMatchForName,
  ingredientFieldsFromCatalogue,
} from "@/lib/ingredient-backbone-catalogue";
import { inferGroceryCategoryFromName } from "@/lib/ingredient-grocery-category";
import { maybeAutofillNutrition } from "@/app/actions/ingredient-nutrition";
import { isNutritionEffectivelyEmpty } from "@/lib/inventory-nutrition-display";

export type AppliedSummary = {
  ingredientId: number;
  ingredientName: string;
  quantityDelta: number;
  unit: string | null;
  productName: string | null;
  productBrand: string | null;
  price: number | null;
};

/**
 * One candidate line the user can choose to apply. Every parsed receipt line
 * becomes a ParsedRow so the user always has the final say — nothing is
 * written until they click Apply.
 */
export type ParsedRow = {
  /** Stable client-side id. */
  id: string;
  rawLine: string;
  excludedReason: string | null;
  /** LLM's best-guess ingredient id — null when it couldn't decide. */
  suggestedIngredientId: number | null;
  suggestedIngredientName: string | null;
  confidence: "high" | "medium" | "low";
  quantityDelta: number | null;
  unit: string | null;
  productName: string | null;
  productBrand: string | null;
  unitSizeAmount: number | null;
  unitSizeUnit: string | null;
  price: number | null;
  priceBasis: ProductPriceBasis | null;
  priceBasisAmount: number | null;
  priceBasisUnit: string | null;
  purchaseQuantity: number | null;
  purchaseUnit: string | null;
  /** Plain-English checks that make a row worth reviewing even if the AI was confident. */
  reviewFlags: string[];
};

export type ImportReceiptResult =
  | { ok: true; rows: ParsedRow[] }
  | { ok: false; error: string };

function shouldUseEnrichedProductName(
  current: string | null,
  next: string | null,
): boolean {
  if (!next) return false;
  if (!current) return true;
  const currentLower = current.toLowerCase();
  const nextLower = next.toLowerCase();
  if (currentLower === nextLower) return false;

  const detailWords = [
    "frozen",
    "refrigerated",
    "smoked",
    "roasted",
    "salted",
    "shelled",
    "extra firm",
  ];
  return detailWords.some(
    (word) => nextLower.includes(word) && !currentLower.includes(word),
  );
}

const COUNT_LIKE_UNITS = new Set([
  "count",
  "ea",
  "piece",
  "dozen",
  "whole",
  "clove",
  "slice",
  "sprig",
  "pinch",
  "head",
  "bunch",
  "pkg",
  "bag",
  "box",
  "block",
  "tub",
  "container",
  "jar",
  "bottle",
  "can",
  "roll",
  "sleeve",
]);

const MASS_VOLUME_UNITS = new Set([
  "g",
  "kg",
  "oz",
  "lb",
  "ml",
  "l",
  "fl oz",
  "cup",
  "tsp",
  "tbsp",
]);

function addReviewFlag(flags: string[], message: string) {
  if (!flags.includes(message)) flags.push(message);
}

function buildReviewFlags(row: ParsedRow, inventoryUnit: string | null): string[] {
  if (row.excludedReason) return [];

  const flags: string[] = [];
  if (row.suggestedIngredientId == null) {
    addReviewFlag(flags, "No inventory match yet.");
  }
  if (row.confidence !== "high") {
    addReviewFlag(flags, `AI confidence is ${row.confidence}.`);
  }
  if (row.quantityDelta == null) {
    addReviewFlag(flags, "Quantity to add is missing.");
  } else if (row.quantityDelta === 0) {
    addReviewFlag(flags, "Quantity to add is zero.");
  }

  if (inventoryUnit && row.unit && row.unit !== inventoryUnit) {
    addReviewFlag(flags, `Unit differs from stock unit (${inventoryUnit}).`);
  }

  if (row.unit && row.quantityDelta != null) {
    if (COUNT_LIKE_UNITS.has(row.unit) && !Number.isInteger(row.quantityDelta)) {
      addReviewFlag(flags, "Count-style quantity is fractional.");
    }
    if (COUNT_LIKE_UNITS.has(row.unit) && row.quantityDelta > 24) {
      addReviewFlag(flags, "Count-style quantity looks unusually high.");
    }
    if (
      ((row.unit === "g" || row.unit === "ml") && row.quantityDelta > 10_000) ||
      ((row.unit === "kg" || row.unit === "l" || row.unit === "lb") &&
        row.quantityDelta > 25)
    ) {
      addReviewFlag(flags, "Quantity looks unusually large.");
    }
  }

  if (
    row.productName &&
    MASS_VOLUME_UNITS.has(row.unit ?? "") &&
    (row.unitSizeAmount == null || !row.unitSizeUnit)
  ) {
    addReviewFlag(flags, "Pack size is missing, so the quantity may be a guess.");
  }

  if (
    row.price != null &&
    row.priceBasis === "weight" &&
    (!row.priceBasisAmount || !row.priceBasisUnit)
  ) {
    addReviewFlag(flags, "By-weight price is missing its basis unit.");
  }

  return flags;
}

/**
 * Load inventory context for the LLM: every ingredient, its current stock
 * unit, and its top-ranked preferred product (if any).
 */
async function loadInventoryContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<ReceiptInventoryHint[]> {
  const [ingredientsRes, inventoryRes, productsRes, aliasesRes] = await Promise.all([
    supabase.from("ingredients").select("id, name").order("name"),
    supabase.from("inventory_items").select("ingredient_id, unit"),
    supabase
      .from("ingredient_products")
      .select("ingredient_id, name, brand, unit_size_amount, unit_size_unit, rank")
      .order("rank", { ascending: true }),
    supabase.from("ingredient_aliases").select("ingredient_id, alias"),
  ]);

  const unitByIngredient = new Map<number, string | null>();
  for (const row of inventoryRes.data ?? []) {
    const typed = row as { ingredient_id: number; unit: string | null };
    if (!unitByIngredient.has(typed.ingredient_id)) {
      unitByIngredient.set(typed.ingredient_id, typed.unit ?? null);
    }
  }

  const topProductByIngredient = new Map<
    number,
    {
      name: string;
      brand: string | null;
      unit_size_amount: number | null;
      unit_size_unit: string | null;
    }
  >();
  for (const row of productsRes.data ?? []) {
    const typed = row as Pick<
      IngredientProductRow,
      "ingredient_id" | "name" | "brand" | "unit_size_amount" | "unit_size_unit"
    > & { rank: number };
    if (topProductByIngredient.has(typed.ingredient_id)) continue;
    topProductByIngredient.set(typed.ingredient_id, {
      name: typed.name,
      brand: typed.brand,
      unit_size_amount: typed.unit_size_amount,
      unit_size_unit: typed.unit_size_unit,
    });
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
    const top = topProductByIngredient.get(typed.id) ?? null;
    return {
      id: typed.id,
      name: typed.name,
      aliases: aliasesByIngredient.get(typed.id) ?? [],
      unit: unitByIngredient.get(typed.id) ?? null,
      productName: top?.name ?? null,
      productBrand: top?.brand ?? null,
      unitSizeAmount: top?.unit_size_amount ?? null,
      unitSizeUnit: top?.unit_size_unit ?? null,
    } satisfies ReceiptInventoryHint;
  });
}

/** Max non-empty lines per parse call. Above this threshold we split into
 * parallel chunks because gpt-4o JSON-mode latency on long structured
 * outputs is the dominant failure mode for big receipts. */
const PARSE_CHUNK_SIZE = 15;
/** Cap how many chunks we'll parallelize. Big-enough to handle 60-line
 * receipts in a single round-trip; small enough not to spam the API. */
const PARSE_MAX_CHUNKS = 6;

/**
 * Split a cleaned receipt by line into PARSE_CHUNK_SIZE-line chunks and
 * parse them in parallel, then concatenate the results. The previous
 * single-call implementation timed out on 30+ line pastes because gpt-4o
 * couldn't return the structured JSON in time; splitting the input keeps
 * each individual response small and fast.
 *
 * Failure semantics: if at least ONE chunk succeeds we return its items and
 * surface a soft warning via toast (not implemented yet — TODO if we ever
 * want it). If every chunk fails we return the first chunk's error.
 */
type ParseReceiptOk = Extract<
  Awaited<ReturnType<typeof parseReceiptContent>>,
  { ok: true }
>;

async function parseReceiptInChunks(
  cleanedText: string,
  inventory: ReceiptInventoryHint[],
): Promise<ParseReceiptOk | { ok: false; error: string }> {
  const lines = cleanedText.split(/\r?\n/);
  const nonEmptyCount = lines.filter((l) => l.trim()).length;

  // Short receipts: single call, same as before.
  if (nonEmptyCount <= PARSE_CHUNK_SIZE) {
    return parseReceiptContent(cleanedText, inventory);
  }

  // Group into chunks of up to PARSE_CHUNK_SIZE *non-empty* lines, preserving
  // any blank-line separators within a chunk (they don't change parse
  // behaviour and keep line numbers stable for the user).
  const chunks: string[] = [];
  let current: string[] = [];
  let countInCurrent = 0;
  for (const line of lines) {
    current.push(line);
    if (line.trim()) {
      countInCurrent += 1;
      if (countInCurrent >= PARSE_CHUNK_SIZE) {
        chunks.push(current.join("\n"));
        current = [];
        countInCurrent = 0;
      }
    }
    if (chunks.length >= PARSE_MAX_CHUNKS - 1) break;
  }
  if (current.length) chunks.push(current.join("\n"));

  // Anything past the chunk cap goes into the final chunk verbatim. Better
  // to have one slightly-too-big chunk than to silently drop tail items.
  if (chunks.length === PARSE_MAX_CHUNKS) {
    const consumedLines = chunks.slice(0, -1).join("\n").split(/\r?\n/).length;
    const tail = lines.slice(consumedLines).join("\n");
    chunks[chunks.length - 1] = tail;
  }

  const results = await Promise.all(
    chunks.map((chunk) => parseReceiptContent(chunk, inventory)),
  );

  const items = results.flatMap((r) => (r.ok ? r.items : []));
  const firstError = results.find((r) => !r.ok);
  if (items.length === 0 && firstError && !firstError.ok) {
    return { ok: false, error: firstError.error };
  }
  return { ok: true, items };
}

/**
 * Parse a receipt and return every line as a candidate row the user can
 * confirm, edit or skip. NOTHING is written to the database here — the user
 * must click Apply in the modal for any changes to land. This gives the user
 * a true "cancel = nothing happened" escape hatch.
 */
export async function importReceiptAction(
  rawContent: string,
): Promise<ImportReceiptResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const content = (rawContent ?? "").trim();
  if (!content) {
    return { ok: false, error: "Paste some receipt text or upload a CSV." };
  }

  const inventory = await loadInventoryContext(supabase);

  // Pass 1: clean up messy pastes (store UI chrome, split price/name blocks)
  // into canonical "<product>, qty N, $<price>" lines. This is a no-op when
  // the paste is already structured, so structured receipts still pay a
  // small heuristic check but no LLM cost.
  const cleaned = await cleanReceiptContent(content);
  if (!cleaned.ok) return { ok: false, error: cleaned.error };

  // Pass 2: the existing parser turns canonical lines into structured
  // ParsedReceiptLine records with ingredient matches, units, and prices.
  // Long pastes are split into 15-line chunks parsed in parallel — gpt-4o
  // JSON-mode latency goes nonlinear once the response gets large, and a
  // single 75s budget would fail under load. Each chunk gets its own
  // 75s budget; we only fail the whole batch if EVERY chunk fails.
  const parsed = await parseReceiptInChunks(cleaned.cleaned, inventory);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const nameById = new Map<number, string>();
  const unitById = new Map<number, string | null>();
  for (const row of inventory) {
    nameById.set(row.id, row.name);
    unitById.set(row.id, row.unit);
  }

  const rows: ParsedRow[] = parsed.items.map((line, idx) => {
    const suggestedName =
      line.matchedIngredientName ??
      (line.matchedIngredientId != null
        ? (nameById.get(line.matchedIngredientId) ?? null)
        : null);
    return {
      id: `r-${idx}`,
      rawLine: line.rawLine,
      excludedReason: line.excludedReason,
      suggestedIngredientId: line.matchedIngredientId,
      suggestedIngredientName: suggestedName,
      confidence: line.confidence,
      quantityDelta: line.quantityDelta,
      unit: line.unit,
      productName: line.productName,
      productBrand: line.productBrand,
      unitSizeAmount: line.unitSizeAmount,
      unitSizeUnit: line.unitSizeUnit,
      price: line.price,
      priceBasis: line.priceBasis,
      priceBasisAmount: line.priceBasisAmount,
      priceBasisUnit: line.priceBasisUnit,
      purchaseQuantity: line.purchaseQuantity,
      purchaseUnit: line.purchaseUnit,
      reviewFlags: [],
    } satisfies ParsedRow;
  });

  // Deterministic override: if the raw line clearly contains one of the
  // user's existing inventory ingredient names (normalised), trust that over
  // the LLM. This fixes cases where the LLM flags "Chosen Foods Avocado Oil
  // Spray" as a non-food despite us already having an "Avocado Oil Spray" on
  // file. We never downgrade a confident LLM match; we only override when
  // the LLM has no match, or when it excluded the line.
  const matchIndex = buildInventoryMatchIndex(inventory);
  for (const row of rows) {
    if (row.suggestedIngredientId != null && !row.excludedReason) continue;
    const hit = matchReceiptLineToInventory(row.rawLine, matchIndex);
    if (!hit) continue;
    row.suggestedIngredientId = hit.ingredient.id;
    row.suggestedIngredientName = hit.ingredient.name;
    row.confidence = "high";
    row.excludedReason = null;
  }

  // Web-search enrichment: look the product up online and fill gaps. It can
  // also add meaningful product-state details like "Frozen" when the retailer
  // page confirms them. Best-effort — failures leave the row unchanged.
  const enrichmentInputs: EnrichmentInput[] = rows
    .filter((r) => !r.excludedReason)
    .map<EnrichmentInput>((r) => ({
      id: r.id,
      rawLine: r.rawLine,
      productName: r.productName,
      productBrand: r.productBrand,
      unitSizeAmount: r.unitSizeAmount,
      unitSizeUnit: r.unitSizeUnit,
      matchedIngredientName: r.suggestedIngredientName,
      inventoryUnit:
        r.suggestedIngredientId != null
          ? (unitById.get(r.suggestedIngredientId) ?? null)
          : null,
    }))
    .filter(shouldEnrichRow);

  if (enrichmentInputs.length > 0) {
    const patches = await enrichRowsWithWebSearch(enrichmentInputs);
    for (const row of rows) {
      const patch = patches.get(row.id);
      if (!patch) continue;
      if (shouldUseEnrichedProductName(row.productName, patch.productName)) {
        row.productName = patch.productName;
      }
      row.productBrand = row.productBrand ?? patch.productBrand;
      row.unitSizeAmount = row.unitSizeAmount ?? patch.unitSizeAmount;
      row.unitSizeUnit = row.unitSizeUnit ?? patch.unitSizeUnit;
    }
  }

  for (const row of rows) {
    const inventoryUnit =
      row.suggestedIngredientId != null
        ? (unitById.get(row.suggestedIngredientId) ?? null)
        : null;
    row.reviewFlags = buildReviewFlags(row, inventoryUnit);
  }

  return { ok: true, rows };
}

/* ------------------------------------------------------------------ */
/*  Apply the user's decisions for review rows                         */
/* ------------------------------------------------------------------ */

export type ReviewDecision =
  | {
      action: "ignore";
      rawLine: string;
    }
  | {
      /** Apply to an existing ingredient the user picked. */
      action: "assign";
      rawLine: string;
      ingredientId: number;
      quantityDelta: number | null;
      unit: string | null;
      productName: string | null;
      productBrand: string | null;
      unitSizeAmount: number | null;
      unitSizeUnit: string | null;
      price: number | null;
      priceBasis: ProductPriceBasis | null;
      priceBasisAmount: number | null;
      priceBasisUnit: string | null;
    }
  | {
      /** Create a new ingredient (AP title case) and log the purchase against it. */
      action: "create";
      rawLine: string;
      newIngredientName: string;
      quantityDelta: number | null;
      unit: string | null;
      productName: string | null;
      productBrand: string | null;
      unitSizeAmount: number | null;
      unitSizeUnit: string | null;
      price: number | null;
      priceBasis: ProductPriceBasis | null;
      priceBasisAmount: number | null;
      priceBasisUnit: string | null;
    };

export type ApplyReceiptReviewResult =
  | {
      ok: true;
      applied: AppliedSummary[];
      errors: { rawLine: string; error: string }[];
    }
  | { ok: false; error: string };

async function findOrCreateIngredientByName(
  supabase: Awaited<ReturnType<typeof createClient>>,
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

export async function applyReceiptReviewAction(
  decisions: ReviewDecision[],
): Promise<ApplyReceiptReviewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };

  if (!Array.isArray(decisions) || decisions.length === 0) {
    return { ok: true, applied: [], errors: [] };
  }

  const applied: AppliedSummary[] = [];
  const errors: { rawLine: string; error: string }[] = [];

  for (const decision of decisions) {
    if (decision.action === "ignore") continue;

    let ingredientId: number | null = null;
    let ingredientName = "";

    if (decision.action === "create") {
      const res = await findOrCreateIngredientByName(
        supabase,
        decision.newIngredientName,
      );
      if (!res.ok) {
        errors.push({ rawLine: decision.rawLine, error: res.error });
        continue;
      }
      ingredientId = res.ingredient.id;
      ingredientName = res.ingredient.name;
    } else {
      ingredientId = decision.ingredientId;
      const { data: ingRow } = await supabase
        .from("ingredients")
        .select("name")
        .eq("id", ingredientId)
        .maybeSingle();
      ingredientName =
        (ingRow as { name?: string } | null)?.name ?? "Ingredient";
    }

    const delta = decision.quantityDelta;
    if (delta != null && delta > 0) {
      const stockRes = await applyStockDelta(
        supabase,
        ingredientId,
        delta,
        decision.unit,
      );
      if (!stockRes.ok) {
        errors.push({ rawLine: decision.rawLine, error: stockRes.error });
        continue;
      }
    }

    if (decision.productName || decision.price != null) {
      const productName =
        decision.productName ?? ingredientName ?? "Unnamed Product";
      const productRes = await upsertPreferredProduct(
        supabase,
        ingredientId,
        {
          name: productName,
          brand: decision.productBrand,
          price: decision.price,
          priceBasis: decision.priceBasis,
          priceBasisAmount: decision.priceBasisAmount,
          priceBasisUnit: decision.priceBasisUnit,
          unitSizeAmount: decision.unitSizeAmount,
          unitSizeUnit: decision.unitSizeUnit,
        },
      );
      if (!productRes.ok) {
        errors.push({ rawLine: decision.rawLine, error: productRes.error });
        continue;
      }
    }

    applied.push({
      ingredientId,
      ingredientName,
      quantityDelta: delta ?? 0,
      unit: decision.unit,
      productName: decision.productName,
      productBrand: decision.productBrand,
      price: decision.price,
    });
  }

  if (applied.length > 0) {
    revalidatePath("/inventory");
    revalidatePath("/shop");
    revalidatePath("/recipes");
  }

  return { ok: true, applied, errors };
}
