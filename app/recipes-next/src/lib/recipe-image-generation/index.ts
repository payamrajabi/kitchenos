/**
 * End-to-end recipe image generation orchestrator.
 *
 * Steps (stop on irrecoverable error, log and return):
 *   1. Load recipe + resolved ingredient names + instruction step bodies
 *   2. Creative Director (reasoning model) writes a rich generation prompt
 *   3. gpt-image-1 renders the prompt at 1024x1024, quality "high"
 *   4. GPT-4o vision QC pass; one retry on fail with a tightened prompt
 *   5. Upload bytes to `recipe-images` bucket via the service-role client
 *   6. Update `recipes.image_url`, `image_urls`, `image_focus_y` and revalidate
 *
 * Safe to call from a Next.js `after()` callback — no user cookies required.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

import { buildRecipeImagePrompt, type PromptInput } from "./build-prompt";
import { generateRecipeImage } from "./generate-image";
import { qcRecipeImage, bytesToDataUrl } from "./qc-image";
import { uploadGeneratedRecipeImage } from "./upload-image";

export type GenerateAttachResult =
  | {
      ok: true;
      imageUrl: string;
      provider: string;
      sceneConcept: string;
      qcNote?: string;
    }
  | { ok: false; error: string; stage: string };

/**
 * Normalise a stored `image_urls` jsonb/array value into a string[].
 * Mirrors the helper in recipe-detail-editor.tsx so the history we build
 * here lines up with what the manual uploader produces.
 */
function normalizeImageUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (u): u is string => typeof u === "string" && u.trim() !== "",
  );
}

type LoadedContext = {
  recipeName: string;
  description: string | null;
  mealTypes: string[] | null;
  ingredientNames: string[];
  instructionStepBodies: string[];
  servings: number | null;
  existingImageUrls: string[];
};

async function loadRecipeContext(
  admin: ReturnType<typeof createAdminClient>,
  recipeId: number,
): Promise<{ ok: true; ctx: LoadedContext } | { ok: false; error: string }> {
  const { data: recipe, error: recipeErr } = await admin
    .from("recipes")
    .select("id, name, description, meal_types, servings, image_urls")
    .eq("id", recipeId)
    .maybeSingle();

  if (recipeErr) return { ok: false, error: recipeErr.message };
  if (!recipe) return { ok: false, error: "Recipe not found." };

  const { data: ingLines } = await admin
    .from("recipe_ingredients")
    .select("line_sort_order, section_id, ingredients(name)")
    .eq("recipe_id", recipeId)
    .order("line_sort_order", { ascending: true });

  const ingredientNames: string[] = [];
  for (const row of ingLines ?? []) {
    const joined = (row as { ingredients: unknown }).ingredients;
    let name: string | null = null;
    if (Array.isArray(joined)) {
      name = (joined[0] as { name?: string } | undefined)?.name ?? null;
    } else if (joined && typeof joined === "object") {
      name = (joined as { name?: string }).name ?? null;
    }
    if (name && name.trim()) ingredientNames.push(name.trim());
  }

  const { data: steps } = await admin
    .from("recipe_instruction_steps")
    .select("body, sort_order")
    .eq("recipe_id", recipeId)
    .order("sort_order", { ascending: true });

  const instructionStepBodies = (steps ?? [])
    .map((s) => String((s as { body: unknown }).body ?? "").trim())
    .filter(Boolean);

  return {
    ok: true,
    ctx: {
      recipeName: String(recipe.name ?? "").trim(),
      description: (recipe.description as string | null) ?? null,
      mealTypes: (recipe.meal_types as string[] | null) ?? null,
      ingredientNames,
      instructionStepBodies,
      servings: (recipe.servings as number | null) ?? null,
      existingImageUrls: normalizeImageUrls(recipe.image_urls),
    },
  };
}

function headline(names: string[]): string[] {
  return names
    .filter(
      (n) =>
        !/^(salt|pepper|black pepper|white pepper|water|olive oil|oil|butter|cooking spray|kosher salt|sea salt|flaky sea salt)$/i.test(
          n,
        ),
    )
    .slice(0, 8);
}

