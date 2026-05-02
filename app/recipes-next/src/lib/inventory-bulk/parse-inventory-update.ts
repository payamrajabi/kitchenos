/**
 * Free-text inventory stocktake parser.
 *
 * The user dictates (or types) what they currently have on hand — e.g.
 * "I have 18 eggs, half a dozen lemons, and about two pounds of ground beef" —
 * and we turn that into structured stock-set instructions.
 *
 * Unlike receipt parsing, the result is OVERWRITE semantics: each item sets
 * the on-hand quantity to the stated amount. New ingredient names create new
 * ingredients (title-cased). Empty / unparseable lines are returned with a
 * `skipReason` so the UI can show them quietly without blocking apply.
 *
 * Mirrors the OpenAI usage pattern in `lib/receipt-import/parse-receipt.ts`
 * (gpt-4o-mini, JSON mode, OPENAI_API_KEY env check, modest timeout).
 */

import { INGREDIENT_UNIT_VALUES } from "@/lib/unit-mapping";
import {
  buildInventoryMatchIndex,
  matchReceiptLineToInventory,
  type InventoryMatchCandidate,
} from "@/lib/receipt-import/match-inventory";

const PARSE_MODEL = "gpt-4o-mini";
/** Per-call timeout. Long voice-dictated stocktakes (40+ items) put
 * gpt-4o-mini's structured-JSON latency well above 60s, so each chunk
 * gets a 90s budget. We also chunk the input below to keep each
 * individual response small. */
const PARSE_TIMEOUT_MS = 90_000;
/** Max number of non-empty input lines to send in one parse call. The
 * model's JSON-mode latency goes nonlinear once the response gets
 * large, so we split big stocktakes into parallel chunks the same way
 * the receipt parser does. */
const PARSE_CHUNK_SIZE = 12;
/** Cap how many chunks we'll parallelize. Large enough to swallow a
 * 60-item stocktake in one round-trip; small enough not to spam the
 * API. */
const PARSE_MAX_CHUNKS = 6;

