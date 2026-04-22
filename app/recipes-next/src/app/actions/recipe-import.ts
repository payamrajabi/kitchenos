"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchUrlContent } from "@/lib/recipe-import/fetch-url-content";
import { scrapeRecipeImageCandidates } from "@/lib/recipe-import/scrape-source-images";
import { extractRecipeTextFromImages } from "@/lib/recipe-import/extract-from-images";
import {
  parseRecipeContent,
  type InventoryHint,
} from "@/lib/recipe-import/parse-recipe";
import { formatInstructionStepsToRecipeText } from "@/lib/legacy-instructions-parse";
import {
  INGREDIENT_UNIT_VALUES,
  normalizeIngredientUnitForStorage,
} from "@/lib/unit-mapping";
import { normalizeMealTypesForStorage } from "@/lib/recipe-meal-types";
import { maybeAutofillNutrition } from "@/app/actions/ingredient-nutrition";
import {
  resolveRecipeIngredients,
  applyResolutionPlan,
  type InventoryIngredient,
  type IngredientResolution,
} from "@/lib/ingredient-resolution";
import { findBackboneMatchesForNames } from "@/lib/ingredient-backbone-catalogue";
import type {
  ParsedRecipe,
  DraftRecipeData,
  DraftIngredientOption,
} from "@/lib/recipe-import/types";
import { generateAndAttachRecipeImage } from "@/lib/recipe-image-generation";
import { attachSourceImageToRecipe } from "@/lib/recipe-image-generation/attach-source-image";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function normalizeUnit(raw: string | null): string {
  if (!raw) return "g";
  const n = normalizeIngredientUnitForStorage(raw.trim());
  if (n && INGREDIENT_UNIT_VALUES.has(n)) return n;
  return "g";
}

