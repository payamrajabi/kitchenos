/**
 * Upload a generated image to the `recipe-images` Supabase Storage bucket
 * using a service-role client (no user cookie needed — safe to call from
 * `after()` tasks or background jobs).
 *
 * Returns the public URL that can go straight into `recipes.image_url`.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { recipeImagesBucket } from "@/lib/env";

export type UploadInput = {
  recipeId: number;
  bytes: Uint8Array;
  contentType: string;
};

function extFromContentType(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes("png")) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("webp")) return "webp";
  return "png";
}

export async function uploadGeneratedRecipeImage(
  input: UploadInput,
): Promise<{ ok: true; publicUrl: string } | { ok: false; error: string }> {
  try {
    const admin = createAdminClient();
    const bucket = recipeImagesBucket();
    const ext = extFromContentType(input.contentType);
    const path = `${input.recipeId}-gen-${Date.now()}.${ext}`;

    const { error: upErr } = await admin.storage
      .from(bucket)
      .upload(path, input.bytes, {
        contentType: input.contentType || "image/png",
        upsert: false,
      });

    if (upErr) {
      return { ok: false, error: upErr.message };
    }

    const { data: pub } = admin.storage.from(bucket).getPublicUrl(path);
    const publicUrl = pub.publicUrl;
    if (!publicUrl) {
      return { ok: false, error: "Public URL unavailable for uploaded image." };
    }
    return { ok: true, publicUrl };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Upload failed.",
    };
  }
}