function tryParseJsonObject(content: string): Record<string, unknown> | null {
  const trimmed = content.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```/im.exec(trimmed);
  const blob = fence?.[1]?.trim() ?? trimmed;
  for (const candidate of [blob, trimmed]) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

export type StocktakeInventoryHint = {
  id: number;
  name: string;
  aliases?: string[];
  /** Current stock unit, e.g. "g", "count". Null when unset. */
  unit: string | null;
};

export type ParsedStocktakeItem = {
  /** Verbatim user phrase that produced this item (best-effort). */
  rawLine: string;
  /** Inventory ingredient the LLM matched against; null when no match. */
  matchedIngredientId: number | null;
  /** Display name for the matched ingredient (or proposed new name). */
  matchedIngredientName: string | null;
  /** When matchedIngredientId is null, the title-cased name to create. */
  newIngredientName: string | null;
  /** New on-hand quantity to SET (not add). Null = "I have some" with no number. */
  quantity: number | null;
  /** Stock unit that `quantity` is expressed in. */
  unit: string | null;
  /**
   * The product name the user said, when they referred to a specific brand /
   * branded product. Null when they only mentioned the generic ingredient
   * (e.g. "organic lemon juice" — no brand → both productName and
   * productBrand are null and no preferred-product is written).
   */
  productName: string | null;
  /** Brand portion of the product, when one was mentioned. */
  productBrand: string | null;
  /** Pack size amount, when stated (e.g. 290 for "290 ml"). */
  unitSizeAmount: number | null;
  /** Pack size unit (e.g. "ml"). */
  unitSizeUnit: string | null;
  confidence: "high" | "medium" | "low";
  /** Set when we couldn't extract an actionable stock-set from the phrase. */
  skipReason: string | null;
};

function buildInventoryBlock(inventory: StocktakeInventoryHint[]): string {
  if (!inventory.length) {
    return "The user has no inventory ingredients yet. Treat every item as a NEW ingredient (matchedIngredientId = null, newIngredientName populated).";
  }
  const lines = inventory.map((i) => {
    const parts: string[] = [`id=${i.id}`, `name="${i.name}"`];
    if (i.unit) parts.push(`unit="${i.unit}"`);
    if (i.aliases?.length) {
      parts.push(`aliases="${i.aliases.slice(0, 8).join(", ")}"`);
    }
    return `- ${parts.join(", ")}`;
  });
  return `INVENTORY (the user's existing ingredients, each with its current stock unit):\n${lines.join("\n")}`;
}

const SYSTEM_PROMPT = `You are an inventory stocktake parser. The user is reading off what they currently have in their kitchen — pantry, fridge, freezer, cupboards. The input is OFTEN a voice-to-text transcription, so expect:
- Misspellings of food names ("clamata" for "kalamata", "shitake" for "shiitake", "kapers" for "capers", "guanchale" for "guanciale", "espinach" for "spinach"). These are transcription errors, not new foods.
- Filler ("uh", "okay", "let me see"), self-corrections ("garlic ale or sorry, garlic"), and run-on sentences.
- Imprecise quantities ("one bottle of", "a jar of", "a few", "some"). Container nouns are quantities.
- Optional brand mentions sprinkled in.

You will also receive a list of the user's existing INVENTORY ingredients, each with an id and the ingredient's current stock unit (e.g. "g", "ml", "count").

For each distinct food item the user mentions, return ONE item describing the **new on-hand quantity to SET** (not add) for that ingredient.

============================================================
RULE 1 — The ingredient name is what a RECIPE would call this food.
============================================================
The inventory ingredient is the generic food category — never a brand, never a product description, never a regional/style adjective that recipes don't bother with. Apply the **"would a recipe say this?"** test:

- Would a recipe say "add 1 jar of dill pickles" or "add 1 jar of kosher dill pickles"? -> "Dill Pickles".
- Would a recipe say "drizzle with chili oil" or "drizzle with Japanese chili oil"? -> "Chili Oil".
- Would a recipe say "stir in red chili paste" or "stir in roasted red chili paste"? -> "Red Chili Paste". (Roasted is the only common form; the modifier is redundant.)
- Would a recipe say "use cottage cheese" or "use 4% cottage cheese"? -> "Cottage Cheese".
- Would a recipe say "add Greek yogurt" or "add organic Greek yogurt"? -> "Greek Yogurt".

Specifically, STRIP these classes of modifier from both matchedIngredientName AND newIngredientName (they belong in productName/productBrand, not in the ingredient name):
- Brand names: "Kirkland Signature", "Bubbies", "Spice World", "DOM Reserve", "Mezzetta", "Joe Beef", "Earth's Choice", etc.
- Marketing words: "organic", "natural", "free-range", "cage-free", "grass-fed", "non-GMO", "raw", "extra-virgin" (when not the canonical form), "small-batch", "artisan", "premium", "select".
- Quality grades and processing words that don't change recipe identity: "kosher" (on pickles, salt-style sauces, etc.), "lean" (on ground beef), "extra firm" (on tofu — unless the user has a separate Extra Firm Tofu ingredient on file), "shelled" (on nuts), "frozen", "fresh".
- Regional/style adjectives that recipes generalize over: "Japanese" (on chili oil, soy sauce), "Italian" (on parsley, sausage — unless that's the only style), "Sicilian", "Mexican", "Greek" (when on a non-defining word like "Greek-style yogurt" — but KEEP it for "Greek Yogurt", which is its own category).
- Pleonastic process words: "roasted" (on chili paste, tahini, peanuts — when there's no widely-used unroasted form), "toasted" (on sesame oil — both forms exist, KEEP it).

Things you should NOT strip — these are real ingredient distinctions:
- Variant words that map to a different food entirely: "Garlic" ≠ "Garlic Powder", "Lemon" ≠ "Lemon Juice", "Coconut Milk" ≠ "Coconut".
- Form words that change how a recipe uses the ingredient: "Smoked" (smoked salmon vs. salmon), "Dried" (dried mango vs. mango), "Pickled" (pickled jalapeños vs. jalapeños), "Whole" vs. "Crushed" (tomatoes), "Minced" (minced garlic vs. garlic).
- Colour words when colour is a real distinction: "Red Bell Pepper" vs "Yellow Bell Pepper" (both can exist), "White Onions" vs "Yellow Onions", "Black Pepper" vs "White Pepper", "Red Curry Paste" vs "Green Curry Paste".

Tolerate misspellings and homophones. Voice transcripts mangle food names — pick the closest existing inventory ingredient by sound rather than by spelling: "Clamata olives" -> "Kalamata Olives". "Shitake mushrooms" -> "Shiitake Mushroom". "Kapers" -> "Capers". "Genmi miso" -> "Miso" (or whichever specific miso the user has on file).

Process:
1. Build the candidate generic name by applying the rules above.
2. Look it up in INVENTORY (matching its name OR any of its aliases).
3. If found -> matchedIngredientId + matchedIngredientName, leave newIngredientName null.
4. If not found -> matchedIngredientId = null and put the AP-Title-Cased generic name in newIngredientName.

Treat new-ingredient creation as a LAST RESORT — re-read the inventory list before giving up. Many "new" ingredients are actually existing ones with a brand-y phrase wrapped around them.

============================================================
RULE 2 — Container nouns count as quantity = 1.
============================================================
This is a STOCKTAKE, not a shopping receipt. Imprecise quantities are fine — we want to know roughly how much is on hand, not exact grams.

If the user's phrase mentions a container ("one bottle of", "a jar of", "one tub of", "a can of", "one package of", "a box of", "one head of", "a bunch of") with NO accompanying weight or volume:
  -> quantity = 1 (or whatever count they said: "two jars" -> 2)
  -> unit = the container word ("bottle", "jar", "tub", "can", "pkg", "box", "head", "bunch")
  -> skipReason = null
  -> confidence = "high" (or "medium" if the ingredient match was fuzzy)

NEVER set skipReason just because the user didn't give grams or millilitres. "One bottle of organic lime juice" is a complete, valid stocktake item.

If the phrase ALSO contains a weight/volume ("one jar of red curry paste 112 grams"), prefer the explicit measurement. If the inventory unit is mass/volume, convert to that unit. Otherwise return both:
  - quantity = 112, unit = "g"
  - unitSizeAmount = 112, unitSizeUnit = "g" (capture the pack size too)

If the inventory unit is "count", treat each container as one count: "two jars of olives" -> quantity = 2, unit = "count".

Set quantity = null ONLY when the user gave no count, no container, and no measurement at all:
  - "Some chicken thighs" -> quantity = null, skipReason = null (the user signalled presence but no amount).
  - "I think there's lemon juice" -> quantity = null, skipReason = null.

============================================================
RULE 3 — Extract brand and product when the user names them.
============================================================
A brand is named when the user says a recognisable brand name (Kirkland, Spice World, Mezzetta, DOM, Salt Spring, Earth's Choice, Yogu, Chosen Foods, Joe Beef, etc.) before the food. The combination of (brand, product description) is what should land in productBrand + productName.

- "One bottle of Spice World minced garlic" -> productBrand = "Spice World", productName = "Minced Garlic".
- "Two containers of Kirkland Signature organic Greek yogurt" -> productBrand = "Kirkland Signature", productName = "Organic Greek Yogurt".
- "One jar of Mezzetta organic red bell peppers" -> productBrand = "Mezzetta", productName = "Organic Red Bell Peppers".

When NO brand is mentioned ("organic lemon juice", "lemon juice", "two pounds of ground beef"), leave BOTH productName and productBrand null — the caller will only bump stock for the generic ingredient and won't write a preferred product.

Decorators alone aren't a brand: "organic", "free-range", "raw", "shelled", "extra-firm" do not signal a brand. They go into productName only when a brand is also present.

============================================================
RULE 4 — Pack size capture (optional).
============================================================
When the user states a pack size ("one jar 112 grams", "one bottle 1 liter", "one tub 200 grams"), capture it in unitSizeAmount + unitSizeUnit. This helps the caller hydrate preferred products. Leave both null otherwise.

============================================================
RULE 5 — Allowed unit strings.
============================================================
Use only: count, g, kg, oz, lb, ml, l, fl oz, cup, tsp, tbsp, ea, piece, dozen, whole, clove, slice, sprig, pinch, head, bunch, pkg, bag, box, block, tub, container, jar, bottle, can, roll, sleeve.

============================================================
RULE 6 — Confidence.
============================================================
- "high": clean ingredient match (existing OR clear new) AND a clear quantity (number-or-container) in a sensible unit.
- "medium": ingredient match is fuzzy (typo correction, ambiguous variant) OR unit conversion is approximate.
- "low": no usable quantity AND no container AND no clear food name.

============================================================
RULE 7 — Skip reasons.
============================================================
Set skipReason ONLY for phrases that are not inventory items at all: "uh", "okay let me think", "that's it", "next shelf". For these, leave matched/quantity/product fields null and confidence = "low".

DO NOT set skipReason when:
  - The user mentioned a container without a weight (Rule 2 applies — quantity = 1).
  - The user just said the food name without a number ("Some chicken thighs"). Use quantity = null + skipReason = null and let the caller decide.

============================================================
RULE 8 — Deduplication.
============================================================
If the user mentions the same ingredient twice, return ONE row with the LAST quantity they stated (assume they corrected themselves).

============================================================
OUTPUT SCHEMA
============================================================
Return a SINGLE JSON object with this exact shape:

{
  "items": [
    {
      "rawLine": "verbatim phrase",
      "matchedIngredientId": 42 | null,
      "matchedIngredientName": "Kalamata Olives" | null,
      "newIngredientName": null | "Sourdough Bread",
      "quantity": 12 | 1 | null,
      "unit": "count" | "bottle" | "g" | null,
      "productName": "Organic Greek Yogurt" | null,
      "productBrand": "Kirkland Signature" | null,
      "unitSizeAmount": 290 | null,
      "unitSizeUnit": "ml" | null,
      "confidence": "high" | "medium" | "low",
      "skipReason": null | "Not an inventory item."
    }
  ]
}

Return ONLY valid JSON. No markdown, no explanation, no extra text.

============================================================
WORKED EXAMPLES
============================================================

Example A — phrase: "One jar of organic pitted clamata olives 290 milliliters". Inventory has "Kalamata Olives" tracked in "g".
Output: matchedIngredientId=<id of Kalamata Olives>, matchedIngredientName="Kalamata Olives", newIngredientName=null, quantity=290, unit="ml", productName=null, productBrand=null, unitSizeAmount=290, unitSizeUnit="ml", confidence="medium" (typo + ml/g unit mismatch), skipReason=null.
Notes: "clamata" is a transcription error for "kalamata" — match it. The user gave a measurement, so prefer it over the container. Inventory unit is "g" but they said "ml", so still return ml; the caller can flag this in review.

Example B — phrase: "one bottle of organic lemon juice". Inventory has "Lemon Juice" tracked in "ml".
Output: matchedIngredientId=<id of Lemon Juice>, matchedIngredientName="Lemon Juice", quantity=1, unit="bottle", productName=null, productBrand=null, unitSizeAmount=null, unitSizeUnit=null, confidence="high", skipReason=null.
Notes: NO brand → no preferred product. Container = quantity 1.

Example C — phrase: "one bottle of Spice World minced garlic, organic". Inventory has "Garlic" tracked in "count" (NO inventory entry for minced garlic).
Output: matchedIngredientId=null, newIngredientName="Minced Garlic", quantity=1, unit="bottle", productName="Organic Minced Garlic", productBrand="Spice World", confidence="medium", skipReason=null.
Notes: "Minced Garlic" is a different food from "Garlic". Brand IS named → populate product fields.

Example D — phrase: "Two containers of Kirkland signature organic Greek yogurt". Inventory has "Greek Yogurt" tracked in "g".
Output: matchedIngredientId=<id>, matchedIngredientName="Greek Yogurt", quantity=2, unit="container", productName="Organic Greek Yogurt", productBrand="Kirkland Signature", confidence="high".

Example E — phrase: "Three and a half cartons of eggs, one dozen each". Inventory has "Eggs" tracked in "count".
Output: matchedIngredientId=<id>, matchedIngredientName="Eggs", quantity=42, unit="count", confidence="high", skipReason=null.
Notes: 3.5 × 12 = 42.

Example F — phrase: "Some chicken thighs". Inventory has "Chicken Thighs" in "count".
Output: matchedIngredientId=<id>, matchedIngredientName="Chicken Thighs", quantity=null, unit=null, confidence="low", skipReason=null.

Example G — phrase: "Uh okay that's it". Output: rawLine="Uh okay that's it", everything else null, confidence="low", skipReason="Not an inventory item.".

Example H — phrase: "one jar of Bubbies kosher dill pickles". No "Kosher Dill Pickles" or "Dill Pickles" in inventory.
Output: matchedIngredientId=null, newIngredientName="Dill Pickles", quantity=1, unit="jar", productName="Kosher Dill Pickles", productBrand="Bubbies", confidence="high", skipReason=null.
Notes: A recipe says "add dill pickles", not "add kosher dill pickles". "Kosher" stays in productName because it's printed on the jar.

Example I — phrase: "one jar of Okazu chili miso Japanese chili oil". No matching inventory.
Output: matchedIngredientId=null, newIngredientName="Chili Oil", quantity=1, unit="jar", productName="Chili Miso Japanese Chili Oil", productBrand="Okazu", confidence="high".
Notes: A recipe says "drizzle with chili oil", not "drizzle with Japanese chili oil". Region/style adjective gets stripped from the ingredient name and kept in productName.

Example J — phrase: "one jar of roasted red chili paste". No "Red Chili Paste" in inventory; no brand mentioned.
Output: matchedIngredientId=null, newIngredientName="Red Chili Paste", quantity=1, unit="jar", productName=null, productBrand=null, confidence="high".
Notes: "Roasted" is the canonical form — recipes don't bother. No brand → no preferred product.

Example K — phrase: "Two containers of Kirkland signature organic Greek yogurt". Inventory has "Greek Yogurt".
Output: matchedIngredientId=<id>, matchedIngredientName="Greek Yogurt", quantity=2, unit="container", productName="Organic Greek Yogurt", productBrand="Kirkland Signature", confidence="high".
Notes: "Greek" stays here because "Greek Yogurt" is its own ingredient category (distinct from regular yogurt).

Example L — phrase: "one head of organic cauliflower". Inventory has "Cauliflower".
Output: matchedIngredientId=<id>, matchedIngredientName="Cauliflower", quantity=1, unit="head", productName=null, productBrand=null, confidence="high".
Notes: "Organic" alone is not a brand — drop it everywhere.`;

function safeString(v: unknown, maxLen = 240): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  return s.slice(0, maxLen);
}