async function loadUserInventory(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{
  forResolution: InventoryIngredient[];
  forParser: InventoryHint[];
  forDraft: DraftIngredientOption[];
}> {
  const { data } = await supabase
    .from("ingredients")
    .select("id, name, parent_ingredient_id, category, grocery_category, backbone_id");
  if (!data) return { forResolution: [], forParser: [], forDraft: [] };

  const nameById = new Map<number, string>();
  for (const row of data) nameById.set(Number(row.id), String(row.name ?? ""));

  const forResolution: InventoryIngredient[] = data.map((row) => ({
    id: Number(row.id),
    name: String(row.name ?? ""),
    parent_ingredient_id:
      row.parent_ingredient_id != null
        ? Number(row.parent_ingredient_id)
        : null,
    category: row.category as string | null,
    grocery_category: (row as Record<string, unknown>).grocery_category as
      | string
      | null,
    backbone_id: (row as Record<string, unknown>).backbone_id as string | null,
  }));

  const forParser: InventoryHint[] = data.map((row) => ({
    id: Number(row.id),
    name: String(row.name ?? ""),
    parentName:
      row.parent_ingredient_id != null
        ? nameById.get(Number(row.parent_ingredient_id)) ?? null
        : null,
  }));

  const forDraft: DraftIngredientOption[] = data.map((row) => ({
    id: Number(row.id),
    name: String(row.name ?? ""),
    parentName:
      row.parent_ingredient_id != null
        ? nameById.get(Number(row.parent_ingredient_id)) ?? null
        : null,
  }));

  return { forResolution, forParser, forDraft };
}

function revalidateAfterImport(recipeId: number) {
  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/inventory");
}

/* ------------------------------------------------------------------ */
/*  Build draft data (parse + resolve, but do NOT write to DB)        */
/* ------------------------------------------------------------------ */

type DraftResult =
  | { ok: true; draft: DraftRecipeData }
  | { ok: false; error: string };

async function buildDraft(
  rawContent: string,
  opts: { sourceUrl?: string; sourceImageCandidates?: string[] },
): Promise<DraftResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const { forResolution, forParser, forDraft } =
    await loadUserInventory(supabase);

  const parseResult = await parseRecipeContent(rawContent, {
    sourceUrl: opts.sourceUrl,
    inventory: forParser,
  });
  if (!parseResult.ok) return parseResult;

  const allIngredientNames = [
    ...new Set(
      parseResult.recipe.ingredient_groups
        .flatMap((g) => g.items.map((i) => i.ingredient))
        .filter(Boolean),
    ),
  ];

  const plan = await resolveRecipeIngredients(
    allIngredientNames,
    forResolution,
    {
      catalogueLookup: (names) => findBackboneMatchesForNames(supabase, names),
    },
  );

  return {
    ok: true,
    draft: {
      parsed: parseResult.recipe,
      resolutions: plan.resolutions,
      existingIngredients: forDraft,
      sourceImageCandidates: opts.sourceImageCandidates,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Import actions — return draft data for client-side review         */
/* ------------------------------------------------------------------ */

export async function importRecipeFromUrlAction(
  rawUrl: string,
): Promise<DraftResult> {
  const trimmedUrl = rawUrl.trim();

  // Fetch readable text and scrape candidate hero images in parallel — the
  // text goes to the parser, the image URLs are stashed on the draft so the
  // confirm step can skip the expensive AI image generator.
  const [fetchResult, scrapeResult] = await Promise.all([
    fetchUrlContent(rawUrl),
    scrapeRecipeImageCandidates(trimmedUrl),
  ]);
  if (!fetchResult.ok) return fetchResult;

  const sourceImageCandidates =
    scrapeResult.ok && scrapeResult.candidates.length > 0
      ? scrapeResult.candidates
      : undefined;

  return buildDraft(fetchResult.content, {
    sourceUrl: trimmedUrl,
    sourceImageCandidates,
  });
}

async function blobsToBase64DataUrls(
  blobs: Blob[],
): Promise<{ base64DataUrl: string }[]> {
  const out: { base64DataUrl: string }[] = [];
  for (const blob of blobs) {
    const buf = Buffer.from(await blob.arrayBuffer());
    const mime = blob.type || "image/jpeg";
    out.push({ base64DataUrl: `data:${mime};base64,${buf.toString("base64")}` });
  }
  return out;
}

export async function importRecipeFromImagesAction(
  imageBlobs: Blob[],
): Promise<DraftResult> {
  if (!imageBlobs.length) {
    return { ok: false, error: "No images provided." };
  }

  const images = await blobsToBase64DataUrls(imageBlobs);
  const extractResult = await extractRecipeTextFromImages(images);
  if (!extractResult.ok) return extractResult;

  return buildDraft(extractResult.content, {});
}

export async function importRecipeFromTextAction(
  rawText: string,
): Promise<DraftResult> {
  const text = rawText.trim();
  if (!text) {
    return { ok: false, error: "Paste some recipe text first." };
  }

  return buildDraft(text, {});
}

/**
 * Combined text + images intake. Either (or both) may be provided.
 * - Text only → parse directly.
 * - Any images → run vision extraction with the user's text as extra context,
 *   then parse the extracted content.
 */
export async function importRecipeFromIntakeAction(
  rawText: string,
  imageBlobs: Blob[],
): Promise<DraftResult> {
  const text = rawText.trim();
  const hasImages = imageBlobs.length > 0;

  if (!text && !hasImages) {
    return {
      ok: false,
      error: "Add some text or at least one image to get started.",
    };
  }

  if (!hasImages) {
    return buildDraft(text, {});
  }

  const images = await blobsToBase64DataUrls(imageBlobs);
  const extractResult = await extractRecipeTextFromImages(images, {
    userText: text || undefined,
  });
  if (!extractResult.ok) return extractResult;

  return buildDraft(extractResult.content, {});
}

/* ------------------------------------------------------------------ */
/*  Confirm draft — apply resolutions + save recipe to DB             */
/* ------------------------------------------------------------------ */

export async function confirmRecipeDraftAction(
  parsed: ParsedRecipe,
  resolutions: IngredientResolution[],
  sourceImageCandidates?: string[],
): Promise<{ ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const legacyInstructionsText = formatInstructionStepsToRecipeText(
    parsed.instruction_steps.map((s) => s.text),
  );

  const { data: newRecipe, error: recipeErr } = await supabase
    .from("recipes")
    .insert({
      name: parsed.name,
      title_primary: parsed.title.primary,
      title_qualifier: parsed.title.qualifier,
      headnote: parsed.headnote,
      description: parsed.description,
      source_url: parsed.source_url,
      servings: parsed.servings,
      yield_label: parsed.yield.label,
      yield_quantity: parsed.yield.quantity,
      yield_unit: parsed.yield.unit,
      yield_display: parsed.yield.display,
      prep_time_minutes: parsed.prep_time_minutes,
      cook_time_minutes: parsed.cook_time_minutes,
      meal_types: normalizeMealTypesForStorage(parsed.meal_types),
      notes: parsed.notes,
      notes_type: parsed.recipe_note.type,
      notes_title: parsed.recipe_note.title,
      instructions: legacyInstructionsText || null,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (recipeErr || !newRecipe) {
    return {
      ok: false,
      error: recipeErr?.message ?? "Could not create recipe.",
    };
  }

  const recipeId = Number(newRecipe.id);

  const rollback = async () => {
    await supabase.from("recipes").delete().eq("id", recipeId);
  };

  try {
    const plan = { resolutions, needsConfirmation: false as const };
    const planResult = await applyResolutionPlan(supabase, plan);

    if (!planResult.ok) {
      await rollback();
      return { ok: false, error: planResult.error };
    }

    const resolvedByName = new Map<string, number>();
    for (const applied of planResult.applied) {
      resolvedByName.set(applied.recipeName, applied.ingredientId);
      if (applied.wasCreated) void maybeAutofillNutrition(applied.ingredientId);
    }

    for (
      let grpIdx = 0;
      grpIdx < parsed.ingredient_groups.length;
      grpIdx++
    ) {
      const group = parsed.ingredient_groups[grpIdx];
      let sectionId: string | null = null;

      if (group.heading) {
        const { data: secRow, error: secErr } = await supabase
          .from("recipe_ingredient_sections")
          .insert({
            recipe_id: recipeId,
            heading: group.heading,
            sort_order: grpIdx,
          })
          .select("id")
          .single();

        if (secErr || !secRow) {
          await rollback();
          return {
            ok: false,
            error:
              secErr?.message ?? "Could not create ingredient section.",
          };
        }
        sectionId = String(secRow.id);
      }

      for (let i = 0; i < group.items.length; i++) {
        const ing = group.items[i];
        const ingredientId = resolvedByName.get(ing.ingredient);
        if (ingredientId == null) continue;

        const { error: lineErr } = await supabase
          .from("recipe_ingredients")
          .insert({
            recipe_id: recipeId,
            ingredient_id: ingredientId,
            section_id: sectionId,
            line_sort_order: i,
            amount: ing.amount,
            unit: normalizeUnit(ing.unit),
            preparation: ing.preparation,
            display: ing.display,
            is_optional: ing.is_optional,
          });

        if (lineErr) {
          await rollback();
          return { ok: false, error: lineErr.message };
        }
      }
    }

    if (parsed.instruction_steps.length > 0) {
      const { error: stepsErr } = await supabase
        .from("recipe_instruction_steps")
        .insert(
          parsed.instruction_steps.map((step, idx) => ({
            recipe_id: recipeId,
            step_number: idx + 1,
            text: step.text,
            timer_seconds_low: step.timer_seconds_low,
            timer_seconds_high: step.timer_seconds_high,
          })),
        );

      if (stepsErr) {
        await rollback();
        return { ok: false, error: stepsErr.message };
      }
    }

    after(async () => {
      try {
        if (sourceImageCandidates?.length) {
          const attached = await attachSourceImageToRecipe(
            recipeId,
            sourceImageCandidates,
          );
          if (attached.ok) {
            console.log(
              "[recipe-image] attached source image",
              recipeId,
              attached.sourceUrl,
            );
            return;
          }
          console.warn(
            "[recipe-image] source-scrape failed, falling back to AI",
            recipeId,
          );
        }

        const result = await generateAndAttachRecipeImage(recipeId);
        if (!result.ok) {
          console.warn(
            "[recipe-image] auto-gen failed",
            recipeId,
            result.stage,
            result.error,
          );
        }
      } catch (e) {
        console.error("[recipe-image] auto-gen threw", recipeId, e);
      }
    });

    revalidateAfterImport(recipeId);
    redirect(`/recipes/${recipeId}?gen=1`);
  } catch (err) {
    const digest = (err as { digest?: string })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    await rollback();
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Import failed.",
    };
  }
}
