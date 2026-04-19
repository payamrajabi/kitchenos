"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  inferBackboneDefaultsFromName,
  inferDefaultUnits,
  inferShelfLifeDefaults,
  inferStorageHintsFromName,
  INGREDIENT_TAXONOMY_SUBCATEGORIES,
  type IngredientBackboneDefaults,
  type IngredientTaxonomySubcategory,
} from "@/lib/ingredient-backbone-inference";
import type { IngredientRow } from "@/types/database";

const VALID_SUBCATEGORIES = new Set<string>(INGREDIENT_TAXONOMY_SUBCATEGORIES);

/**
 * Fields the backbone backfill can touch. Keeping this list in one place so
 * the summary counts, the update payload, and the "fields still missing"
 * signal all agree on what "backbone" means.
 */
const BACKBONE_FIELDS = [
  "taxonomy_subcategory",
  "default_units",
  "storage_hints",
  "shelf_life_counter_days",
  "shelf_life_fridge_days",
  "shelf_life_freezer_days",
  "packaged_common",
  "is_composite",
] as const;

type BackboneField = (typeof BACKBONE_FIELDS)[number];

export type BackboneBackfillFieldCounts = Record<BackboneField, number>;

export type UnmatchedIngredient = {
  id: number;
  name: string;
};

export type BackboneBackfillSummary = {
  ok: true;
  dryRun: boolean;
  examined: number;
  candidates: number;
  updated: number;
  fieldCounts: BackboneBackfillFieldCounts;
  unmatched: UnmatchedIngredient[];
};

export type BackboneBackfillError = {
  ok: false;
  error: string;
};

export type BackboneBackfillResult =
  | BackboneBackfillSummary
  | BackboneBackfillError;

type CandidateRow = Pick<
  IngredientRow,
  | "id"
  | "name"
  | "taxonomy_subcategory"
  | "default_units"
  | "storage_hints"
  | "shelf_life_counter_days"
  | "shelf_life_fridge_days"
  | "shelf_life_freezer_days"
  | "packaged_common"
  | "is_composite"
>;

/**
 * For a single row, compute the patch that would bring it up to the current
 * rule-based defaults. Only fills NULL/false where the rules produce a
 * meaningful value; never overwrites user-set data.
 *
 * Booleans are flipped false → true only. A "false" inference is treated as
 * "no information" for the purposes of this patch, so a user who manually
 * set `packaged_common = true` will never see it flipped back.
 */
function computePatchForRow(
  row: CandidateRow,
  inferred: IngredientBackboneDefaults,
): Partial<Record<BackboneField, unknown>> {
  const patch: Partial<Record<BackboneField, unknown>> = {};

  if (row.taxonomy_subcategory == null && inferred.taxonomy_subcategory) {
    patch.taxonomy_subcategory = inferred.taxonomy_subcategory;
  }
  if (
    (row.default_units == null || row.default_units.length === 0) &&
    inferred.default_units &&
    inferred.default_units.length > 0
  ) {
    patch.default_units = inferred.default_units;
  }
  if (
    (row.storage_hints == null || row.storage_hints.length === 0) &&
    inferred.storage_hints &&
    inferred.storage_hints.length > 0
  ) {
    patch.storage_hints = inferred.storage_hints;
  }
  if (
    row.shelf_life_counter_days == null &&
    inferred.shelf_life_counter_days != null
  ) {
    patch.shelf_life_counter_days = inferred.shelf_life_counter_days;
  }
  if (
    row.shelf_life_fridge_days == null &&
    inferred.shelf_life_fridge_days != null
  ) {
    patch.shelf_life_fridge_days = inferred.shelf_life_fridge_days;
  }
  if (
    row.shelf_life_freezer_days == null &&
    inferred.shelf_life_freezer_days != null
  ) {
    patch.shelf_life_freezer_days = inferred.shelf_life_freezer_days;
  }
  if (!row.packaged_common && inferred.packaged_common) {
    patch.packaged_common = true;
  }
  if (!row.is_composite && inferred.is_composite) {
    patch.is_composite = true;
  }

  return patch;
}

function emptyFieldCounts(): BackboneBackfillFieldCounts {
  return {
    taxonomy_subcategory: 0,
    default_units: 0,
    storage_hints: 0,
    shelf_life_counter_days: 0,
    shelf_life_fridge_days: 0,
    shelf_life_freezer_days: 0,
    packaged_common: 0,
    is_composite: 0,
  };
}