function safeNumber(v: unknown): number | null {
  if (v == null) return null;
  const n =
    typeof v === "number" ? v : Number(String(v).replace(/[^\d.\-]/g, ""));
  if (!Number.isFinite(n)) return null;
  return n;
}

function safeNonNegNumber(v: unknown): number | null {
  const n = safeNumber(v);
  if (n == null) return null;
  if (n < 0) return null;
  return n;
}

function safePositiveInt(v: unknown): number | null {
  const n = safeNumber(v);
  if (n == null) return null;
  const t = Math.trunc(n);
  if (t <= 0) return null;
  return t;
}

function safeConfidence(v: unknown): "high" | "medium" | "low" {
  const s = String(v ?? "").toLowerCase();
  if (s === "high" || s === "medium" || s === "low") return s;
  return "low";
}

function safeUnit(v: unknown): string | null {
  const s = safeString(v, 20);
  if (!s) return null;
  const lower = s.toLowerCase();
  if (INGREDIENT_UNIT_VALUES.has(lower)) return lower;
  return null;
}

function sanitizeItem(raw: unknown): ParsedStocktakeItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const rawLine = safeString(r.rawLine, 240) ?? "";
  if (!rawLine) return null;

  return {
    rawLine,
    matchedIngredientId: safePositiveInt(r.matchedIngredientId),
    matchedIngredientName: safeString(r.matchedIngredientName, 160),
    newIngredientName: safeString(r.newIngredientName, 160),
    quantity: safeNonNegNumber(r.quantity),
    unit: safeUnit(r.unit),
    productName: safeString(r.productName, 160),
    productBrand: safeString(r.productBrand, 80),
    unitSizeAmount: safeNonNegNumber(r.unitSizeAmount),
    unitSizeUnit: safeUnit(r.unitSizeUnit),
    confidence: safeConfidence(r.confidence),
    skipReason: safeString(r.skipReason, 120),
  };
}

