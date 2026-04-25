/**
 * Receipt line enrichment via OpenAI Responses API + built-in web_search tool.
 *
 * After the initial parse, most receipt lines have a product name and quantity
 * but are often missing accurate pack size, units per pack, or canonical brand
 * (because receipts abbreviate). We hand each under-specified line to an LLM
 * with live web search and ask it to look the product up and fill the gaps.
 *
 * This is strictly best-effort — if enrichment fails for any reason (no API
 * key, timeout, rate limit, parse error) the original row is returned
 * untouched so the review UI still works.
 */
import { INGREDIENT_UNIT_VALUES } from "@/lib/unit-mapping";

const ENRICH_MODEL = "gpt-4o";
/** Per-call timeout. Web searches are slow; keep this tight to bound total latency. */
const ENRICH_TIMEOUT_MS = 20_000;
/** How many web-search calls can be in flight at once. */
const ENRICH_CONCURRENCY = 6;
/** Hard cap on rows we'll ever send to web search, regardless of receipt size. */
const ENRICH_ROW_CAP = 20;

export type EnrichmentInput = {
  /** Stable id so we can correlate the async results back to the caller. */
  id: string;
  rawLine: string;
  productName: string | null;
  productBrand: string | null;
  unitSizeAmount: number | null;
  unitSizeUnit: string | null;
  /** Hint: the ingredient name this line was matched to (e.g. "Peanut Butter"). */
  matchedIngredientName: string | null;
  /** Hint: the inventory's stock unit (e.g. "g", "count"). */
  inventoryUnit: string | null;
};

export type EnrichmentPatch = {
  productName: string | null;
  productBrand: string | null;
  unitSizeAmount: number | null;
  unitSizeUnit: string | null;
};

/** Whether a row has enough product context to justify a web search. */
export function shouldEnrichRow(row: EnrichmentInput): boolean {
  const hasProductName =
    (row.productName && row.productName.trim().length > 0) ||
    row.rawLine.trim().split(/\s+/).length >= 2;
  if (!hasProductName) return false;

  if (!row.productBrand || row.unitSizeAmount == null || !row.unitSizeUnit) {
    return true;
  }

  // If the receipt itself hints at product state, web search can still confirm
  // details like Frozen/Refrigerated that affect how the item should be stored.
  return /\b(frozen|refrigerated|smoked|roasted|salted|shelled|extra\s+firm)\b/i.test(
    row.rawLine,
  );
}

const SYSTEM_PROMPT = `You are a grocery product research assistant. The user will give you a single line from a supermarket receipt plus any fields they were able to extract. Your job is to use web search to look up the actual retail product and return a cleaner, more complete description of ONE pack / jar / bottle / bag of the product.

Rules:
- Search for the EXACT product as it appears on the receipt. Prefer official brand sites, retailer pages (Amazon, Walmart, Target, Tesco, Sainsbury's, Whole Foods, etc.), and grocery manufacturer listings.
- Return information about ONE physical pack, jar, bottle or bag of the product — never the receipt line total or multi-pack case size unless the product itself is sold as a multi-pack.
- unitSizeAmount + unitSizeUnit describe what the user gets from ONE purchased package. For a 6-count bagel bag use unitSizeAmount=6 and unitSizeUnit="count". For a 4-pack of tuna cans use unitSizeAmount=4 and unitSizeUnit="can" (not 1 package). For a 340g peanut butter jar use 340 and "g". For a 1L oat milk use 1 and "l". For a 16 fl oz can use 16 and "fl oz".
- unitSizeUnit MUST be one of these exact strings: count, g, kg, oz, lb, ml, l, fl oz, cup, tsp, tbsp, ea, piece, dozen, whole, clove, slice, sprig, pinch, head, bunch, pkg, bag, box, block, tub, container, jar, bottle, can, roll, sleeve.
- If the user already supplied a field, still return your best answer. The caller may use your answer to correct or enrich the first-pass parse.
- Include meaningful product state in productName when the official listing or retailer department identifies it: Frozen, Refrigerated, Smoked, Roasted, Salted, Shelled, Extra Firm, etc. Example: if a Costco page lists Nature's Touch Organic Raspberries under Frozen Fruit & Vegetables or says "Keep Frozen", return productName="Frozen Organic Raspberries".
- If web search turns up nothing reliable, return null for any field you can't verify. NEVER guess — a null is better than a wrong number.
- productName should be the canonical retail name in AP-style Title Case (no brand prefix — brand goes in productBrand).
- productBrand is just the brand/manufacturer, Title Case, no trailing descriptors.
- Prices are NOT part of this task. Ignore price fields.
- Return ONLY valid JSON matching the provided schema. No prose, no citations, no markdown.`;

/** JSON schema for the Responses API structured output. */
const ENRICH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    productName: { type: ["string", "null"] },
    productBrand: { type: ["string", "null"] },
    unitSizeAmount: { type: ["number", "null"] },
    unitSizeUnit: { type: ["string", "null"] },
  },
  required: ["productName", "productBrand", "unitSizeAmount", "unitSizeUnit"],
} as const;

