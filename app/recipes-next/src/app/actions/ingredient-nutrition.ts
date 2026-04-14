"use server";

import { createClient } from "@/lib/supabase/server";
import { runNutritionPipeline } from "@/lib/nutrition/pipeline";
import type { PipelineInput } from "@/lib/nutrition/types";
import { revalidatePath } from "next/cache";

/**
 * Full autofill action — callable from a UI button or programmatically.
 * Fetches the ingredient, checks if nutrition is empty, runs the pipeline,
 * and persists the result with full provenance.
 */
export async function autofillIngredientNutritionAction(
  ingredientId: number,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const { data: ingredient, error: fetchErr } = await supabase
    .from("ingredients")
    .select(
      "id, name, brand_or_manufacturer, kcal, fat_g, protein_g, carbs_g",
    )
    .eq("id", ingredientId)
    .maybeSingle();

  if (fetchErr || !ingredient) {
    return { ok: false as const, error: "Ingredient not found." };
  }

  if (
    ingredient.kcal != null ||
    ingredient.fat_g != null ||
    ingredient.protein_g != null ||
    ingredient.carbs_g != null
  ) {
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

  if (result.status === "no_match") {
    await supabase
      .from("ingredients")
      .update({
        nutrition_needs_review: true,
        nutrition_notes: result.notes,
        updated_at: new Date().toISOString(),
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
      canonical_unit_weight_g: result.canonical_unit_weight_g,
      nutrition_source_name: result.source_name,
      nutrition_source_record_id: result.source_record_id,
      nutrition_source_url: result.source_url,
      nutrition_confidence: result.confidence,
      nutrition_needs_review: result.needs_review,
      nutrition_notes: result.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ingredientId);

  if (updateErr) return { ok: false as const, error: updateErr.message };

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
