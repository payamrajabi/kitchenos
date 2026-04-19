"use server";

import { createClient } from "@/lib/supabase/server";
import { runNutritionPipeline } from "@/lib/nutrition/pipeline";
import type { PipelineInput, NutritionPipelineResult } from "@/lib/nutrition/types";
import { revalidatePath } from "next/cache";
import { isNutritionEffectivelyEmpty } from "@/lib/inventory-nutrition-display";

/**
 * Persist micronutrients and portions from a pipeline result into
 * the new ingredient_nutrients / ingredient_portions tables.
 */
async function persistEnrichedNutrition(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ingredientId: number,
  result: NutritionPipelineResult,
) {
  if (result.micronutrients.length > 0) {
    await supabase
      .from("ingredient_nutrients")
      .delete()
      .eq("ingredient_id", ingredientId);

    await supabase.from("ingredient_nutrients").insert(
      result.micronutrients.map((n) => ({
        ingredient_id: ingredientId,
        nutrient_id: n.nutrientId,
        nutrient_name: n.name,
        value: n.value,
        unit: n.unit,
      })),
    );
  }

  if (result.portions.length > 0) {
    await supabase
      .from("ingredient_portions")
      .delete()
      .eq("ingredient_id", ingredientId);

    await supabase.from("ingredient_portions").insert(
      result.portions.map((p) => ({
        ingredient_id: ingredientId,
        gram_weight: p.gramWeight,
        description: p.description,
        source: p.source,
        is_default: p.isDefault,
      })),
    );
  }
}

/**
 * Full autofill action — callable from a UI button or programmatically.
 * Fetches the ingredient, checks if nutrition is empty, runs the pipeline,
 * and persists the result with full provenance.
 */
export async function autofillIngredientNutritionAction(
  ingredientId: number,
  options?: { force?: boolean },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const { data: ingredient, error: fetchErr } = await supabase
    .from("ingredients")
    .select(
      "id, name, brand_or_manufacturer, kcal, fat_g, protein_g, carbs_g, canonical_unit_weight_g, density_g_per_ml",
    )
    .eq("id", ingredientId)
    .maybeSingle();

  if (fetchErr || !ingredient) {
    return { ok: false as const, error: "Ingredient not found." };
  }

  const force = options?.force === true;
  if (!force && !isNutritionEffectivelyEmpty(ingredient)) {
    return {
      ok: true as const,
      skipped: true,
      reason: "Nutrition already filled.",
    };
  }

  const { data: inv } = await supabase
    .from("inventory_items")
    .select("unit")
    .eq("ingredient_id", ingredientId)
    .limit(1)
    .maybeSingle();

  const input: PipelineInput = {
    ingredientId,
    name: String(ingredient.name ?? ""),
    brand: (ingredient.brand_or_manufacturer as string) ?? null,
    stockUnit: (inv?.unit as string) ?? null,
  };

  const result = await runNutritionPipeline(input);
  const now = new Date().toISOString();

  // Never overwrite a catalogue-supplied (or user-supplied) canonical piece
  // weight with the pipeline's estimate. The catalogue is considered more
  // authoritative for generic piece weights (e.g. "1 egg ≈ 50 g") than ad-hoc
  // USDA portions or LLM guesses.
  const existingCanonicalWeight =
    typeof ingredient.canonical_unit_weight_g === "number" &&
    Number.isFinite(ingredient.canonical_unit_weight_g) &&
    ingredient.canonical_unit_weight_g > 0
      ? ingredient.canonical_unit_weight_g
      : null;
  const preservedCanonicalUnitWeightG =
    existingCanonicalWeight ?? result.canonical_unit_weight_g;

  if (result.status === "no_match") {
    await supabase
      .from("ingredients")
      .update({
        nutrition_needs_review: true,
        nutrition_notes: result.notes,
        updated_at: now,
      })
      .eq("id", ingredientId);

    revalidatePath("/inventory");
    return { ok: true as const, result };
  }

  const { error: updateErr } = await supabase
    .from("ingredients")
    .update({
      kcal: result.kcal,
      fat_g: result.fat_g,
      protein_g: result.protein_g,
      carbs_g: result.carbs_g,
      nutrition_basis: result.basis,
      canonical_unit_weight_g: preservedCanonicalUnitWeightG,
      nutrition_source_name: result.source_name,
      nutrition_source_record_id: result.source_record_id,
      nutrition_source_url: result.source_url,
      nutrition_confidence: result.confidence,
      nutrition_needs_review: result.needs_review,
      nutrition_notes: result.notes,
      food_type: result.food_type,
      nutrition_fetched_at: now,
      updated_at: now,
    })
    .eq("id", ingredientId);

  if (updateErr) return { ok: false as const, error: updateErr.message };

  await persistEnrichedNutrition(supabase, ingredientId, result);

  revalidatePath("/inventory");
  return { ok: true as const, result };
}

/**
 * Fire-and-forget wrapper — call after creating or updating an ingredient.
 * Catches all errors silently so nutrition autofill never blocks the main
 * user action.
 */
export async function maybeAutofillNutrition(
  ingredientId: number,
): Promise<void> {
  try {
    await autofillIngredientNutritionAction(ingredientId);
  } catch {
    // Silent — nutrition is a nice-to-have, not a gate.
  }
}

/**
 * Backfill micronutrients + portions for all ingredients that already have
 * a USDA source record but are missing enriched data (no rows in
 * ingredient_nutrients yet). Processes in batches to avoid API rate limits.
 *
 * Returns a summary: how many were processed, skipped, or errored.
 */
export async function backfillEnrichedNutritionAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const { data: candidates } = await supabase
    .from("ingredients")
    .select("id, name, brand_or_manufacturer, nutrition_source_name, nutrition_source_record_id")
    .not("nutrition_source_record_id", "is", null)
    .order("id");

  if (!candidates?.length) {
    return { ok: true as const, processed: 0, skipped: 0, errors: 0 };
  }

  const { data: alreadyDone } = await supabase
    .from("ingredient_nutrients")
    .select("ingredient_id")
    .in(
      "ingredient_id",
      candidates.map((c) => c.id),
    );

  const doneSet = new Set((alreadyDone ?? []).map((r) => r.ingredient_id));

  const toProcess = candidates.filter((c) => !doneSet.has(c.id));

  let processed = 0;
  let errors = 0;

  for (const ing of toProcess) {
    try {
      await autofillIngredientNutritionAction(ing.id as number, {
        force: true,
      });
      processed++;
    } catch {
      errors++;
    }
    // Pace ourselves: 200ms between calls to stay under USDA rate limits.
    await new Promise((r) => setTimeout(r, 200));
  }

  revalidatePath("/inventory");

  return {
    ok: true as const,
    processed,
    skipped: doneSet.size,
    errors,
    total: candidates.length,
  };
}
