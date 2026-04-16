/**
 * Ingredient nutrition autofill pipeline.
 *
 * Macros are taken from CNF / USDA when a match is found (per 100 g). An optional LLM
 * refines search queries first. If **no** official row qualifies, a second LLM step may
 * supply approximate per-100 g values (always flagged for review, never treated as label data).
 * Count-based “per piece” grams prefer **FDC foodPortions**; the estimate LLM may suggest
 * a typical gram weight when the stock unit is count-like.
 */

import {
  NUTRITION_SOURCE_LLM_ESTIMATE,
  type NutritionPipelineResult,
  type PipelineInput,
  type FoodMatch,
  type NutritionSources,
  type NutrientValue,
  type PortionValue,
} from "./types";
import {
  normalizeIngredientName,
  classifyIngredient,
  buildSearchQuery,
} from "./normalize";
import { isCountBasedUnit } from "./unit-basis";
import {
  fetchUSDAFoodDetail,
  searchUSDA,
  type ResolvedNutrient,
} from "./usda-client";
import { pickEdibleGramWeightFromPortions } from "./portion-weight";
import type { USDAFoodPortion } from "./usda-client";
import {
  ingredientNutritionLlmAssist,
  mergeAssistQueries,
} from "./llm-ingredient-assist";
import { ingredientNutritionLlmEstimate } from "./llm-nutrition-estimate";
import { resolveCanonicalMatch, shouldUseFoundationInsteadOfCnf } from "./resolve-match";
import { searchCNF } from "./cnf-client";

export type { NutritionPipelineResult, PipelineInput };

const DEFAULT_SOURCES: NutritionSources = { searchUSDA, searchCNF };

export type PipelineDeps = {
  fetchFoodDetail?: typeof fetchUSDAFoodDetail;
  llmAssist?: typeof ingredientNutritionLlmAssist;
  llmEstimate?: typeof ingredientNutritionLlmEstimate;
};

function emptyResult(
  ingredientId: number,
  notes: string | null,
): NutritionPipelineResult {
  return {
    ingredientId,
    status: "no_match",
    kcal: null,
    fat_g: null,
    protein_g: null,
    carbs_g: null,
    basis: null,
    canonical_unit_weight_g: null,
    source_name: null,
    source_record_id: null,
    source_url: null,
    confidence: 0,
    needs_review: false,
    notes,
    micronutrients: [],
    portions: [],
    food_type: "generic",
  };
}

function toNutrientValues(resolved: ResolvedNutrient[]): NutrientValue[] {
  return resolved.map((r) => ({
    nutrientId: r.nutrientId,
    name: r.name,
    value: r.value,
    unit: r.unit,
  }));
}

function toPortionValues(
  portions: USDAFoodPortion[] | undefined,
  source: string,
): PortionValue[] {
  if (!Array.isArray(portions)) return [];
  const results: PortionValue[] = [];
  for (const p of portions) {
    const g = p.gramWeight;
    if (typeof g !== "number" || !Number.isFinite(g) || g <= 0) continue;
    const desc =
      [p.modifier, p.portionDescription, p.measureUnit]
        .filter(Boolean)
        .join(" ")
        .trim() || "1 serving";
    results.push({
      gramWeight: Math.round(g * 10) / 10,
      description: desc,
      source,
      isDefault: results.length === 0,
    });
  }
  return results;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function macrosFromMatch(m: FoodMatch) {
  const fat_g = round1(m.fatPer100g);
  const protein_g = round1(m.proteinPer100g);
  const carbs_g = round1(m.carbsPer100g);
  let kcal = round1(m.kcalPer100g);
  if (
    (!Number.isFinite(kcal) || kcal <= 0) &&
    (fat_g > 0 || protein_g > 0 || carbs_g > 0)
  ) {
    kcal = round1(9 * fat_g + 4 * protein_g + 4 * carbs_g);
  }
  return { kcal, fat_g, protein_g, carbs_g };
}

/**
 * For count units when macros come from CNF (no FDC id): find a Foundation food
 * and use its **portions only** for edible gram weight — not for macros.
 */
async function edibleGramsForCountUnit(
  normalizedName: string,
  foundationSearchQuery: string,
  macroMatch: FoodMatch,
  sources: NutritionSources,
  fetchDetail: NonNullable<PipelineDeps["fetchFoodDetail"]>,
): Promise<number | null> {
  if (macroMatch.sourceName === "USDA FoodData Central") {
    const d = await fetchDetail(macroMatch.sourceRecordId);
    const w = pickEdibleGramWeightFromPortions(d?.foodPortions ?? [], {
      normalizedName,
    });
    if (w != null) return w;
  }

  const foundationHits = await sources.searchUSDA(foundationSearchQuery, {
    dataTypes: ["Foundation"],
    pageSize: 8,
  });
  const fr = resolveCanonicalMatch(foundationSearchQuery, foundationHits);
  if (!fr) return null;
  const d2 = await fetchDetail(fr.match.sourceRecordId);
  return pickEdibleGramWeightFromPortions(d2?.foodPortions ?? [], {
    normalizedName,
  });
}

function combineNotes(...parts: (string | null | undefined)[]): string | null {
  const s = parts.filter(Boolean).join(" ").trim();
  return s === "" ? null : s;
}

function hintWhenLlmDidNotFill(): string {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return "Approximate AI fallback did not run: set OPENAI_API_KEY in the server environment (e.g. .env.local) so we can estimate nutrition when reference databases have no match.";
  }
  return "Approximate AI fallback did not return usable numbers, or the OpenAI request failed. Check API key, billing/quota, and network, then try again.";
}

