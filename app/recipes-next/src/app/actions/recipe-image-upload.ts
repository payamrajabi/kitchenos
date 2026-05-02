"use server";

/**
 * Server action invoked by the recipe editor when the user picks or drops an
 * image file. It runs the same upload pipeline used by AI generation and the
 * URL scrape — including thumb + medium variant generation — and writes the
 * resulting public URL onto the recipe row.
 *
 * Doing this on the server (instead of uploading directly from the browser)
 * lets us run sharp on the source bytes once and store all three sizes
 * before the row is updated.
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { uploadGeneratedRecipeImage } from "@/lib/recipe-image-generation/upload-image";

const ALLOWED_PREFIXES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

function normalizeImageUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (u): u is string => typeof u === "string" && u.trim() !== "",
  );
}

export async function uploadRecipeImageAction(
  formData: FormData,
): Promise<{ ok: true; imageUrl: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const recipeIdRaw = formData.get("recipeId");
  const recipeId = Number(recipeIdRaw);
  if (!Number.isFinite(recipeId) || recipeId <= 0) {
    return { ok: false, error: "Invalid recipe id." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "No image file provided." };
  }
  const contentType = file.type || "application/octet-stream";
  if (!ALLOWED_PREFIXES.some((p) => contentType.toLowerCase().startsWith(p))) {
    return { ok: false, error: "Please use a PNG, JPEG, or WebP image." };
  }

  const { data: recipe, error: loadErr } = await supabase
    .from("recipes")
    .select("id, owner_id, image_urls")
    .eq("id", recipeId)
    .maybeSingle();

  if (loadErr) return { ok: false, error: loadErr.message };
  if (!recipe) return { ok: false, error: "Recipe not found." };
  if (recipe.owner_id && recipe.owner_id !== user.id) {
    return { ok: false, error: "You don't have permission to edit this recipe." };
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const upload = await uploadGeneratedRecipeImage({
    recipeId,
    bytes,
    contentType,
  });
  if (!upload.ok) {
    return { ok: false, error: upload.error };
  }

  const existing = normalizeImageUrls(recipe.image_urls);
  const nextUrls = [
    upload.publicUrl,
    ...existing.filter((u) => u !== upload.publicUrl),
  ];

  const { error: updateErr } = await supabase
    .from("recipes")
    .update({
      image_url: upload.publicUrl,
      image_urls: nextUrls,
      image_focus_y: 50,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recipeId);

  if (updateErr) return { ok: false, error: updateErr.message };

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/community");

  return { ok: true, imageUrl: upload.publicUrl };
}
