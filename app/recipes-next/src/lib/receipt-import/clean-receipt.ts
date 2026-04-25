/**
 * Receipt cleanup pass.
 *
 * Real users paste receipts that are buried in page chrome — Instacart
 * navigation, shopper names, delivery notes, "Reorder these items" lists,
 * etc. The main parser is designed around structured one-line-per-item
 * text, so handing it a raw copy/paste makes it work too hard (and often
 * miss items or misread per-unit vs line totals).
 *
 * This module runs a lightweight LLM pass FIRST that rewrites the mess into
 * canonical `<product>, qty N, $<price>` lines, stitching together separate
 * "prices" and "items" blocks when the source page splits them that way
 * (classic Instacart order detail). The cleaned text then feeds into the
 * existing `parseReceiptContent` without changing that contract.
 *
 * Uses gpt-4o-mini because the job is simple rewriting and we want latency
 * + cost to stay low; the heavier reasoning (unit conversion, ingredient
 * matching) remains on gpt-4o downstream. When the input already looks
 * structured (most lines already contain a price) we skip this pass.
 */

const CLEANUP_MODEL = "gpt-4o-mini";
const CLEANUP_TIMEOUT_MS = 30_000;
const CLEANUP_MAX_CHARS = 30_000;

const SYSTEM_PROMPT = `You clean up messy receipt text so a downstream grocery parser can read it.

INPUT: raw text the user copied from a store or delivery-app page. It may be wrapped in UI chrome (navigation, shopper info, "Rate your order", footers, promos) and the price block may be separate from the item name block (e.g. Instacart lists prices first, then a "Reorder these items" list of names in the same order).

TASK: return a plain-text list with ONE line per purchased item, in the format:

  <product name with brand>, qty <N>, $<price>[ (<note>)]

Rules for the output:
- Strip every unrelated UI string: "Skip Navigation", "Search <store>", store logos, shopper badges, delivery notes, "Receipt", section counts like "Found (13)", "Rate your order", "Reorder these items", "Invite friends", footer promos, addresses, signatures. Keep only purchased items.
- When the source separates a list of prices from a list of item names, ALIGN them by position: 1st price block → 1st item name, 2nd → 2nd, etc. If the price block has fewer entries than the item block, include only as many items as there are priced entries.
- For "each"-priced items: use the "Current price" as the line price; qty is "Quantity:N" (default 1 if missing).
- For by-weight items (e.g. "$27.99/kg · 1.88 kg"): use the LINE TOTAL ("Current price") as the price, put the weight inside parentheses after the product name, and set qty 1. Example: "Kirkland Signature Organic Boneless & Skinless Chicken Breasts (1.88 kg), qty 1, $52.54".
- If a row has both "Current price" and "Original price" (a sale), use the current price and append "(sale; reg. $<original>)" after the amount. Example: "Balderson 2-Year Old Cheddar Cheese, qty 1, $16.99 (sale; reg. $20.99)".
- Preserve the product name the user wrote, but fix obvious typos, singular/plural agreement, and hyphenation (e.g. "2 Year Old" → "2-Year Old"). Do NOT invent brands, sizes, or ingredients.
- Do NOT annotate, explain, or add headers. No markdown, no bullets.
- Output UTF-8 plain text only. Each item on its own line. No blank lines.
- If the input appears to contain no purchased items, output nothing.`;

export type CleanReceiptResult =
  | { ok: true; cleaned: string }
  | { ok: false; error: string };

/**
 * Heuristic: is this paste already structured enough that we can skip the
 * cleanup LLM call? We require at least 60% of non-empty lines to contain a
 * dollar amount AND to be reasonably short (under ~160 chars) so we don't
 * accidentally consider a wall of prose with a single "$" mention as clean.
 *
 * Exported for tests.
 */
export function looksStructured(rawText: string): boolean {
  const lines = rawText
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length === 0) return false;
  let priceyLines = 0;
  for (const line of lines) {
    if (line.length > 200) continue;
    if (/\$\s?\d/.test(line)) priceyLines += 1;
  }
  return priceyLines / lines.length >= 0.6;
}

/**
 * Run the cleanup pass on a raw paste. Returns the cleaned text on success.
 * When the input already looks structured, returns it unchanged without
 * making a network call.
 */
export async function cleanReceiptContent(
  rawContent: string,
): Promise<CleanReceiptResult> {
  const trimmed = rawContent.trim();
  if (!trimmed) return { ok: false, error: "No receipt content to clean." };

  if (looksStructured(trimmed)) {
    return { ok: true, cleaned: trimmed };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    // No API key means we can't run the cleanup pass — but we shouldn't fail
    // the whole import, because structured paste still works through the
    // main parser. Fall back to the raw text and let the next pass try.
    return { ok: true, cleaned: trimmed };
  }

  const truncated = trimmed.slice(0, CLEANUP_MAX_CHARS);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CLEANUP_MODEL,
        temperature: 0.1,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: truncated },
        ],
      }),
      signal: AbortSignal.timeout(CLEANUP_TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error: `OpenAI API error (${res.status}): ${body.slice(0, 200)}`,
      };
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const cleaned = data.choices?.[0]?.message?.content?.trim();
    if (!cleaned) {
      // Model returned nothing — treat as "no cleanup needed" rather than an
      // error so the main parser still gets a chance on the raw text.
      return { ok: true, cleaned: trimmed };
    }
    return { ok: true, cleaned };
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return {
        ok: false,
        error: "Receipt cleanup timed out. Try pasting a smaller chunk.",
      };
    }
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Unknown error while cleaning receipt text.",
    };
  }
}
