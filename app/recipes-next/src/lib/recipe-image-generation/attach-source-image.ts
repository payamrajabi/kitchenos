/**
 * Download a hero image from the recipe's source page and attach it to the
 * recipe record — the cheap alternative to `generateAndAttachRecipeImage`.
 *
 * Tries each candidate URL in order and commits the first one that:
 *   - Fetches in under 15s with a 2xx response.
 *   - Has a valid image MIME type (png / jpeg / webp).
 *   - Is at most 8 MB.
 *
 * On success: uploads the bytes via the shared uploader, updates the
 * recipes row (image_url, image_urls, image_focus_y), revalidates the
 * same paths the AI path does, and returns the public URL.
 *
 * On total failure (empty list, all candidates fail): returns ok: false
 * so the caller can fall back to AI generation.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

import { uploadGeneratedRecipeImage } from "./upload-image";

const DOWNLOAD_TIMEOUT_MS = 15_000;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const USER_AGENT =
  "Mozilla/5.0 (compatible; KitchenOS/1.0; +https://kitchenos.app)";

const ALLOWED_IMAGE_PREFIXES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

function isAllowedImageContentType(ct: string | null): boolean {
  if (!ct) return false;
  const lower = ct.toLowerCase();
  return ALLOWED_IMAGE_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function normalizeImageUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (u): u is string => typeof u === "string" && u.trim() !== "",
  );
}

type DownloadedImage = {
  bytes: Uint8Array;
  contentType: string;
};

async function downloadCandidate(url: string): Promise<DownloadedImage | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "image/*",
      },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type");
    if (!isAllowedImageContentType(contentType)) return null;

    const contentLengthHeader = res.headers.get("content-length");
    if (contentLengthHeader) {
      const cl = Number(contentLengthHeader);
      if (Number.isFinite(cl) && cl > MAX_BYTES) return null;
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return null;

    return {
      bytes: new Uint8Array(buf),
      contentType: (contentType ?? "image/jpeg").split(";")[0].trim(),
    };
  } catch {
    return null;
  }
}

export type AttachSourceImageResult =
  | { ok: true; imageUrl: string; sourceUrl: string }
  | { ok: false };

export async function attachSourceImageToRecipe(
  recipeId: number,
  candidateUrls: string[],
): Promise<AttachSourceImageResult> {
  if (!candidateUrls.length) return { ok: false };

  let downloaded: DownloadedImage | null = null;
  let pickedSourceUrl: string | null = null;
  for (const url of candidateUrls) {
    const result = await downloadCandidate(url);
    if (result) {
      downloaded = result;
      pickedSourceUrl = url;
      break;
    }
  }

  if (!downloaded || !pickedSourceUrl) return { ok: false };

  const upload = await uploadGeneratedRecipeImage({
    recipeId,
    bytes: downloaded.bytes,
    contentType: downloaded.contentType,
  });
  if (!upload.ok) return { ok: false };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("recipes")
    .select("image_urls")
    .eq("id", recipeId)
    .maybeSingle();

  const existingUrls = normalizeImageUrls(
    (existing as { image_urls?: unknown } | null)?.image_urls,
  );
  const nextUrls = [
    upload.publicUrl,
    ...existingUrls.filter((u) => u !== upload.publicUrl),
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

  if (updateErr) return { ok: false };

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/community");

  return { ok: true, imageUrl: upload.publicUrl, sourceUrl: pickedSourceUrl };
}
