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

function normalizeStepRow(raw: Record<string, unknown>): RecipeInstructionStepRow | null {
  const id = Number(raw.id);
  const recipe_id = Number(raw.recipe_id);
  const sort_order = Number(raw.sort_order ?? 0);
  if (!Number.isFinite(id) || !Number.isFinite(recipe_id)) return null;
  return {
    id,
    recipe_id,
    sort_order: Number.isFinite(sort_order) ? sort_order : 0,
    body: raw.body == null ? "" : String(raw.body),
    timer_seconds_low: safeInt(raw.timer_seconds_low),
    timer_seconds_high: safeInt(raw.timer_seconds_high),
    created_at: raw.created_at == null ? undefined : String(raw.created_at),
  };
}

export async function loadRecipeInstructionStepsWithLegacyMigration(
  supabase: SupabaseClient,
  recipeId: number,
  legacyInstructions: string | null,
): Promise<RecipeInstructionStepRow[]> {
  const { data: existing, error: selErr } = await supabase
    .from("recipe_instruction_steps")
    .select("id, recipe_id, sort_order, body, timer_seconds_low, timer_seconds_high, created_at")
    .eq("recipe_id", recipeId)
    .order("sort_order", { ascending: true });

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
  const inserts = parsed.map((body, sort_order) => ({
    recipe_id: recipeId,
    sort_order,
    body,
  }));

  const { data: inserted, error: insErr } = await supabase
    .from("recipe_instruction_steps")
    .insert(inserts)
    .select("id, recipe_id, sort_order, body, timer_seconds_low, timer_seconds_high, created_at");

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
