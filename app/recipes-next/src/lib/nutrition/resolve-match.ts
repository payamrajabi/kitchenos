/**
 * Score and pick the single best food match from a set of candidates.
 */

import type { FoodMatch } from "./types";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * Recall-weighted score (0 – 1) between a search query and a match
 * description.  Heavily favours matches that contain all query tokens
 * (recall) while giving a lighter bonus when the match is concise
 * (precision).  This keeps scores high even when the database description
 * is much longer than the user's query.
 */
export function scoreMatch(query: string, match: FoodMatch): number {
  const qTokens = tokenize(query);
  const mTokens = tokenize(match.description);
  if (qTokens.length === 0 || mTokens.length === 0) return 0;

  const qSet = new Set(qTokens);
  const mSet = new Set(mTokens);

  let intersection = 0;
  for (const t of qSet) {
    if (mSet.has(t)) intersection++;
  }

  const recall = intersection / qSet.size;
  const precision = intersection / mSet.size;

  return Math.min(1, Math.max(0, 0.7 * recall + 0.3 * precision));
}

export interface ResolvedMatch {
  match: FoodMatch;
  confidence: number;
  needsReview: boolean;
  notes: string | null;
}

/**
 * Pick the single canonical match or flag for manual review.
 */
export function resolveCanonicalMatch(
  query: string,
  candidates: FoodMatch[],
): ResolvedMatch | null {
  if (candidates.length === 0) return null;

  const scored = candidates
    .map((m) => ({ match: m, score: scoreMatch(query, m) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const runner = scored.length > 1 ? scored[1] : null;

  if (best.score >= 0.6) {
    const gap = runner ? best.score - runner.score : 1;
    const needsReview = gap < 0.1;
    return {
      match: best.match,
      confidence: Math.round(best.score * 100) / 100,
      needsReview,
      notes: needsReview
        ? `Ambiguous: "${best.match.description}" vs "${runner?.match.description}"`
        : null,
    };
  }

  if (best.score >= 0.3) {
    return {
      match: best.match,
      confidence: Math.round(best.score * 100) / 100,
      needsReview: true,
      notes: `Low confidence match: "${best.match.description}" (${best.score.toFixed(2)})`,
    };
  }

  return null;
}

/**
 * When CNF is missing, low-confidence, or ambiguous vs a runner-up,
 * prefer USDA **Foundation** for generic whole foods.
 */
export function shouldUseFoundationInsteadOfCnf(
  cnfResolved: ResolvedMatch | null,
  llmFlagsAmbiguous: boolean,
): boolean {
  if (!cnfResolved) return true;
  if (cnfResolved.confidence < 0.4) return true;
  if (llmFlagsAmbiguous && cnfResolved.confidence < 0.58) return true;
  if (cnfResolved.needsReview) return true;
  return false;
}
