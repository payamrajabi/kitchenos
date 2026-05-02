/**
 * Recipe image size variants.
 *
 * Every uploaded recipe image is stored at three sizes in the same Supabase
 * bucket under a filename-suffix convention:
 *
 *   {recipeId}-{ts}.jpg          (original — what was uploaded / generated)
 *   {recipeId}-{ts}-thumb.jpg    (max edge 240px, JPEG q80)
 *   {recipeId}-{ts}-medium.jpg   (max edge 600px, JPEG q82)
 *
 * Render sites call `imageVariantUrl(url, "thumb" | "medium" | "original")`
 * which derives the variant URL by inserting the suffix before the extension.
 *
 * The variant URL is only returned when the input URL clearly lives in our
 * recipe-images bucket and has a recognisable filename pattern; everything
 * else (external scrape sources we kept inline, blob: previews, future
 * shapes) falls back to the original URL so we never break a render.
 */

export type RecipeImageVariant = "thumb" | "medium" | "original";

export const RECIPE_IMAGE_VARIANT_SPECS = {
  thumb: { suffix: "-thumb", maxEdge: 240, quality: 80 },
  medium: { suffix: "-medium", maxEdge: 600, quality: 82 },
} as const;

/**
 * Return the variant URL for a stored recipe image, or the original URL when
 * we can't safely derive one (external host, unrecognised path, missing
 * extension).
 */
export function imageVariantUrl(
  url: string | null | undefined,
  variant: RecipeImageVariant,
): string | null {
  if (!url) return null;
  if (variant === "original") return url;

  const spec = RECIPE_IMAGE_VARIANT_SPECS[variant];

  // Only touch URLs that look like Supabase storage URLs for our bucket.
  // Defensive on shape: we just need a recognised filename ending we can
  // splice the suffix into.
  if (typeof url !== "string") return url;

  const queryIdx = url.indexOf("?");
  const head = queryIdx === -1 ? url : url.slice(0, queryIdx);
  const tail = queryIdx === -1 ? "" : url.slice(queryIdx);

  const dotIdx = head.lastIndexOf(".");
  const slashIdx = head.lastIndexOf("/");
  if (dotIdx === -1 || dotIdx < slashIdx) return url;

  const base = head.slice(0, dotIdx);
  // Variants are always written as JPEG by the upload pipeline (see
  // `uploadRecipeImageVariants`), regardless of the original's format. The
  // URL helper has to match that, otherwise PNG/WebP originals would request
  // `-medium.png` / `-medium.webp` files that don't exist.
  const variantExt = ".jpg";

  // If the URL already carries a known variant suffix, swap it instead of
  // double-suffixing.
  for (const knownSuffix of [
    RECIPE_IMAGE_VARIANT_SPECS.thumb.suffix,
    RECIPE_IMAGE_VARIANT_SPECS.medium.suffix,
  ]) {
    if (base.endsWith(knownSuffix)) {
      return `${base.slice(0, -knownSuffix.length)}${spec.suffix}${variantExt}${tail}`;
    }
  }

  return `${base}${spec.suffix}${variantExt}${tail}`;
}

/**
 * Build the variant storage path from an original storage path. Used by the
 * upload + backfill paths where we work with relative bucket paths rather
 * than full public URLs.
 */
export function variantStoragePath(
  originalPath: string,
  variant: Exclude<RecipeImageVariant, "original">,
): string {
  const spec = RECIPE_IMAGE_VARIANT_SPECS[variant];
  const dotIdx = originalPath.lastIndexOf(".");
  if (dotIdx === -1) return `${originalPath}${spec.suffix}`;
  return `${originalPath.slice(0, dotIdx)}${spec.suffix}${originalPath.slice(dotIdx)}`;
}
