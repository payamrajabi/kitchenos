/**
 * Find ~12 candidate reference photos for a recipe via SerpAPI Google Images.
 *
 * SerpAPI was chosen because Bing Image Search is retired and Google
 * Custom Search's image API is less convenient. If we ever need to swap
 * providers, only this file needs to change.
 */

const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";
const SERPAPI_TIMEOUT_MS = 20_000;
const MAX_CANDIDATES = 12;

export type ReferenceCandidate = {
  /** Full-resolution image URL (what we'd feed the generator). */
  imageUrl: string;
  /** Small thumbnail URL (what we show the curator vision model). */
  thumbnailUrl: string;
  /** Where the image lives — helps the curator reject watermarked stock. */
  sourceDomain: string | null;
  /** Best-effort title/description, purely for debugging. */
  title?: string;
};

type SerpApiImageResult = {
  original?: string;
  thumbnail?: string;
  source?: string;
  link?: string;
  title?: string;
};

type SerpApiResponse = {
  images_results?: SerpApiImageResult[];
  error?: string;
};

function safeDomainFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export async function searchReferenceImages(
  query: string,
): Promise<
  | { ok: true; candidates: ReferenceCandidate[] }
  | { ok: false; error: string }
> {
  const apiKey = process.env.SERPAPI_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error:
        "SERPAPI_KEY is not set. Add it to .env.local to enable recipe image generation.",
    };
  }

  const params = new URLSearchParams({
    engine: "google_images",
    q: query,
    ijn: "0",
    api_key: apiKey,
    safe: "active",
    num: "20",
  });

  try {
    const res = await fetch(`${SERPAPI_ENDPOINT}?${params.toString()}`, {
      signal: AbortSignal.timeout(SERPAPI_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error: `SerpAPI error (${res.status}): ${body.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as SerpApiResponse;
    if (data.error) return { ok: false, error: `SerpAPI: ${data.error}` };

    const results = data.images_results ?? [];
    const candidates: ReferenceCandidate[] = [];
    const seen = new Set<string>();

    for (const r of results) {
      const imageUrl = r.original?.trim();
      const thumb = r.thumbnail?.trim();
      if (!imageUrl || !thumb) continue;
      if (seen.has(imageUrl)) continue;
      seen.add(imageUrl);
      candidates.push({
        imageUrl,
        thumbnailUrl: thumb,
        sourceDomain: safeDomainFromUrl(r.source ?? r.link),
        title: r.title,
      });
      if (candidates.length >= MAX_CANDIDATES) break;
    }

    if (!candidates.length) {
      return { ok: false, error: "No image candidates from search." };
    }
    return { ok: true, candidates };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Image search failed.",
    };
  }
}
