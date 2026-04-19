/**
 * Scrape candidate hero-image URLs from a recipe source page.
 *
 * Priority order (matches what recipe blogs reliably publish):
 *   1. JSON-LD Recipe.image (string, { url }, or array of either) — gold standard.
 *   2. <meta property="og:image"> / og:image:secure_url.
 *   3. <meta name="twitter:image"> / twitter:image:src.
 *   4. <link rel="image_src">.
 *
 * Returns de-duplicated, absolute https(s) URLs. Never throws.
 */

const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; KitchenOS/1.0; +https://kitchenos.app)";

function isValidUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function toAbsolute(candidate: string, base: string): string | null {
  try {
    const u = new URL(candidate, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  JSON-LD extraction                                                */
/* ------------------------------------------------------------------ */

function collectJsonLdImages(node: unknown, out: string[]): void {
  if (!node) return;

  if (typeof node === "string") {
    out.push(node);
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) collectJsonLdImages(item, out);
    return;
  }

  if (typeof node !== "object") return;
  const rec = node as Record<string, unknown>;

  // ImageObject nodes have a `url` field.
  if (typeof rec.url === "string") {
    out.push(rec.url);
  }

  // Some sites use @id as the URL.
  if (typeof rec["@id"] === "string" && /^https?:\/\//i.test(rec["@id"] as string)) {
    out.push(rec["@id"] as string);
  }
}

function walkJsonLdForRecipeImages(node: unknown, out: string[]): void {
  if (!node) return;

  if (Array.isArray(node)) {
    for (const item of node) walkJsonLdForRecipeImages(item, out);
    return;
  }

  if (typeof node !== "object") return;
  const rec = node as Record<string, unknown>;

  // @graph nodes — recurse into each entry.
  if (Array.isArray(rec["@graph"])) {
    for (const item of rec["@graph"] as unknown[]) {
      walkJsonLdForRecipeImages(item, out);
    }
  }

  const type = rec["@type"];
  const typeStr = Array.isArray(type)
    ? type.map(String).join(",").toLowerCase()
    : typeof type === "string"
      ? type.toLowerCase()
      : "";

  const looksLikeRecipe = typeStr.includes("recipe");

  // Even non-Recipe nodes can carry useful images (e.g. Article, WebPage) —
  // but we prioritise Recipe images by collecting them first.
  if (looksLikeRecipe && rec.image != null) {
    collectJsonLdImages(rec.image, out);
  }
}

function extractFromJsonLd(html: string): string[] {
  const out: string[] = [];
  const scriptRe =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRe.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      walkJsonLdForRecipeImages(parsed, out);
    } catch {
      /* ignore malformed JSON-LD blocks */
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  <meta> / <link> extraction                                        */
/* ------------------------------------------------------------------ */

function extractMetaContent(html: string, attr: "property" | "name", key: string): string[] {
  // Match both attribute orders: property/name first, or content first.
  const re = new RegExp(
    `<meta\\b[^>]*\\b${attr}=["']${key}["'][^>]*\\bcontent=["']([^"']+)["'][^>]*>|<meta\\b[^>]*\\bcontent=["']([^"']+)["'][^>]*\\b${attr}=["']${key}["'][^>]*>`,
    "gi",
  );
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const val = (match[1] ?? match[2] ?? "").trim();
    if (val) out.push(val);
  }
  return out;
}

function extractLinkImageSrc(html: string): string[] {
  const re =
    /<link\b[^>]*\brel=["']image_src["'][^>]*\bhref=["']([^"']+)["'][^>]*>|<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']image_src["'][^>]*>/gi;
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const val = (match[1] ?? match[2] ?? "").trim();
    if (val) out.push(val);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Public entrypoint                                                 */
/* ------------------------------------------------------------------ */

export type ScrapeImagesResult =
  | { ok: true; candidates: string[] }
  | { ok: false };

export async function scrapeRecipeImageCandidates(
  rawUrl: string,
): Promise<ScrapeImagesResult> {
  const url = rawUrl.trim();
  if (!isValidUrl(url)) return { ok: false };

  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false };
    html = await res.text();
  } catch {
    return { ok: false };
  }

  if (!html) return { ok: true, candidates: [] };

  const raw: string[] = [
    ...extractFromJsonLd(html),
    ...extractMetaContent(html, "property", "og:image"),
    ...extractMetaContent(html, "property", "og:image:secure_url"),
    ...extractMetaContent(html, "name", "twitter:image"),
    ...extractMetaContent(html, "name", "twitter:image:src"),
    ...extractLinkImageSrc(html),
  ];

  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const c of raw) {
    const abs = toAbsolute(c, url);
    if (!abs) continue;
    if (seen.has(abs)) continue;
    seen.add(abs);
    candidates.push(abs);
  }

  return { ok: true, candidates };
}