/**
 * After USDA/CNF find no row: try LLM estimate, otherwise `no_match` with notes that
 * explain both the official miss **and** why AI did not populate (e.g. missing API key).
 */
async function resultAfterOfficialMiss(
  input: PipelineInput,
  deps: PipelineDeps,
  officialFailureNote: string,
): Promise<NutritionPipelineResult> {
  const estimateFn = deps.llmEstimate ?? ingredientNutritionLlmEstimate;
  const est = await estimateFn({
    name: input.name,
    brand: input.brand,
    stockUnit: input.stockUnit,
  });
  if (!est) {
    return emptyResult(
      input.ingredientId,
      combineNotes(officialFailureNote, hintWhenLlmDidNotFill()),
    );
  }

  let canonical_unit_weight_g: number | null = null;
  if (isCountBasedUnit(input.stockUnit) && est.gramsPerCountUnit != null) {
    canonical_unit_weight_g = est.gramsPerCountUnit;
  }

  const pieceNote =
    isCountBasedUnit(input.stockUnit) && canonical_unit_weight_g == null
      ? "No typical piece weight estimated — macros are per 100 g only."
      : null;

  const notes = combineNotes(
    officialFailureNote,
    "Approximate AI estimate (not from FoodData Central or CNF) — verify when possible.",
    est.rationale,
    pieceNote,
  );

  return {
    ingredientId: input.ingredientId,
    status: "needs_review",
    kcal: est.kcalPer100g,
    fat_g: est.fatPer100g,
    protein_g: est.proteinPer100g,
    carbs_g: est.carbsPer100g,
    basis: "per_100g",
    canonical_unit_weight_g,
    source_name: NUTRITION_SOURCE_LLM_ESTIMATE,
    source_record_id: null,
    source_url: null,
    confidence: 0.35,
    needs_review: true,
    notes,
    micronutrients: [],
    portions: [],
    food_type: input.brand ? "branded" : "generic",
  };
}

