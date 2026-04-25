/**
 * Receipt parse pipeline.
 *
 * Takes raw receipt text (pasted or from an uploaded CSV file) plus context
 * about the user's existing inventory ingredients, and returns a list of
 * structured line items that map each purchased good to an inventory
 * ingredient with a stock delta, unit size, preferred product info and price.
 *
 * Mirrors the OpenAI usage pattern in `parse-recipe.ts` (gpt-4o, JSON mode,
 * OPENAI_API_KEY env check, 45s timeout).
 */

import { INGREDIENT_UNIT_VALUES } from "@/lib/unit-mapping";
import type { ProductPriceBasis } from "@/types/database";

const PARSE_MODEL = "gpt-4o";
/** Per-call timeout. Long structured JSON responses from gpt-4o on big
 * receipts can sit around 30–60s; the previous 45s ceiling kept failing on
 * 30+ line pastes. Pair this with input-side chunking in the caller so a
 * single 75s budget is never asked to swallow the whole receipt. */
const PARSE_TIMEOUT_MS = 75_000;

/** Strip ```json fences and parse; models sometimes wrap JSON in markdown. */
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

export type ReceiptInventoryHint = {
  id: number;
  name: string;
  aliases?: string[];
  /** Current inventory unit (stock unit), e.g. "g", "count". null when unset. */
  unit: string | null;
  /** Top-ranked (preferred) product name, if any. */
  productName: string | null;
  productBrand: string | null;
  unitSizeAmount: number | null;
  unitSizeUnit: string | null;
};

export type ParsedReceiptLine = {
  /** The raw receipt line as it appeared in the input. */
  rawLine: string;
  /** Non-food / non-inventory line reason. Excluded rows are shown but not applied. */
  excludedReason: string | null;
  /** Inventory ingredient the LLM believes this line maps to; null when unsure. */
  matchedIngredientId: number | null;
  /** For debugging / surfacing — the matched ingredient name. */
  matchedIngredientName: string | null;
  confidence: "high" | "medium" | "low";
  /** Amount to ADD to inventory stock, in the ingredient's existing unit. */
  quantityDelta: number | null;
  /** Unit that `quantityDelta` is expressed in. Should match INGREDIENT_UNITS. */
  unit: string | null;
  productName: string | null;
  productBrand: string | null;
  unitSizeAmount: number | null;
  unitSizeUnit: string | null;
  /** Price for one price basis: package, weight amount, or unit. */
  price: number | null;
  /** How to interpret price. Null/omitted means package pricing. */
  priceBasis: ProductPriceBasis | null;
  /** Amount for by-weight/unit prices, e.g. 1 for "$8.99/lb". */
  priceBasisAmount: number | null;
  /** Unit for by-weight/unit prices, e.g. "lb", "kg", "g", "oz", or "ea". */
  priceBasisUnit: string | null;
  /** Number of packages/items bought, or the sold weight amount when by weight. */
  purchaseQuantity: number | null;
  /** Unit for purchaseQuantity, e.g. "pkg", "lb", or "count". */
  purchaseUnit: string | null;
};

function buildInventoryBlock(inventory: ReceiptInventoryHint[]): string {
  if (!inventory.length) {
    return "The user has no inventory ingredients yet. Leave matchedIngredientId null for every line.";
  }
  const lines = inventory.map((i) => {
    const parts: string[] = [`id=${i.id}`, `name="${i.name}"`];
    if (i.unit) parts.push(`unit="${i.unit}"`);
    if (i.productName) {
      const brand = i.productBrand ? ` (${i.productBrand})` : "";
      parts.push(`preferredProduct="${i.productName}${brand}"`);
    }
    if (i.aliases?.length) {
      parts.push(`aliases="${i.aliases.slice(0, 8).join(", ")}"`);
    }
    if (i.unitSizeAmount != null && i.unitSizeUnit) {
      parts.push(`packSize=${i.unitSizeAmount}${i.unitSizeUnit}`);
    }
    return `- ${parts.join(", ")}`;
  });
  return `INVENTORY (the user's existing ingredients, each with its stock unit):\n${lines.join("\n")}`;
}