/** Internal: a single LLM round-trip for one chunk of the stocktake. */
async function parseStocktakeChunk(
  apiKey: string,
  chunkText: string,
  inventoryBlock: string,
): Promise<
  | { ok: true; items: ParsedStocktakeItem[] }
  | { ok: false; error: string }
> {
  const userContent = `${inventoryBlock}\n\nSTOCKTAKE:\n${chunkText}`;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: PARSE_MODEL,
        temperature: 0.15,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
      signal: AbortSignal.timeout(PARSE_TIMEOUT_MS),
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
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return { ok: false, error: "No response from the AI model." };

    const parsed = tryParseJsonObject(raw);
    if (!parsed) {
      return { ok: false, error: "Could not parse AI response as JSON." };
    }

    const itemsRaw = Array.isArray(parsed.items) ? parsed.items : [];
    const items = itemsRaw
      .map(sanitizeItem)
      .filter((x): x is ParsedStocktakeItem => x != null);

    return { ok: true, items };
  } catch (err) {
    // AbortSignal.timeout fires a TimeoutError DOMException — translate
    // that into something a user can understand. Everything else falls
    // through with the original message.
    if (err instanceof Error) {
      const isTimeout =
        err.name === "TimeoutError" ||
        /aborted due to timeout/i.test(err.message);
      if (isTimeout) {
        return {
          ok: false,
          error:
            "The stocktake took too long to read. Try a shorter dictation, or try again in a moment.",
        };
      }
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Inventory update parsing failed." };
  }
}

