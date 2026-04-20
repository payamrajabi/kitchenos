/**
 * Meal-suggestion rules — the SINGLE SOURCE OF TRUTH.
 *
 * Every rule that shapes how we auto-fill the 7-day calendar lives in this
 * file. A rule contributes two things:
 *   1. A natural-language line we include in the LLM prompt so the model
 *      tries to respect it up-front.
 *   2. A programmatic `validate()` that we run *after* the LLM responds, so
 *      we can reject bad picks and fall back to the next candidate.
 *
 * To add a new rule later (e.g. "no fish on Fridays", "hit protein target"),
 * add a new object to `MEAL_SUGGESTION_RULES` below. Nothing else needs to
 * change — the prompt builder and the validator both pick it up automatically.
 */

import type { PlanSlotKey } from "@/lib/meal-plan";
import {
  normalizeMealTypesFromDb,
  planSlotPreferredRecipeTags,
} from "@/lib/recipe-meal-types";

/** Meal types by recipe id, for rules that need to look up recipe metadata. */
export type RecipeMealTypeLookup = (
  recipeId: number | null,
) => readonly string[];

/** A candidate the LLM returned (or we're about to insert). */
export type CandidateUnderTest = {
  recipeId: number | null;
  label: string;
  recipeTitle?: string | null;
};

/** A meal already placed on the calendar (real or existing suggestion). */
export type PlacedMeal = {
  date: string;
  slotKey: PlanSlotKey;
  recipeId: number | null;
  label: string | null;
};

export type RuleContext = {
  /** Day + slot this candidate is being considered for. */
  date: string;
  slotKey: PlanSlotKey;
  /** Every meal currently on the calendar in the look-around window. */
  placedMeals: readonly PlacedMeal[];
  /** Look-up meal_types for a recipe id. */
  getRecipeMealTypes: RecipeMealTypeLookup;
};

export type SuggestionRule = {
  id: string;
  /** Short human-readable description, shown in UI/logs. */
  description: string;
  /** Line injected into the LLM system prompt. */
  promptLine: string;
  /** Returns true when the candidate is acceptable. */
  validate: (candidate: CandidateUnderTest, ctx: RuleContext) => boolean;
};

// ---------------------------------------------------------------------------
// Rule 1: each pick must be appropriate for the slot.
// ---------------------------------------------------------------------------
const MEAL_TYPE_MATCHES_SLOT: SuggestionRule = {
  id: "meal_type_matches_slot",
  description:
    "Each suggestion must fit the slot's meal type (e.g. a breakfast slot only gets breakfast-appropriate food).",
  promptLine:
    "Every pick must fit its slot. Breakfast slots get breakfast foods, lunch slots get lunch foods, dinner slots get dinner foods, snack slots get snack foods, and dessert slots get desserts. Never put a dinner in a breakfast slot.",
  validate: (candidate, ctx) => {
    const preferred = planSlotPreferredRecipeTags(ctx.slotKey);
    // Label-only (no recipe_id): trust the LLM — we have nothing to compare.
    if (candidate.recipeId == null) return true;
    const tags = normalizeMealTypesFromDb(
      ctx.getRecipeMealTypes(candidate.recipeId),
    );
    // If the recipe has no meal_types tagged at all, don't block it.
    if (tags.length === 0) return true;
    return tags.some((t) => (preferred as readonly string[]).includes(t));
  },
};

// ---------------------------------------------------------------------------
// Rule 2: no repeating the same food within 4 days (either direction).
// ---------------------------------------------------------------------------
const NO_REPEAT_WITHIN_DAYS = 4;

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(`${aIso}T12:00:00Z`).getTime();
  const b = new Date(`${bIso}T12:00:00Z`).getTime();
  return Math.round(Math.abs(a - b) / (24 * 60 * 60 * 1000));
}

function normalizeLabelKey(label: string | null | undefined): string {
  return String(label ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

const NO_REPEAT_WITHIN_4_DAYS: SuggestionRule = {
  id: "no_repeat_within_4_days",
  description: `Do not suggest the same food twice within ${NO_REPEAT_WITHIN_DAYS} days.`,
  promptLine: `Never repeat the same food within ${NO_REPEAT_WITHIN_DAYS} days. If the user already has "Chicken Tacos" on Monday, do not suggest it again until Friday at the earliest. Check both recipe name and ingredient label.`,
  validate: (candidate, ctx) => {
    const candidateKey = normalizeLabelKey(candidate.label);
    for (const placed of ctx.placedMeals) {
      if (daysBetween(placed.date, ctx.date) > NO_REPEAT_WITHIN_DAYS) continue;
      if (
        candidate.recipeId != null &&
        placed.recipeId != null &&
        candidate.recipeId === placed.recipeId
      ) {
        return false;
      }
      if (
        candidateKey &&
        candidateKey === normalizeLabelKey(placed.label)
      ) {
        return false;
      }
    }
    return true;
  },
};

// ---------------------------------------------------------------------------
// The registry. Add new rules here — prompt + validator update in lockstep.
// ---------------------------------------------------------------------------
export const MEAL_SUGGESTION_RULES: readonly SuggestionRule[] = [
  MEAL_TYPE_MATCHES_SLOT,
  NO_REPEAT_WITHIN_4_DAYS,
] as const;

/**
 * Returns the rule block we inject into the LLM system prompt. Keep it short
 * and numbered so the model can reference it back.
 */
export function describeRulesForPrompt(): string {
  return MEAL_SUGGESTION_RULES.map(
    (rule, i) => `${i + 1}. ${rule.promptLine}`,
  ).join("\n");
}

/**
 * Runs every rule against a candidate. Returns the first failing rule's id,
 * or null if the candidate is acceptable.
 */
export function validateSuggestion(
  candidate: CandidateUnderTest,
  ctx: RuleContext,
): { ok: true } | { ok: false; failedRuleId: string } {
  for (const rule of MEAL_SUGGESTION_RULES) {
    if (!rule.validate(candidate, ctx)) {
      return { ok: false, failedRuleId: rule.id };
    }
  }
  return { ok: true };
}

/** Human-readable summary for logs / debug UI. */
export function summarizeRules(): string {
  return MEAL_SUGGESTION_RULES.map((r) => `- ${r.id}: ${r.description}`).join(
    "\n",
  );
}