const SYSTEM_PROMPT = `You are a grocery receipt parser. The user will paste raw receipt text or CSV content listing items they just purchased (with prices, quantities, and sometimes pack sizes). You will also receive a list of the user's existing INVENTORY ingredients, each with an id, the ingredient's stock unit (e.g. "g", "ml", "count"), and optionally their preferred product + pack size.

Your job, for each purchased line item, is to:
1. Decide whether the line is food/kitchen inventory. Food, beverages, pantry staples, spices, packaged groceries, and ingredients should be included. Clearly non-food goods (toothbrushes, dish soap, cleaning supplies, paper towels, batteries, toiletries, home goods, clothing, pharmacy items) should still be returned, but with excludedReason set to a short plain-English reason and all ingredient/product fields set to null. Skip only receipt bookkeeping lines such as subtotal, tax, fees, bag charges, deposits, rewards, payment, and totals.
2. Decide whether the food item matches an existing inventory ingredient. The inventory ingredient is the generic food category, not the retail product. Be intentionally less literal:
   - "DOM Reserve Singles Frozen Smoked Salmon" -> "Smoked Salmon"
   - "Kirkland Signature Organic 21-Grain Bread" -> "Bread"
   - "Balderson 2-Year Old Cheddar Cheese" -> "Cheddar Cheese"
   - "Organic Mixed Peppers" should match "Bell Pepper" if that exists
   - "Rio Mare Solid Light Tuna in Olive Oil" -> "Tuna"
   Product-specific words like brand, organic, frozen, singles, 21-grain, old/aged, pack count, flavour, and packaging belong in productName/productBrand, not in matchedIngredientName or a new ingredient name.
   Do NOT match genuinely different foods ("Garlic" ≠ "Garlic Powder", "Coconut Milk" ≠ "Coconut").
3. Compute how much to add to the inventory's stock, expressed in that ingredient's existing stock unit. Rules:
   - If the ingredient is tracked in grams/kg/ml/l, multiply the pack size by the number of items purchased and convert to the stock unit. Example: inventory unit is "g", receipt says "2 x Peanut Butter 340g" → quantityDelta = 680, unit = "g".
   - If the ingredient's stock unit is "count" (or similar "piece"/"ea"), return the number of items purchased (e.g. 2). Unit must match.
   - If the product is a multi-pack, multiply through the inner count. Example: "Rio Mare Solid Light Tuna in Olive Oil, qty 1" for a product that contains 4 cans should return quantityDelta=4, unit="can" or "count" as appropriate, unitSizeAmount=4, unitSizeUnit="can", purchaseQuantity=1, purchaseUnit="pkg".
   - If you cannot determine a reasonable delta, set quantityDelta to null and confidence to "low".
4. Extract product name, brand, pack size (unitSizeAmount + unitSizeUnit), purchase quantity, and price basis:
   - For normal packaged goods, price is the price of ONE purchasable pack / jar / bottle / bag, not the line total. Set priceBasis="package", priceBasisAmount=null, priceBasisUnit=null. If the receipt shows "$9.49 each", price=9.49. If it only shows "qty 2, $18.98 total", divide by 2 so price=9.49.
   - For by-weight goods, price is the displayed price per weight amount. Example "$8.99/lb" means price=8.99, priceBasis="weight", priceBasisAmount=1, priceBasisUnit="lb". If the receipt also shows 2.36 lb purchased, set purchaseQuantity=2.36 and purchaseUnit="lb".
   - For loose unit/each goods, price is the displayed price per unit. Example "$0.79 each" means price=0.79, priceBasis="unit", priceBasisAmount=1, priceBasisUnit="ea".
   - purchaseQuantity is the number of packages/items bought for packaged goods, or the sold weight amount for by-weight goods. purchaseUnit should use the same allowed unit strings below; use "pkg" when the receipt gives a package count but no better package unit.
   - Never return the line total as price when the user bought multiple packages or a by-weight amount. Leave fields null when they are not present in the receipt.
5. Assign a confidence:
   - "high" — you are certain about the matched ingredient AND have a sensible quantityDelta in the correct unit.
   - "medium" — a plausible match but the unit/quantity conversion is uncertain.
   - "low" — no good inventory match, or you cannot compute a delta.

Return a SINGLE JSON object with this exact shape:

{
  "items": [
    {
      "rawLine": "verbatim receipt line",
      "excludedReason": "Non-food household item" | null,
      "matchedIngredientId": 42 | null,
      "matchedIngredientName": "Peanut Butter" | null,
      "confidence": "high" | "medium" | "low",
      "quantityDelta": 680 | null,
      "unit": "g" | null,
      "productName": "Smooth Peanut Butter" | null,
      "productBrand": "Whole Earth" | null,
      "unitSizeAmount": 340 | null,
      "unitSizeUnit": "g" | null,
      "price": 4.50 | null,            // price for the basis below — NOT the line total
      "priceBasis": "package" | "weight" | "unit" | null,
      "priceBasisAmount": 1 | null,
      "priceBasisUnit": "lb" | null,
      "purchaseQuantity": 2 | null,
      "purchaseUnit": "pkg" | null
    }
  ]
}

Rules:
- Use these exact unit strings when applicable: count, g, kg, oz, lb, ml, l, fl oz, cup, tsp, tbsp, ea, piece, dozen, whole, clove, slice, sprig, pinch, head, bunch, pkg, bag, box, block, tub, container, jar, bottle, can, roll, sleeve.
- "unit" (the delta unit) MUST match the inventory ingredient's stock unit when you assign a match. If the inventory unit is null, use your best-judgement canonical unit.
- Prices are numbers only (no currency symbols). "price" is ALWAYS the per-basis price, NEVER a line total. If the receipt only shows a line total, divide by the count purchased for package/unit goods.
- Do not include subtotal, tax, fees, bag charges, deposits, rewards, payment, or total lines.
- Include clearly non-food purchased goods with excludedReason so the UI can show them in an Excluded section.
- If the receipt lists the same item twice (e.g. "2 x Milk"), return ONE output row with quantityDelta reflecting all units purchased, but price remains per-unit.
- When a line cannot be confidently matched, still include it with matchedIngredientId = null and confidence = "low" so the user can review it.
- AP-style Title Case for productName and matchedIngredientName. For unmatched food, matchedIngredientName should be the generic food category you would create, not the brand/product string.
- Return ONLY valid JSON. No markdown, no explanation, no extra text.

Worked examples (pay special attention to price vs line total):

Example A — receipt line: "Salt Spring Bagels Organic Everything Bagels 6 Pack, qty 2, $9.49 each, $18.98 total". Inventory has "Everything Bagels" tracked in "count". Output: productName="Organic Everything Bagels", productBrand="Salt Spring Bagels", unitSizeAmount=6, unitSizeUnit="count", quantityDelta=12, unit="count", price=9.49, priceBasis="package", priceBasisAmount=null, priceBasisUnit=null, purchaseQuantity=2, purchaseUnit="pkg" (per 6-pack, NOT 18.98).

Example B — receipt line: "2 x Smooth Peanut Butter 340g £4.50 ea (£9.00)". Inventory has "Peanut Butter" tracked in "g". Output: productName="Smooth Peanut Butter", unitSizeAmount=340, unitSizeUnit="g", quantityDelta=680, unit="g", price=4.50, priceBasis="package", purchaseQuantity=2, purchaseUnit="pkg" (per jar, NOT 9.00).

Example C — receipt line: "Oat Milk 1L 1.85". Inventory has "Oat Milk" tracked in "ml". Output: unitSizeAmount=1, unitSizeUnit="l", quantityDelta=1000, unit="ml", price=1.85, priceBasis="package", purchaseQuantity=1, purchaseUnit="pkg".

Example D — receipt line: "DOM Reserve Singles Frozen Smoked Salmon, qty 2, $36.99 each, $73.98 total". Output: matchedIngredientName="Smoked Salmon", productName="Singles Frozen Smoked Salmon", productBrand="DOM Reserve", price=36.99, priceBasis="package", purchaseQuantity=2, purchaseUnit="pkg".

Example E — receipt line: "Organic Fuji Apples 2.36 lb @ $2.99/lb $7.06". Output: matchedIngredientName="Apple", productName="Organic Fuji Apples", price=2.99, priceBasis="weight", priceBasisAmount=1, priceBasisUnit="lb", purchaseQuantity=2.36, purchaseUnit="lb".

Example F — receipt line: "Oral-B iO5 Electric Toothbrushes (2-pack), qty 1, $141.99". Output: excludedReason="Non-food household item", all ingredient/product/price/quantity fields null.`;