export async function backfillIngredientBackboneAction(options?: {
  dryRun?: boolean;
}): Promise<BackboneBackfillResult> {
  const dryRun = options?.dryRun === true;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const { data: rows, error } = await supabase
    .from("ingredients")
    .select(
      "id, name, taxonomy_subcategory, default_units, storage_hints, shelf_life_counter_days, shelf_life_fridge_days, shelf_life_freezer_days, packaged_common, is_composite",
    )
    .order("id");

  if (error) return { ok: false as const, error: error.message };

  const candidates = (rows ?? []) as CandidateRow[];
  const fieldCounts = emptyFieldCounts();
  const unmatched: UnmatchedIngredient[] = [];
  let updated = 0;
  let candidateCount = 0;

  for (const row of candidates) {
    const inferred = inferBackboneDefaultsFromName(row.name);

    const nothingInferred =
      inferred.taxonomy_subcategory == null &&
      (!inferred.default_units || inferred.default_units.length === 0) &&
      (!inferred.storage_hints || inferred.storage_hints.length === 0) &&
      inferred.shelf_life_counter_days == null &&
      inferred.shelf_life_fridge_days == null &&
      inferred.shelf_life_freezer_days == null &&
      inferred.packaged_common === false &&
      inferred.is_composite === false;

    const hasAnyField =
      row.taxonomy_subcategory != null ||
      (row.default_units != null && row.default_units.length > 0) ||
      (row.storage_hints != null && row.storage_hints.length > 0) ||
      row.shelf_life_counter_days != null ||
      row.shelf_life_fridge_days != null ||
      row.shelf_life_freezer_days != null ||
      row.packaged_common === true ||
      row.is_composite === true;

    if (nothingInferred && !hasAnyField) {
      unmatched.push({ id: row.id, name: row.name });
      continue;
    }

    const patch = computePatchForRow(row, inferred);
    const patchKeys = Object.keys(patch) as BackboneField[];
    if (patchKeys.length === 0) continue;

    candidateCount++;
    for (const key of patchKeys) fieldCounts[key]++;

    if (dryRun) continue;

    const { error: updErr } = await supabase
      .from("ingredients")
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (updErr) {
      return { ok: false as const, error: updErr.message };
    }

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
    examined: candidates.length,
    candidates: candidateCount,
    updated,
    fieldCounts,
    unmatched,
  };
}

/* -------------------------------------------------------------------------- */
/*  LLM-assisted taxonomy suggestion for unmatched ingredients                */
/* -------------------------------------------------------------------------- */

export type TaxonomySuggestionCandidate = {
  subcategory: IngredientTaxonomySubcategory;
  confidence: number;
  rationale: string;
};

export type TaxonomySuggestionEntry = {
  id: number;
  name: string;
  candidates: TaxonomySuggestionCandidate[];
};

export type TaxonomySuggestionResult =
  | { ok: true; suggestions: TaxonomySuggestionEntry[] }
  | { ok: false; error: string };

