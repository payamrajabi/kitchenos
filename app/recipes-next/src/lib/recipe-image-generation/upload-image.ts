/**
 * Upload a generated image to the `recipe-images` Supabase Storage bucket
 * using a service-role client (no user cookie needed — safe to call from
 * `after()` tasks or background jobs).
 *
 * Returns the public URL that can go straight into `recipes.image_url`.
 *
 * Also generates two smaller stored variants (thumb 240px, medium 600px)
 * alongside the original under the filename-suffix convention defined in
 * `lib/recipe-image-variants.ts`. Variant generation runs after the
 * original is safely uploaded; if the variant pass fails we log and keep
 * going — never block the main image flow on a thumbnail.
 */

import sharp from "sharp";

import { createAdminClient } from "@/lib/supabase/admin";
import { recipeImagesBucket } from "@/lib/env";
import {
  RECIPE_IMAGE_VARIANT_SPECS,
  variantStoragePath,
  type RecipeImageVariant,
} from "@/lib/recipe-image-variants";

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

    // Best-effort: store thumb + medium next to the original. We pass the
    // raw source buffer rather than the bytes-as-uploaded so resizing always
    // happens against the highest-quality input we have.
    await uploadRecipeImageVariants({
      bucket,
      originalPath: path,
      sourceBytes: input.bytes,
    });

    return { ok: true, publicUrl };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Upload failed.",
    };
  }
}

/**
 * Generate and upload thumb + medium variants for an image already living in
 * the bucket. Resizes from `sourceBytes` (the raw bytes the original was
 * built from) and writes JPEGs alongside the original under
 * `{base}-thumb.jpg` / `{base}-medium.jpg`. Failures are logged and
 * swallowed — the caller never depends on this for correctness.
 */
export async function uploadRecipeImageVariants(args: {
  bucket: string;
  originalPath: string;
  sourceBytes: Uint8Array;
}): Promise<void> {
  const { bucket, originalPath, sourceBytes } = args;
  try {
    const admin = createAdminClient();
    const variants: Exclude<RecipeImageVariant, "original">[] = [
      "thumb",
      "medium",
    ];

    for (const variant of variants) {
      const spec = RECIPE_IMAGE_VARIANT_SPECS[variant];
      try {
        const resized = await sharp(sourceBytes)
          .rotate()
          .resize({
            width: spec.maxEdge,
            height: spec.maxEdge,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: spec.quality, mozjpeg: true })
          .toBuffer();

        const variantPath = variantStoragePath(originalPath, variant);
        // Force `.jpg` extension on the variant since we always emit JPEG.
        const finalPath = variantPath.replace(/\.[^./]+$/, ".jpg");

        const { error: variantErr } = await admin.storage
          .from(bucket)
          .upload(finalPath, resized, {
            contentType: "image/jpeg",
            upsert: true,
          });

        if (variantErr) {
          console.warn(
            `[recipe-image] variant ${variant} upload failed for ${originalPath}: ${variantErr.message}`,
          );
        }
      } catch (variantErr) {
        const message =
          variantErr instanceof Error ? variantErr.message : String(variantErr);
        console.warn(
          `[recipe-image] variant ${variant} resize failed for ${originalPath}: ${message}`,
        );
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[recipe-image] variant pass aborted for ${originalPath}: ${message}`,
    );
  }
}
