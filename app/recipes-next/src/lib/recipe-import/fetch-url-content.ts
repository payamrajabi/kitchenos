/**
 * Fetch readable content from a URL using Jina Reader (free, no API key).
 * Falls back to raw HTML fetch when Jina is unavailable.
 */

const JINA_READER_BASE = "https://r.jina.ai/";
const FETCH_TIMEOUT_MS = 30_000;

function isValidUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function fetchViaJina(url: string): Promise<string | null> {
  try {
    const res = await fetch(`${JINA_READER_BASE}${url}`, {
      headers: { Accept: "text/markdown" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.trim() || null;
  } catch {
    return null;
  }
}

async function fetchRawHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; KitchenOS/1.0; +https://kitchenos.app)",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const html = await res.text();
    return stripHtmlTags(html) || null;
  } catch {
    return null;
  }
}

export async function fetchUrlContent(
  rawUrl: string,
): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  const url = rawUrl.trim();
  if (!url) return { ok: false, error: "Recipe link is required." };
  if (!isValidUrl(url)) return { ok: false, error: "That doesn't look like a valid link." };

  const jina = await fetchViaJina(url);
  if (jina) return { ok: true, content: jina };

  const html = await fetchRawHtml(url);
  if (html) return { ok: true, content: html };

  return { ok: false, error: "Couldn't read that recipe link." };
}