export async function generateAndAttachRecipeImage(
  recipeId: number,
  opts: { logPrefix?: string } = {},
): Promise<GenerateAttachResult> {
  const log = (...args: unknown[]) =>
    console.log(
      opts.logPrefix ?? "[recipe-image]",
      `recipe=${recipeId}`,
      ...args,
    );

  const admin = createAdminClient();

  const loaded = await loadRecipeContext(admin, recipeId);
  if (!loaded.ok) return { ok: false, stage: "load", error: loaded.error };
  const ctx = loaded.ctx;

  if (!ctx.recipeName) {
    return { ok: false, stage: "load", error: "Recipe has no name." };
  }

  const promptInput: PromptInput = {
    name: ctx.recipeName,
    description: ctx.description,
    mealTypes: ctx.mealTypes,
    ingredientNames: ctx.ingredientNames,
    instructionStepBodies: ctx.instructionStepBodies,
    servings: ctx.servings,
  };

  const { generationPrompt, sceneConcept } =
    await buildRecipeImagePrompt(promptInput);
  log("sceneConcept:", sceneConcept);

  const headlineIngredients = headline(ctx.ingredientNames);

  let gen;
  try {
    gen = await generateRecipeImage({ prompt: generationPrompt });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("generation failed:", message);
    return { ok: false, stage: "generate", error: message };
  }
  log("generated via", gen.provider);

  const firstVerdict = await qcRecipeImage({
    recipeName: ctx.recipeName,
    headlineIngredients,
    imageDataUrl: bytesToDataUrl(gen.bytes, gen.contentType),
  });
  log("qc pass1:", firstVerdict);

  let finalBytes = gen.bytes;
  let finalContentType = gen.contentType;
  let finalProvider: string = gen.provider;
  let finalQcNote = firstVerdict.reason;

  if (!firstVerdict.pass) {
    const tightenedPrompt = [
      generationPrompt,
      "",
      `Correct this specific issue from the previous attempt: ${
        firstVerdict.reason ?? "it looked AI-generated."
      }`,
      "The result must look like an unretouched real photograph — natural light, natural colours, tack-sharp subject with a gentle background blur, honest shadows, no AI artefacts, no plastic sheen, no CGI, no cartoon.",
    ].join("\n");

    try {
      const retry = await generateRecipeImage({ prompt: tightenedPrompt });
      log("retried via", retry.provider);
      const retryVerdict = await qcRecipeImage({
        recipeName: ctx.recipeName,
        headlineIngredients,
        imageDataUrl: bytesToDataUrl(retry.bytes, retry.contentType),
      });
      log("qc pass2:", retryVerdict);
      if (
        retryVerdict.pass ||
        !firstVerdict.realismScore ||
        (retryVerdict.realismScore ?? 0) >= (firstVerdict.realismScore ?? 0)
      ) {
        finalBytes = retry.bytes;
        finalContentType = retry.contentType;
        finalProvider = retry.provider;
        finalQcNote = retryVerdict.reason;
      }
    } catch (err) {
      log("retry failed, keeping first attempt:", err);
    }
  }

  const upload = await uploadGeneratedRecipeImage({
    recipeId,
    bytes: finalBytes,
    contentType: finalContentType,
  });
  if (!upload.ok) {
    return { ok: false, stage: "upload", error: upload.error };
  }

  const nextUrls = [
    upload.publicUrl,
    ...ctx.existingImageUrls.filter((u) => u !== upload.publicUrl),
  ];

  const { error: updateErr } = await admin
    .from("recipes")
    .update({
      image_url: upload.publicUrl,
      image_urls: nextUrls,
      image_focus_y: 50,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recipeId);

  if (updateErr) {
    return { ok: false, stage: "persist", error: updateErr.message };
  }

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/community");

  return {
    ok: true,
    imageUrl: upload.publicUrl,
    provider: finalProvider,
    sceneConcept,
    qcNote: finalQcNote,
  };
}
