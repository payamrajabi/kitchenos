/**
 * Ingredient nutrition autofill pipeline.
 *
 * Macros are **always** from CNF / USDA APIs (per 100 g). An optional LLM only
 * refines search queries and flags ambiguity — it never supplies calorie or macro numbers.
 * Count-based “per piece” understanding uses **FDC foodPortions** gram weights only.
 */

import type {
  NutritionPipelineResult,
  PipelineInput,
  FoodMatch,
  NutritionSources,
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
} from "./usda-client";
import { pickEdibleGramWeightFromPortions } from "./portion-weight";
import {
  ingredientNutritionLlmAssist,
  mergeAssistQueries,
} from "./llm-ingredient-assist";
import { resolveCanonicalMatch, shouldUseFoundationInsteadOfCnf } from "./resolve-match";
import { searchCNF } from "./cnf-client";

export type { NutritionPipelineResult, PipelineInput };

const DEFAULT_SOURCES: NutritionSources = { searchUSDA, searchCNF };

export type PipelineDeps = {
  fetchFoodDetail?: typeof fetchUSDAFoodDetail;
  llmAssist?: typeof ingredientNutritionLlmAssist;
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
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function macrosFromMatch(m: FoodMatch) {
  return {
    kcal: round1(m.kcalPer100g),
    fat_g: round1(m.fatPer100g),
    protein_g: round1(m.proteinPer100g),
    carbs_g: round1(m.carbsPer100g),
  };
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
      return emptyResult(
        input.ingredientId,
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
        return emptyResult(
          input.ingredientId,
          useFoundation
            ? `No Canadian Nutrient File match and no USDA Foundation match for "${normalized}".`
            : `No USDA Foundation match for "${normalized}".`,
        );
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
  if (isCountBasedUnit(input.stockUnit)) {
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
  };
}