/**
 * Split the input by line into PARSE_CHUNK_SIZE-line chunks. Mirrors the
 * receipt parser's strategy: a single 90s budget can't always swallow a
 * 40+ item stocktake, but six 90s budgets running in parallel can.
 */
function chunkStocktakeText(rawContent: string): string[] {
  const lines = rawContent.split(/\r?\n/);
  const nonEmptyCount = lines.filter((l) => l.trim()).length;
  if (nonEmptyCount <= PARSE_CHUNK_SIZE) return [rawContent];

  const chunks: string[] = [];
  let current: string[] = [];
  let countInCurrent = 0;
  for (const line of lines) {
    current.push(line);
    if (line.trim()) {
      countInCurrent += 1;
      if (countInCurrent >= PARSE_CHUNK_SIZE) {
        chunks.push(current.join("\n"));
        current = [];
        countInCurrent = 0;
      }
    }
    if (chunks.length >= PARSE_MAX_CHUNKS - 1) break;
  }
  if (current.length) chunks.push(current.join("\n"));

  // Anything past the cap goes into the final chunk verbatim. Better to
  // have one slightly-too-big chunk than to silently drop tail items.
  if (chunks.length === PARSE_MAX_CHUNKS) {
    const consumedLines = chunks.slice(0, -1).join("\n").split(/\r?\n/).length;
    const tail = lines.slice(consumedLines).join("\n");
    chunks[chunks.length - 1] = tail;
  }

  return chunks;
}