function tryParseJsonObject(content: string): Record<string, unknown> | null {
  const trimmed = content.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```/im.exec(trimmed);
  const blob = fence?.[1]?.trim() ?? trimmed;
  for (const candidate of [blob, trimmed]) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

function sanitizeCandidate(raw: unknown): TaxonomySuggestionCandidate | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const sub = typeof r.subcategory === "string" ? r.subcategory.trim() : "";
  if (!VALID_SUBCATEGORIES.has(sub)) return null;
  const conf =
    typeof r.confidence === "number" && Number.isFinite(r.confidence)
      ? Math.min(1, Math.max(0, r.confidence))
      : 0.5;
  const rationale =
    typeof r.rationale === "string" ? r.rationale.slice(0, 160) : "";
  return {
    subcategory: sub as IngredientTaxonomySubcategory,
    confidence: conf,
    rationale,
  };
}

function buildSuggestionSystemPrompt(): string {
  const list = INGREDIENT_TAXONOMY_SUBCATEGORIES.join(", ");
  return `You classify home-kitchen ingredient names into a fixed taxonomy of culinary subcategories.

For each name you receive, return up to 3 best-fit subcategories, ordered by confidence (highest first). If nothing fits well, return an empty array for that name.

The ONLY allowed subcategory values are:
${list}

Rules:
- subcategory MUST be spelled EXACTLY as listed above. Any other value is invalid and will be rejected.
- Prefer the most specific subcategory when multiple apply (e.g. "canned black beans" -> Canned Legumes, not Dried Legumes).
- For processed/prepared forms, the processed form wins ("chicken broth" -> Broths & Stocks, not Poultry).
- confidence: 0.9+ = near-certain; 0.7-0.9 = plausible; 0.5-0.7 = weak; below 0.5 = skip unless no better option.
- rationale: one short sentence (under 140 chars).
- If the name is clearly not food (e.g. "Ice Cubes", "Fresh Clean Snow"), return an empty candidates array.

Return one JSON object: { "suggestions": [ { "name": "<exact input name>", "candidates": [ { "subcategory": "...", "confidence": 0.0-1.0, "rationale": "..." } ] } ] }`;
}

export async function suggestTaxonomyForUnmatchedAction(
  items: UnmatchedIngredient[],
): Promise<TaxonomySuggestionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  if (!items.length) return { ok: true as const, suggestions: [] };

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false as const,
      error: "OPENAI_API_KEY is not set. AI suggestions are unavailable.",
    };
  }

  const uniqueByName = new Map<string, UnmatchedIngredient>();
  for (const item of items) {
    if (!item?.name) continue;
    const key = item.name.trim().toLowerCase();
    if (!key) continue;
    if (!uniqueByName.has(key)) uniqueByName.set(key, item);
  }

  const names = Array.from(uniqueByName.values()).map((i) => i.name);
  if (!names.length) return { ok: true as const, suggestions: [] };

  const userMessage = JSON.stringify({ names });

  let content: string;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSuggestionSystemPrompt() },
          { role: "user", content: userMessage },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      return {
        ok: false as const,
        error: `LLM request failed (${res.status}).`,
      };
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    content = data.choices?.[0]?.message?.content ?? "";
    if (!content) {
      return { ok: false as const, error: "Empty response from LLM." };
    }
  } catch (err) {
    return {
      ok: false as const,
      error:
        err instanceof Error
          ? err.message
          : "Network error calling the LLM.",
    };
  }

  const parsed = tryParseJsonObject(content);
  const rawSuggestions = parsed?.suggestions;
  if (!Array.isArray(rawSuggestions)) {
    return {
      ok: false as const,
      error: "LLM response did not contain a suggestions array.",
    };
  }

  const byName = new Map<string, TaxonomySuggestionCandidate[]>();
  for (const entry of rawSuggestions) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const name = typeof e.name === "string" ? e.name.trim() : "";
    if (!name) continue;
    const rawCandidates = Array.isArray(e.candidates) ? e.candidates : [];
    const candidates: TaxonomySuggestionCandidate[] = [];
    for (const raw of rawCandidates) {
      const c = sanitizeCandidate(raw);
      if (c) candidates.push(c);
      if (candidates.length >= 3) break;
    }
    byName.set(name.toLowerCase(), candidates);
  }

  const suggestions: TaxonomySuggestionEntry[] = [];
  for (const item of uniqueByName.values()) {
    const cands = byName.get(item.name.trim().toLowerCase()) ?? [];
    suggestions.push({ id: item.id, name: item.name, candidates: cands });
  }

  return { ok: true as const, suggestions };
}

/* -------------------------------------------------------------------------- */
/*  Accept a single taxonomy suggestion for an ingredient                     */
/* -------------------------------------------------------------------------- */

export type AcceptTaxonomyResult =
  | { ok: true; filledFields: BackboneField[] }
  | { ok: false; error: string };

export async function acceptTaxonomySuggestionAction(
  ingredientId: number,
  subcategory: string,
): Promise<AcceptTaxonomyResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  if (!VALID_SUBCATEGORIES.has(subcategory)) {
    return { ok: false as const, error: "Unknown subcategory." };
  }
  const sub = subcategory as IngredientTaxonomySubcategory;

  const { data: row, error: fetchErr } = await supabase
    .from("ingredients")
    .select(
      "id, name, taxonomy_subcategory, default_units, storage_hints, shelf_life_counter_days, shelf_life_fridge_days, shelf_life_freezer_days",
    )
    .eq("id", ingredientId)
    .maybeSingle();

  if (fetchErr || !row) {
    return { ok: false as const, error: "Ingredient not found." };
  }

  const typed = row as CandidateRow;
  const patch: Partial<Record<BackboneField, unknown>> = {};
  const filled: BackboneField[] = [];

  if (typed.taxonomy_subcategory == null) {
    patch.taxonomy_subcategory = sub;
    filled.push("taxonomy_subcategory");
  }

  const storageHints = inferStorageHintsFromName(String(typed.name ?? ""), sub);
  if (
    (typed.storage_hints == null || typed.storage_hints.length === 0) &&
    storageHints &&
    storageHints.length > 0
  ) {
    patch.storage_hints = storageHints;
    filled.push("storage_hints");
  }

  const defaultUnits = inferDefaultUnits(sub);
  if (
    (typed.default_units == null || typed.default_units.length === 0) &&
    defaultUnits &&
    defaultUnits.length > 0
  ) {
    patch.default_units = defaultUnits;
    filled.push("default_units");
  }

  const shelfLife = inferShelfLifeDefaults(sub);
  if (
    typed.shelf_life_counter_days == null &&
    shelfLife.counter != null
  ) {
    patch.shelf_life_counter_days = shelfLife.counter;
    filled.push("shelf_life_counter_days");
  }
  if (
    typed.shelf_life_fridge_days == null &&
    shelfLife.fridge != null
  ) {
    patch.shelf_life_fridge_days = shelfLife.fridge;
    filled.push("shelf_life_fridge_days");
  }
  if (
    typed.shelf_life_freezer_days == null &&
    shelfLife.freezer != null
  ) {
    patch.shelf_life_freezer_days = shelfLife.freezer;
    filled.push("shelf_life_freezer_days");
  }

  if (Object.keys(patch).length === 0) {
    return { ok: true as const, filledFields: [] };
  }

  const { error: updErr } = await supabase
    .from("ingredients")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", ingredientId);

  if (updErr) return { ok: false as const, error: updErr.message };

  revalidatePath("/inventory");
  revalidatePath("/shop");
  revalidatePath("/recipes");
  revalidatePath("/admin/ingredient-autofill");

  return { ok: true as const, filledFields: filled };
}