/* ------------------------------------------------------------------ */
/*  Safe coercion helpers                                             */
/* ------------------------------------------------------------------ */

function safeString(v: unknown, maxLen = 500): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  return s.slice(0, maxLen);
}

function safeNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.\-]/g, ""));
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

function safePriceBasis(v: unknown): ProductPriceBasis | null {
  const s = String(v ?? "").toLowerCase();
  if (s === "package" || s === "weight" || s === "unit") return s;
  return null;
}

function safeUnit(v: unknown): string | null {
  const s = safeString(v, 20);
  if (!s) return null;
  const lower = s.toLowerCase();
  if (INGREDIENT_UNIT_VALUES.has(lower)) return lower;
  return null;
}

function sanitizeLine(raw: unknown): ParsedReceiptLine | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const rawLine = safeString(r.rawLine, 400) ?? "";
  if (!rawLine) return null;

  return {
    rawLine,
    excludedReason: safeString(r.excludedReason, 120),
    matchedIngredientId: safePositiveInt(r.matchedIngredientId),
    matchedIngredientName: safeString(r.matchedIngredientName, 160),
    confidence: safeConfidence(r.confidence),
    quantityDelta: safeNonNegNumber(r.quantityDelta),
    unit: safeUnit(r.unit),
    productName: safeString(r.productName, 160),
    productBrand: safeString(r.productBrand, 80),
    unitSizeAmount: safeNonNegNumber(r.unitSizeAmount),
    unitSizeUnit: safeUnit(r.unitSizeUnit),
    price: safeNonNegNumber(r.price),
    priceBasis: safePriceBasis(r.priceBasis),
    priceBasisAmount: safeNonNegNumber(r.priceBasisAmount),
    priceBasisUnit: safeUnit(r.priceBasisUnit),
    purchaseQuantity: safeNonNegNumber(r.purchaseQuantity),
    purchaseUnit: safeUnit(r.purchaseUnit),
  };
}