export async function parseInventoryUpdateContent(
  rawContent: string,
  inventory: StocktakeInventoryHint[],
): Promise<
  | { ok: true; items: ParsedStocktakeItem[] }
  | { ok: false; error: string }
> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error:
        "OPENAI_API_KEY is not set. Add it to .env.local to enable inventory updates from text.",
    };
  }

  const content = rawContent.trim();
  if (!content) {
    return { ok: false, error: "Type or paste what you have on hand first." };
  }

  // 8k chars is generous for a stocktake monologue and keeps prompt cost low.
  const truncated = content.slice(0, 8_000);
  // Voice transcripts often arrive as one giant paragraph. Split sentences
  // onto their own lines so the chunker has natural seams to slice on —
  // otherwise the whole stocktake stays in a single chunk and we re-hit
  // the timeout we just fixed.
  const normalisedForChunking = truncated
    .replace(/([.!?])\s+/g, "$1\n")
    .replace(/\n{2,}/g, "\n");
  const inventoryBlock = buildInventoryBlock(inventory);

  const chunks = chunkStocktakeText(normalisedForChunking);
  const results = await Promise.all(
    chunks.map((chunk) => parseStocktakeChunk(apiKey, chunk, inventoryBlock)),
  );

  const allItems = results.flatMap((r) => (r.ok ? r.items : []));
  const firstError = results.find((r) => !r.ok);
  // Failure semantics: if EVERY chunk failed, surface the first error.
  // If at least one chunk succeeded, return its items even though we lost
  // some (the user can re-dictate the missing portion).
  if (allItems.length === 0 && firstError && !firstError.ok) {
    return { ok: false, error: firstError.error };
  }

  // Reject hallucinated ingredient ids — must exist in the context we sent.
  const validIds = new Set(inventory.map((i) => i.id));
  for (const item of allItems) {
    if (
      item.matchedIngredientId != null &&
      !validIds.has(item.matchedIngredientId)
    ) {
      item.matchedIngredientId = null;
      item.matchedIngredientName = null;
      if (item.confidence === "high") item.confidence = "medium";
    }
  }

  // Deterministic + fuzzy fallback. The LLM should normally catch
  // misspellings (the prompt nags it about that), but if it still
  // proposes a "new" ingredient when there's a clear existing match —
  // exact name, an alias, or a small typo — promote that match here.
  // Cheap insurance against the model being too literal on a bad day.
  runDeterministicMatchPass(allItems, inventory);

  return { ok: true, items: allItems };
}