export async function runNutritionPipeline(
  input: PipelineInput,
  sources: NutritionSources = DEFAULT_SOURCES,
  deps: PipelineDeps = {},
): Promise<NutritionPipelineResult> {
  const fetchDetail = deps.fetchFoodDetail ?? fetchUSDAFoodDetail;
  const llmAssist = deps.llmAssist ?? ingredientNutritionLlmAssist;

  const normalized = normalizeIngredientName(input.name);
  if (!normalized) {
    return emptyResult(input.ingredientId, "Empty ingredient name.");
  }

  const deterministicFallback = buildSearchQuery(normalized);
  const llmRaw = await llmAssist({
    name: input.name,
    brand: input.brand,
  });
  const assist = mergeAssistQueries(llmRaw, deterministicFallback);

  const kind = classifyIngredient(normalized, input.brand);

  let match: FoodMatch;
  let resolved: ReturnType<typeof resolveCanonicalMatch>;
  let extraNotes: string | null = null;

  if (kind === "branded") {
    const q = assist.fdcBrandedSearchQuery;
    let candidates = await sources.searchUSDA(q, {
      dataTypes: ["Branded"],
      brandOwner: input.brand ?? undefined,
      pageSize: 10,
    });
    if (candidates.length === 0) {
      candidates = await sources.searchUSDA(q, { dataTypes: ["Branded"], pageSize: 10 });
    }
    resolved = resolveCanonicalMatch(q, candidates);
    if (!resolved) {
      return await resultAfterOfficialMiss(
        input,
        deps,
        `No branded label match for "${normalized}".`,
      );
    }
    match = resolved.match;
    extraNotes = combineNotes(
      resolved.notes,
      assist.likelyAmbiguous ? assist.ambiguityNote : null,
    );
  } else {
    const cnfQ = assist.cnfSearchQuery;
    const cnfCandidates = await sources.searchCNF(cnfQ);
    const cnfResolved = resolveCanonicalMatch(cnfQ, cnfCandidates);

    const useFoundation = shouldUseFoundationInsteadOfCnf(
      cnfResolved,
      assist.likelyAmbiguous,
    );

    if (!useFoundation && cnfResolved) {
      match = cnfResolved.match;
      resolved = cnfResolved;
      extraNotes = combineNotes(
        cnfResolved.notes,
        assist.likelyAmbiguous ? assist.ambiguityNote : null,
      );
    } else {
      const fdcQ = assist.fdcFoundationSearchQuery;
      const foundationCandidates = await sources.searchUSDA(fdcQ, {
        dataTypes: ["Foundation"],
        pageSize: 10,
      });
      resolved = resolveCanonicalMatch(fdcQ, foundationCandidates);
      if (!resolved) {
        const officialNote = useFoundation
          ? `No Canadian Nutrient File match and no USDA Foundation match for "${normalized}".`
          : `No USDA Foundation match for "${normalized}".`;
        return await resultAfterOfficialMiss(input, deps, officialNote);
      }
      match = resolved.match;
      extraNotes = combineNotes(
        resolved.notes,
        useFoundation && cnfResolved
          ? `CNF skipped or coarse; using USDA Foundation.`
          : null,
        assist.likelyAmbiguous ? assist.ambiguityNote : null,
      );
    }
  }

  const macros = macrosFromMatch(match);

  let canonical_unit_weight_g: number | null = null;
  let micronutrients: NutrientValue[] = [];
  let portions: PortionValue[] = [];

  // Always fetch USDA detail for micronutrients + portions when the match is USDA.
  if (match.sourceName === "USDA FoodData Central") {
    const detail = await fetchDetail(match.sourceRecordId);
    if (detail) {
      micronutrients = toNutrientValues(detail.micronutrients);
      portions = toPortionValues(detail.foodPortions, match.sourceName);
      if (isCountBasedUnit(input.stockUnit)) {
        canonical_unit_weight_g = pickEdibleGramWeightFromPortions(
          detail.foodPortions ?? [],
          { normalizedName: normalized },
        );
      }
    }
  } else if (isCountBasedUnit(input.stockUnit)) {
    canonical_unit_weight_g = await edibleGramsForCountUnit(
      normalized,
      assist.fdcFoundationSearchQuery,
      match,
      sources,
      fetchDetail,
    );
  }

  const needs_review =
    Boolean(resolved?.needsReview) ||
    assist.likelyAmbiguous ||
    (isCountBasedUnit(input.stockUnit) && canonical_unit_weight_g == null);

  const status = needs_review ? "needs_review" : "filled";

  const notes = combineNotes(
    extraNotes,
    isCountBasedUnit(input.stockUnit) && canonical_unit_weight_g == null
      ? "Count-based stock unit but no FDC portion weight found — macros are per 100 g only."
      : null,
  );

  const food_type = kind === "branded" ? "branded" as const : "generic" as const;

  return {
    ingredientId: input.ingredientId,
    status,
    kcal: macros.kcal,
    fat_g: macros.fat_g,
    protein_g: macros.protein_g,
    carbs_g: macros.carbs_g,
    basis: "per_100g",
    canonical_unit_weight_g,
    source_name: match.sourceName,
    source_record_id: match.sourceRecordId,
    source_url: match.sourceUrl,
    confidence: resolved?.confidence ?? 0,
    needs_review,
    notes,
    micronutrients,
    portions,
    food_type,
  };
}