/* ------------------------------------------------------------------ */
/*  Public entrypoint                                                 */
/* ------------------------------------------------------------------ */

export async function parseReceiptContent(
  rawContent: string,
  inventory: ReceiptInventoryHint[],
): Promise<
  | { ok: true; items: ParsedReceiptLine[] }
  | { ok: false; error: string }
> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error:
        "OPENAI_API_KEY is not set. Add it to .env.local to enable receipt import.",
    };
  }

  const content = rawContent.trim();
  if (!content) {
    return { ok: false, error: "No receipt content to parse." };
  }

  const truncated = content.slice(0, 30_000);
  const inventoryBlock = buildInventoryBlock(inventory);

  const userContent = `${inventoryBlock}\n\nRECEIPT:\n${truncated}`;

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
    if (!parsed) return { ok: false, error: "Could not parse AI response as JSON." };

    const itemsRaw = Array.isArray(parsed.items) ? parsed.items : [];
    const items = itemsRaw
      .map(sanitizeLine)
      .filter((x): x is ParsedReceiptLine => x != null);

    // Reject ingredient matches the LLM hallucinated — ids must exist in the
    // inventory context we passed in.
    const validIds = new Set(inventory.map((i) => i.id));
    for (const item of items) {
      if (item.matchedIngredientId != null && !validIds.has(item.matchedIngredientId)) {
        item.matchedIngredientId = null;
        item.matchedIngredientName = null;
        if (item.confidence === "high") item.confidence = "medium";
      }
    }

    return { ok: true, items };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Receipt parsing failed.";
    return { ok: false, error: message };
  }
}