/* ------------------------------------------------------------------ */
/*  Deterministic + fuzzy fallback for missed matches                 */
/* ------------------------------------------------------------------ */

/** Levenshtein-ish single-edit distance check. Returns true if `a` and
 *  `b` are within ONE insertion/deletion/substitution of each other.
 *  Cheap enough to call per ingredient per row at the sizes we care
 *  about (a few hundred ingredients, dozens of rows). */
function withinSingleEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;

  if (la === lb) {
    let diffs = 0;
    for (let i = 0; i < la; i++) {
      if (a[i] !== b[i] && ++diffs > 1) return false;
    }
    return true;
  }

  // Length differs by 1 — check single insertion alignment.
  const [shorter, longer] = la < lb ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i += 1;
      j += 1;
    } else {
      if (++edits > 1) return false;
      j += 1;
    }
  }
  return true;
}

/** Token-set fuzzy matcher: returns the inventory hint whose name shares
 *  enough tokens with the candidate name to count as the same ingredient,
 *  tolerating a single-character typo per token. Returns null when no
 *  hint is close enough. */
function fuzzyMatchInventory(
  candidate: string,
  inventory: StocktakeInventoryHint[],
): StocktakeInventoryHint | null {
  const candTokens = candidate
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
  if (candTokens.length === 0) return null;

  let best: { hint: StocktakeInventoryHint; score: number } | null = null;
  for (const hint of inventory) {
    const hintTokens = hint.name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3);
    if (hintTokens.length === 0) continue;

    let matched = 0;
    for (const ct of candTokens) {
      const hit = hintTokens.find((ht) => withinSingleEdit(ct, ht));
      if (hit) matched += 1;
    }
    // Require coverage of MOST tokens on both sides — protects against
    // accidental "Olive Oil" matching "Kalamata Olives" via the shared
    // "olive" token.
    const coverage = matched / Math.max(candTokens.length, hintTokens.length);
    if (coverage >= 0.75 && matched >= 1) {
      if (!best || coverage > best.score) {
        best = { hint, score: coverage };
      }
    }
  }
  return best?.hint ?? null;
}

function inventoryToMatchCandidates(
  inventory: StocktakeInventoryHint[],
): InventoryMatchCandidate[] {
  return inventory.map((i) => ({
    id: i.id,
    name: i.name,
    aliases: i.aliases,
  }));
}

/** Mutate `items` in place: any unmatched item whose proposed name lines
 *  up with an existing inventory ingredient (deterministic token-window
 *  match first, then a single-edit fuzzy pass) gets promoted to a
 *  matched row. */
function runDeterministicMatchPass(
  items: ParsedStocktakeItem[],
  inventory: StocktakeInventoryHint[],
): void {
  if (items.length === 0 || inventory.length === 0) return;
  const index = buildInventoryMatchIndex(inventoryToMatchCandidates(inventory));
  const inventoryById = new Map<number, StocktakeInventoryHint>();
  for (const hint of inventory) inventoryById.set(hint.id, hint);

  for (const item of items) {
    if (item.matchedIngredientId != null) continue;
    if (item.skipReason) continue;

    const probeStrings = [
      item.newIngredientName,
      item.matchedIngredientName,
      item.rawLine,
    ].filter((s): s is string => Boolean(s));

    let matched: { id: number; name: string } | null = null;
    for (const probe of probeStrings) {
      const det = matchReceiptLineToInventory(probe, index);
      if (det) {
        matched = det.ingredient;
        break;
      }
    }

    if (!matched) {
      // Fuzzy fallback against the candidate name only — too noisy to
      // run against the entire raw line.
      const candidate = item.newIngredientName ?? item.matchedIngredientName;
      if (candidate) {
        const hit = fuzzyMatchInventory(candidate, inventory);
        if (hit) matched = { id: hit.id, name: hit.name };
      }
    }

    if (matched) {
      item.matchedIngredientId = matched.id;
      item.matchedIngredientName = matched.name;
      item.newIngredientName = null;
      if (item.confidence === "low") item.confidence = "medium";
    }
  }
}
