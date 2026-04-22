import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatInstructionStepsToRecipeText,
  parseLegacyInstructionsToSteps,
} from "@/lib/legacy-instructions-parse";
import type { RecipeInstructionStepRow } from "@/types/database";

function safeInt(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const INSTRUCTION_STEP_SELECT =
  "id, recipe_id, step_number, heading, text, timer_seconds_low, timer_seconds_high, created_at";

function normalizeStepRow(raw: Record<string, unknown>): RecipeInstructionStepRow | null {
  const id = Number(raw.id);
  const recipe_id = Number(raw.recipe_id);
  const step_number = Number(raw.step_number ?? 1);
  if (!Number.isFinite(id) || !Number.isFinite(recipe_id)) return null;
  const rawHeading = raw.heading;
  const heading =
    rawHeading == null
      ? null
      : (() => {
          const s = String(rawHeading).trim();
          return s.length > 0 ? s : null;
        })();
  return {
    id,
    recipe_id,
    step_number: Number.isFinite(step_number) ? step_number : 1,
    heading,
    text: raw.text == null ? "" : String(raw.text),
    timer_seconds_low: safeInt(raw.timer_seconds_low),
    timer_seconds_high: safeInt(raw.timer_seconds_high),
    created_at: raw.created_at == null ? undefined : String(raw.created_at),
  };
}

/**
 * Load all instruction steps for a recipe, back-filling the relational table
 * from the legacy flat `recipes.instructions` text blob on first read. Steps
 * are 1-based and stored under `step_number` / `text`.
 */
export async function loadRecipeInstructionStepsWithLegacyMigration(
  supabase: SupabaseClient,
  recipeId: number,
  legacyInstructions: string | null,
): Promise<RecipeInstructionStepRow[]> {
  const { data: existing, error: selErr } = await supabase
    .from("recipe_instruction_steps")
    .select(INSTRUCTION_STEP_SELECT)
    .eq("recipe_id", recipeId)
    .order("step_number", { ascending: true });

  if (selErr) {
    return [];
  }

  const normalized = (existing ?? [])
    .map((row) => normalizeStepRow(row as Record<string, unknown>))
    .filter((r): r is RecipeInstructionStepRow => r != null);

  if (normalized.length > 0) {
    return normalized;
  }

  const parsed = parseLegacyInstructionsToSteps(legacyInstructions ?? "");
  if (parsed.length === 0) {
    return [];
  }

  const stamp = new Date().toISOString();
  const inserts = parsed.map((text, idx) => ({
    recipe_id: recipeId,
    step_number: idx + 1,
    text,
  }));

  const { data: inserted, error: insErr } = await supabase
    .from("recipe_instruction_steps")
    .insert(inserts)
    .select(INSTRUCTION_STEP_SELECT);

  if (insErr || !inserted?.length) {
    return [];
  }

  const synced = formatInstructionStepsToRecipeText(parsed);
  await supabase
    .from("recipes")
    .update({ instructions: synced || null, updated_at: stamp })
    .eq("id", recipeId);

  return inserted
    .map((row) => normalizeStepRow(row as Record<string, unknown>))
    .filter((r): r is RecipeInstructionStepRow => r != null);
}
