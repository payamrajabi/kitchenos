/**
 * One-time backfill: for every recipe image already in the bucket, generate
 * thumb + medium JPEG variants and upload them alongside the original under
 * the filename-suffix convention defined in `lib/recipe-image-variants.ts`.
 *
 * Why: render sites switch to the variant URLs to cut the bytes loaded for
 * the recipes grid, plan slots, and recipes table. Existing images need to
 * have their variants generated retroactively so old recipes benefit.
 *
 * Safe to re-run — it skips any image where both `-thumb.jpg` and
 * `-medium.jpg` already exist in storage. External URLs (e.g. legacy scrape
 * results that weren't uploaded into our bucket) are skipped entirely.
 *
 * Run locally:
 *   npx tsx scripts/backfill-image-variants.ts
 *
 * Required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * NEXT_PUBLIC_SUPABASE_RECIPE_BUCKET (defaults to "recipe-images").
 */

import sharp from "sharp";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  RECIPE_IMAGE_VARIANT_SPECS,
  variantStoragePath,
  type RecipeImageVariant,
} from "../src/lib/recipe-image-variants";

// The script bypasses generated DB types and reads/writes raw rows; we don't
// need the full generic surface here, just the runtime client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any, any, any>;

type RecipeImageRow = {
  id: number;
  image_url: string | null;
  image_urls: unknown;
};

function requiredEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

function normalizeImageUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (u): u is string => typeof u === "string" && u.trim() !== "",
  );
}

/**
 * Derive the bucket-relative storage path from a Supabase public URL, or
 * return null when the URL doesn't live in our bucket (external scrape
 * sources, etc.).
 */
function bucketPathFromPublicUrl(
  url: string,
  supabaseUrl: string,
  bucket: string,
): string | null {
  const prefix = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/`;
  if (!url.startsWith(prefix)) return null;
  const rest = url.slice(prefix.length);
  // Strip any query string (CDN cache busters, etc.) — we just want the path.
  const queryIdx = rest.indexOf("?");
  return queryIdx === -1 ? rest : rest.slice(0, queryIdx);
}

async function downloadOriginal(
  supabase: AnySupabaseClient,
  bucket: string,
  path: string,
): Promise<Uint8Array | null> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    console.warn(`  download failed: ${error?.message ?? "no data"}`);
    return null;
  }
  const buf = await data.arrayBuffer();
  return new Uint8Array(buf);
}

async function variantExists(
  supabase: AnySupabaseClient,
  bucket: string,
  variantPath: string,
): Promise<boolean> {
  // List the directory and look for the exact filename. `list` returns up to
  // 100 entries by default; we narrow with a `search` term so this stays
  // cheap even when the bucket has thousands of files.
  const slashIdx = variantPath.lastIndexOf("/");
  const folder = slashIdx === -1 ? "" : variantPath.slice(0, slashIdx);
  const filename = slashIdx === -1 ? variantPath : variantPath.slice(slashIdx + 1);

  const { data, error } = await supabase.storage
    .from(bucket)
    .list(folder, { search: filename, limit: 100 });
  if (error) return false;
  return Boolean(data?.some((entry) => entry.name === filename));
}

async function processImage(
  supabase: AnySupabaseClient,
  bucket: string,
  publicUrl: string,
  supabaseUrl: string,
): Promise<"processed" | "skipped" | "failed"> {
  const path = bucketPathFromPublicUrl(publicUrl, supabaseUrl, bucket);
  if (!path) return "skipped";

  // Variants always end in .jpg — match the runtime upload behaviour.
  const variantPaths: { variant: Exclude<RecipeImageVariant, "original">; path: string }[] =
    (["thumb", "medium"] as const).map((variant) => ({
      variant,
      path: variantStoragePath(path, variant).replace(/\.[^./]+$/, ".jpg"),
    }));

  const existsChecks = await Promise.all(
    variantPaths.map(({ path: vp }) => variantExists(supabase, bucket, vp)),
  );
  if (existsChecks.every(Boolean)) return "skipped";

  const sourceBytes = await downloadOriginal(supabase, bucket, path);
  if (!sourceBytes) return "failed";

  let anyFailed = false;
  for (let i = 0; i < variantPaths.length; i += 1) {
    if (existsChecks[i]) continue;
    const { variant, path: variantPath } = variantPaths[i];
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

      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(variantPath, resized, {
          contentType: "image/jpeg",
          upsert: true,
        });
      if (upErr) {
        console.warn(`  ${variant} upload failed: ${upErr.message}`);
        anyFailed = true;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`  ${variant} resize failed: ${message}`);
      anyFailed = true;
    }
  }

  return anyFailed ? "failed" : "processed";
}

async function main() {
  const SUPABASE_URL = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const BUCKET =
    process.env.NEXT_PUBLIC_SUPABASE_RECIPE_BUCKET?.trim() || "recipe-images";

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log(`Loading recipes (bucket: ${BUCKET})…`);
  const { data: rows, error: selErr } = await supabase
    .from("recipes")
    .select("id, image_url, image_urls")
    .order("id", { ascending: true });

  if (selErr) {
    console.error("Could not read recipes:", selErr.message);
    process.exit(1);
  }

  const recipes = (rows ?? []) as RecipeImageRow[];
  const allUrls = new Set<string>();
  for (const r of recipes) {
    if (r.image_url && r.image_url.trim()) allUrls.add(r.image_url.trim());
    for (const u of normalizeImageUrls(r.image_urls)) allUrls.add(u);
  }

  console.log(
    `Found ${recipes.length} recipe(s) and ${allUrls.size} distinct image URL(s).`,
  );

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let i = 0;
  for (const url of allUrls) {
    i += 1;
    process.stdout.write(`[${i}/${allUrls.size}] ${url.slice(-60)}  `);
    try {
      const result = await processImage(supabase, BUCKET, url, SUPABASE_URL);
      if (result === "processed") {
        processed += 1;
        console.log("ok");
      } else if (result === "skipped") {
        skipped += 1;
        console.log("skip");
      } else {
        failed += 1;
        console.log("FAILED");
      }
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.log(`FAILED (${message})`);
    }
  }

  console.log("\n--- Backfill summary ---");
  console.log(`URLs total     : ${allUrls.size}`);
  console.log(`Processed      : ${processed}`);
  console.log(`Skipped        : ${skipped}`);
  console.log(`Failed         : ${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
