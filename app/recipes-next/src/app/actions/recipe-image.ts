"use server";

import { createClient } from "@/lib/supabase/server";
import { generateAndAttachRecipeImage } from "@/lib/recipe-image-generation";

/**
 * Server action called from the "Generate image" button in the recipe editor.
 *
 * Verifies the current user actually owns the recipe (can't run the pipeline
 * on anyone else's recipe) and then runs the full image generation +
 * persistence pipeline. Returns the new public URL on success, or a
 * user-friendly error message on failure.
 */
export async function generateRecipeImageAction(
  recipeId: number,
): Promise<
  | { ok: true; imageUrl: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const { data: recipe, error: loadErr } = await supabase
    .from("recipes")
    .select("id, owner_id")
    .eq("id", recipeId)
    .maybeSingle();

  if (loadErr) return { ok: false, error: loadErr.message };
  if (!recipe) return { ok: false, error: "Recipe not found." };
  if (recipe.owner_id && recipe.owner_id !== user.id) {
    return { ok: false, error: "You don't have permission to edit this recipe." };
  }

  try {
    const result = await generateAndAttachRecipeImage(recipeId);
    if (!result.ok) {
      return {
        ok: false,
        error: friendlyError(result.stage, result.error),
      };
    }
    return { ok: true, imageUrl: result.imageUrl };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Image generation failed.",
    };
  }
}

function friendlyError(stage: string, raw: string): string {
  if (raw.includes("SERPAPI_KEY")) {
    return "Image search isn't configured. Add SERPAPI_KEY in your env and try again.";
  }
  if (raw.includes("BFL_API_KEY") && raw.includes("OPENAI_API_KEY")) {
    return "No image generator is configured. Add BFL_API_KEY or OPENAI_API_KEY.";
  }
  if (raw.includes("SUPABASE_SERVICE_ROLE_KEY")) {
    return "Service-role upload isn't configured. Add SUPABASE_SERVICE_ROLE_KEY.";
  }
  if (stage === "generate") {
    return `Generator failed: ${raw}`;
  }
  if (stage === "upload") {
    return `Could not save image: ${raw}`;
  }
  return raw;
}