function buildUserContent(row: EnrichmentInput): string {
  const known: string[] = [];
  if (row.productName) known.push(`productName="${row.productName}"`);
  if (row.productBrand) known.push(`productBrand="${row.productBrand}"`);
  if (row.unitSizeAmount != null)
    known.push(`unitSizeAmount=${row.unitSizeAmount}`);
  if (row.unitSizeUnit) known.push(`unitSizeUnit="${row.unitSizeUnit}"`);
  if (row.matchedIngredientName)
    known.push(`matchedIngredient="${row.matchedIngredientName}"`);
  if (row.inventoryUnit) known.push(`inventoryStockUnit="${row.inventoryUnit}"`);

  const knownBlock = known.length
    ? `Fields already known from the receipt:\n${known.map((l) => `- ${l}`).join("\n")}\n`
    : "";

  return `${knownBlock}Receipt line (verbatim):\n"${row.rawLine}"\n\nUse web search to find this product and return the canonical pack size, brand and product name for ONE physical pack.`;
}

/* ------------------------------------------------------------------ */
/*  Coercion helpers                                                  */
/* ------------------------------------------------------------------ */

function safeString(v: unknown, maxLen = 160): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

function safeNonNegNumber(v: unknown): number | null {
  if (v == null) return null;
  const n =
    typeof v === "number" ? v : Number(String(v).replace(/[^\d.\-]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function safeUnit(v: unknown): string | null {
  const s = safeString(v, 20);
  if (!s) return null;
  const lower = s.toLowerCase();
  if (INGREDIENT_UNIT_VALUES.has(lower)) return lower;
  return null;
}

/**
 * Pull the model's final JSON out of the Responses API payload. The Responses
 * API returns an `output` array containing mixed items (web_search_call,
 * message, etc.). We want the text content of the final message.
 */
function extractJsonFromResponses(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  const anyData = data as {
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };

  const candidates: string[] = [];
  if (typeof anyData.output_text === "string" && anyData.output_text.trim()) {
    candidates.push(anyData.output_text);
  }
  if (Array.isArray(anyData.output)) {
    for (const item of anyData.output) {
      if (item?.type !== "message" || !Array.isArray(item.content)) continue;
      for (const part of item.content) {
        if (part?.type === "output_text" && typeof part.text === "string") {
          candidates.push(part.text);
        }
      }
    }
  }

  for (const raw of candidates) {
    const trimmed = raw.trim();
    // Strip possible ```json fences just in case.
    const fence = /^```(?:json)?\s*([\s\S]*?)```/im.exec(trimmed);
    const blob = fence?.[1]?.trim() ?? trimmed;
    try {
      const parsed = JSON.parse(blob) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Single-row web-search call                                        */
/* ------------------------------------------------------------------ */

async function enrichSingleRow(
  apiKey: string,
  row: EnrichmentInput,
): Promise<EnrichmentPatch | null> {
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ENRICH_MODEL,
        tools: [{ type: "web_search" }],
        tool_choice: "auto",
        instructions: SYSTEM_PROMPT,
        input: buildUserContent(row),
        text: {
          format: {
            type: "json_schema",
            name: "product_enrichment",
            schema: ENRICH_SCHEMA,
            strict: true,
          },
        },
      }),
      signal: AbortSignal.timeout(ENRICH_TIMEOUT_MS),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as unknown;
    const json = extractJsonFromResponses(data);
    if (!json) return null;

    return {
      productName: safeString(json.productName, 160),
      productBrand: safeString(json.productBrand, 80),
      unitSizeAmount: safeNonNegNumber(json.unitSizeAmount),
      unitSizeUnit: safeUnit(json.unitSizeUnit),
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Public entrypoint                                                 */
/* ------------------------------------------------------------------ */

export type EnrichmentResult = {
  id: string;
  patch: EnrichmentPatch | null;
};

/**
 * Enrich the given rows in parallel (bounded concurrency). Returns a map of
 * input id → patch (or null if enrichment failed for that row).
 *
 * Caller is responsible for merging patches with their own priority rules
 * (e.g. "only fill fields the receipt didn't already give us").
 */
export async function enrichRowsWithWebSearch(
  rows: EnrichmentInput[],
): Promise<Map<string, EnrichmentPatch>> {
  const results = new Map<string, EnrichmentPatch>();

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return results;
  if (!rows.length) return results;

  const work = rows.slice(0, ENRICH_ROW_CAP);

  let cursor = 0;
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(ENRICH_CONCURRENCY, work.length); i++) {
    workers.push(
      (async () => {
        while (true) {
          const idx = cursor++;
          if (idx >= work.length) return;
          const row = work[idx];
          const patch = await enrichSingleRow(apiKey, row);
          if (patch) results.set(row.id, patch);
        }
      })(),
    );
  }

  await Promise.all(workers);
  return results;
}
