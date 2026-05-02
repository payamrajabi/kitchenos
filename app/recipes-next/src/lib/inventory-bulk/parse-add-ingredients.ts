/**
 * Add-ingredient enrichment parser.
 *
 * Sister flow to `parse-inventory-update.ts`. The user pastes / dictates a
 * list of ingredient names they want on their inventory ("Russet Potato,
 * Sweet Potato, Lacinato Kale, …"). Before any row is created we ask the
 * LLM, for each NEW name, to:
 *
 *   - confirm a clean canonical name (Title Case, recipe-style)
 *   - assign a grocery category (Produce / Dairy / Pantry / …)
 *   - assign a culinary subcategory (Alliums / Roots & Tubers / …)
 *   - pick a parent ingredient when one obviously fits ("Sweet Potato"
 *     → existing "Potato")
 *   - pick a storage location (Fridge / Freezer / Shallow Pantry /
 *     Deep Pantry / Counter / Other)
 *
 * The result feeds an in-memory review queue; nothing is written to the
 * database from here. The user reviews, edits, and confirms before the
 * apply server action creates each ingredient + inventory row.
 */

import {
  type IngredientGroceryCategory,
  inferGroceryCategoryFromName,
  isIngredientGroceryCategory,
} from "@/lib/ingredient-grocery-category";
import {
  INGREDIENT_TAXONOMY_SUBCATEGORIES,
  type IngredientTaxonomySubcategory,
  inferTaxonomySubcategoryFromName,
  inferStorageHintsFromName,
} from "@/lib/ingredient-backbone-inference";
import {
  INGREDIENT_STORAGE_HINTS,
  type IngredientStorageHint,
} from "@/types/database";
import { toTitleCaseAP } from "@/lib/ingredient-resolution/normalize";

const PARSE_MODEL = "gpt-4o-mini";
const PARSE_TIMEOUT_MS = 60_000;
/**
 * Allowed values for the storage location the user wants this inventory
 * row to live in. Mirrors `STORAGE_LOCATION_BY_FILTER_KEY` plus a
 * "Counter" option for fresh produce that lives out on the counter
 * (which the inventory UI already buckets under Pantry).
 */
export const ADD_STORAGE_LOCATIONS = [
  "Fridge",
  "Freezer",
  "Shallow Pantry",
  "Deep Pantry",
  "Counter",
  "Other",
] as const;
export type AddStorageLocation = (typeof ADD_STORAGE_LOCATIONS)[number];

const STORAGE_LOCATION_SET = new Set<string>(ADD_STORAGE_LOCATIONS);

function isAddStorageLocation(value: unknown): value is AddStorageLocation {
  return typeof value === "string" && STORAGE_LOCATION_SET.has(value);
}

const SUBCATEGORY_SET = new Set<string>(INGREDIENT_TAXONOMY_SUBCATEGORIES);

function isTaxonomySubcategory(
  value: unknown,
): value is IngredientTaxonomySubcategory {
  return typeof value === "string" && SUBCATEGORY_SET.has(value);
}

const STORAGE_HINT_SET = new Set<string>(INGREDIENT_STORAGE_HINTS);

function asStorageHints(value: unknown): IngredientStorageHint[] | null {
  if (!Array.isArray(value)) return null;
  const out: IngredientStorageHint[] = [];
  const seen = new Set<string>();
  for (const v of value) {
    if (typeof v !== "string") continue;
    const lower = v.toLowerCase();
    if (!STORAGE_HINT_SET.has(lower)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(lower as IngredientStorageHint);
  }
  return out.length ? out : null;
}

/**
 * Existing parent candidates the LLM can pick from. We send root-level
 * ingredients (no parent of their own) so the model can group, e.g.,
 * "Russet Potato" under an existing "Potato".
 */
export type AddIngredientParentCandidate = {
  id: number;
  name: string;
  taxonomy_subcategory: string | null;
};

export type AddIngredientExistingHint = {
  id: number;
  name: string;
  aliases?: string[];
};

export type ParsedAddIngredientItem = {
  /** Raw phrase the user typed for this slot (best-effort). */
  rawLine: string;
  /** Existing ingredient id if the user already has this in their catalog. */
  matchedIngredientId: number | null;
  matchedIngredientName: string | null;
  /** AP Title-Cased name to create when matchedIngredientId is null. */
  newIngredientName: string | null;
  /** Aisle / store section. */
  groceryCategory: IngredientGroceryCategory | null;
  /** Culinary subcategory tier. */
  taxonomySubcategory: IngredientTaxonomySubcategory | null;
  /** Existing root ingredient that should be the parent. */
  parentIngredientId: number | null;
  parentIngredientName: string | null;
  /** Where the inventory row should physically live. */
  storageLocation: AddStorageLocation | null;
  /** Background hints the UI can show (counter / pantry / fridge / freezer). */
  storageHints: IngredientStorageHint[] | null;
  /** "high" / "medium" / "low" — quick confidence signal for review UX. */
  confidence: "high" | "medium" | "low";
  /** Set when the line is filler / unparseable. */
  skipReason: string | null;
};

/* ------------------------------------------------------------------ */
/*  Free-text splitter                                                */
/* ------------------------------------------------------------------ */

const FILLER = new Set([
  "um",
  "uh",
  "okay",
  "ok",
  "also",
  "and",
  "then",
  "let me see",
  "let me think",
  "thats it",
  "that's it",
]);

/**
 * Same shape as `splitFreeTextIngredientList` in `inventory-bulk.ts` but
 * exported so the parse module owns the splitting policy. Rule: split on
 * newlines, commas, semicolons, and the literal word "and"; trim filler;
 * dedupe by Title-Case key.
 */
export function splitAddIngredientText(rawText: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const tokens = (rawText ?? "")
    .split(/\n+|,|;|\band\b/gi)
    .map((t) => t.trim())
    .filter(Boolean);
  for (const token of tokens) {
    const cleaned = token.replace(/[.!?]+$/, "").trim();
    if (!cleaned) continue;
    if (FILLER.has(cleaned.toLowerCase())) continue;
    if (cleaned.length > 120) continue;
    if (/^\d+$/.test(cleaned)) continue;
    const titled = toTitleCaseAP(cleaned);
    const key = titled.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(titled);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  LLM prompt + invocation                                           */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You are an ingredient-classification assistant for a personal kitchen-inventory app. The user is adding a list of ingredients to their inventory. For each ingredient name they give you, return clean structured metadata so the user can review and confirm before anything is created.

You are NOT measuring quantity. You are NOT inferring brand. You only categorise the ingredient itself.

============================================================
RULE 1 — Ingredient name is what a recipe would call it.
============================================================
Use AP-style Title Case. Strip brand words, marketing words ("organic", "free-range", "grass-fed"), regional modifiers that don't change recipe identity, and quality grades. Keep variant words that map to a different food ("Garlic" vs "Garlic Powder", "Lemon" vs "Lemon Juice"). Keep colour distinctions when they matter ("Red Bell Pepper" vs "Yellow Bell Pepper", "Black Pepper" vs "White Pepper").

If an EXISTING ingredient in the user's catalog already covers this name (exact, alias, or near-typo), return its id in matchedIngredientId — do NOT create a duplicate. Otherwise put the cleaned name in newIngredientName and leave matchedIngredientId null.

============================================================
RULE 2 — Pick a grocery category.
============================================================
Choose ONE of these store-aisle categories for groceryCategory:
  Produce, Meat & Seafood, Dairy & Eggs, Bakery & Bread, Deli & Prepared Foods, Frozen, Pantry, Snacks, Beverages, Breakfast & Cereal

============================================================
RULE 3 — Pick a culinary subcategory.
============================================================
Choose ONE of these for taxonomySubcategory (or null if none fits cleanly):
  Alliums, Nightshades, Peppers & Chilies, Leafy Greens, Brassicas, Roots & Tubers, Squash, Stalk Vegetables, Fungi, Citrus, Berries, Stone Fruit, Pome Fruit, Tropical Fruit, Melons, Fresh Herbs, Dried Spices, Seaweeds, Whole Grains, Flours & Starches, Pasta & Noodles, Dried Legumes, Canned Legumes, Nuts, Seeds, Nut & Seed Butters, Oils & Fats, Vinegars, Sweeteners, Baking Essentials, Canned Tomatoes, Broths & Stocks, Condiments & Sauces, Pickles & Ferments, Dairy, Cheese, Eggs, Plant Milks, Soy Proteins, Meat, Poultry, Seafood, Dried Fruit, Beverages, Alcohol

============================================================
RULE 4 — Suggest a parent ingredient WHEN one fits.
============================================================
You'll receive a list of EXISTING root ingredients (id + name + subcategory) the user already has. If the new ingredient is genuinely a kind / variety of one of those roots, return its id in parentIngredientId. Examples:
  - "Russet Potato" → parent = "Potato"
  - "Sweet Potato" → parent = "Potato" (same root vegetable in user's mental model)
  - "Lacinato Kale" → parent = "Kale"
  - "San Marzano Tomato" → parent = "Tomato"
  - "Whole Milk" → parent = "Milk"
  - "Lemon Juice" → parent = null (a juice is its own ingredient, NOT a kind of Lemon)
  - "Coconut Milk" → parent = null (NOT a kind of Coconut)
  - "Garlic Powder" → parent = null (NOT a kind of Garlic — different recipe usage)

Default to parentIngredientId = null when in doubt. Only group when the parent is the SAME functional food and the new name reads as "<variety> <parent>".

============================================================
RULE 5 — Pick a storage location.
============================================================
Choose ONE of these for storageLocation:
  Fridge, Freezer, Shallow Pantry, Deep Pantry, Counter, Other

Guidance:
  - Fridge: dairy, eggs, meat/poultry/seafood (raw or cooked, NOT frozen), opened condiments, fresh herbs, leafy greens, mushrooms, berries, prepared foods, opened plant milks.
  - Freezer: anything labelled "frozen", ice cream, frozen produce, long-term meat storage.
  - Shallow Pantry: spices, oils, vinegars, condiments (sealed), baking staples (flour, sugar, baking powder), pasta, rice, canned goods you reach for weekly, snacks.
  - Deep Pantry: bulk dry goods, infrequently-used backstock, large flour / rice bags, canned goods you keep around but rarely open.
  - Counter: produce that ripens / lives well at room temp — bananas, tomatoes (whole), citrus (short-term), avocados, garlic, onions, potatoes, winter squash.
  - Other: only when none of the above fit (e.g., a hanging garlic braid, a wine cellar item).

Default to the most natural storage for the food. When a food has multiple valid options ("Tomatoes can live on the counter or in the fridge"), pick ONE and let the user override.

Also fill storageHints with the array form: any subset of "counter", "pantry", "fridge", "freezer". This is informational — pick everywhere a household commonly keeps this food.

============================================================
RULE 6 — Confidence.
============================================================
- "high": clean food name, obvious category, obvious storage.
- "medium": uncertain spelling, ambiguous variant, or storage could go either way.
- "low": couldn't really classify; the user should review carefully.

============================================================
RULE 7 — Skip filler lines.
============================================================
If the input phrase is filler ("uh", "okay let me think") or clearly not a food, set skipReason = "Not an ingredient." and leave the other fields null. Use confidence = "low".

============================================================
OUTPUT
============================================================
Return a SINGLE JSON object with this exact shape:

{
  "items": [
    {
      "rawLine": "verbatim or cleaned input phrase",
      "matchedIngredientId": 12 | null,
      "matchedIngredientName": "Potato" | null,
      "newIngredientName": "Russet Potato" | null,
      "groceryCategory": "Produce",
      "taxonomySubcategory": "Roots & Tubers" | null,
      "parentIngredientId": 7 | null,
      "parentIngredientName": "Potato" | null,
      "storageLocation": "Counter",
      "storageHints": ["counter", "pantry"],
      "confidence": "high" | "medium" | "low",
      "skipReason": null | "Not an ingredient."
    }
  ]
}

Return ONLY valid JSON. No markdown fences, no commentary.

============================================================
WORKED EXAMPLES
============================================================

Example A — input "Russet Potato"; existing roots include id=7 "Potato" (Roots & Tubers).
{ "rawLine": "Russet Potato", "matchedIngredientId": null, "matchedIngredientName": null, "newIngredientName": "Russet Potato", "groceryCategory": "Produce", "taxonomySubcategory": "Roots & Tubers", "parentIngredientId": 7, "parentIngredientName": "Potato", "storageLocation": "Counter", "storageHints": ["counter", "pantry"], "confidence": "high", "skipReason": null }

Example B — input "lacinato kale"; existing roots include id=22 "Kale".
{ "rawLine": "lacinato kale", "matchedIngredientId": null, "matchedIngredientName": null, "newIngredientName": "Lacinato Kale", "groceryCategory": "Produce", "taxonomySubcategory": "Leafy Greens", "parentIngredientId": 22, "parentIngredientName": "Kale", "storageLocation": "Fridge", "storageHints": ["fridge"], "confidence": "high", "skipReason": null }

Example C — input "Yellow onion"; user already has id=3 "Yellow Onion".
{ "rawLine": "Yellow onion", "matchedIngredientId": 3, "matchedIngredientName": "Yellow Onion", "newIngredientName": null, "groceryCategory": "Produce", "taxonomySubcategory": "Alliums", "parentIngredientId": null, "parentIngredientName": null, "storageLocation": "Counter", "storageHints": ["counter", "pantry"], "confidence": "high", "skipReason": null }

Example D — input "Coconut Milk".
{ "rawLine": "Coconut Milk", "matchedIngredientId": null, "matchedIngredientName": null, "newIngredientName": "Coconut Milk", "groceryCategory": "Pantry", "taxonomySubcategory": "Plant Milks", "parentIngredientId": null, "parentIngredientName": null, "storageLocation": "Shallow Pantry", "storageHints": ["pantry", "fridge"], "confidence": "high", "skipReason": null }

Example E — input "uh ok that's it".
{ "rawLine": "uh ok that's it", "matchedIngredientId": null, "matchedIngredientName": null, "newIngredientName": null, "groceryCategory": null, "taxonomySubcategory": null, "parentIngredientId": null, "parentIngredientName": null, "storageLocation": null, "storageHints": null, "confidence": "low", "skipReason": "Not an ingredient." }`;

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

function safeString(v: unknown, maxLen = 240): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  return s.slice(0, maxLen);
}

function safePositiveInt(v: unknown): number | null {
  if (v == null) return null;
  const n =
    typeof v === "number" ? v : Number(String(v).replace(/[^\d.\-]/g, ""));
  if (!Number.isFinite(n)) return null;
  const t = Math.trunc(n);
  if (t <= 0) return null;
  return t;
}

function safeConfidence(v: unknown): "high" | "medium" | "low" {
  const s = String(v ?? "").toLowerCase();
  if (s === "high" || s === "medium" || s === "low") return s;
  return "low";
}

function buildExistingBlock(
  existing: AddIngredientExistingHint[],
): string {
  if (!existing.length) {
    return "EXISTING INGREDIENTS: (none — the user has nothing in their catalog yet, so every input is a NEW ingredient).";
  }
  const lines = existing.slice(0, 600).map((i) => {
    const aliasPart = i.aliases?.length
      ? `, aliases="${i.aliases.slice(0, 6).join(", ")}"`
      : "";
    return `- id=${i.id}, name="${i.name}"${aliasPart}`;
  });
  return `EXISTING INGREDIENTS (already in the user's catalog — match into these instead of creating duplicates):\n${lines.join("\n")}`;
}

function buildParentBlock(
  parents: AddIngredientParentCandidate[],
): string {
  if (!parents.length) {
    return "PARENT CANDIDATES: (none — return parentIngredientId = null for everything).";
  }
  const lines = parents.slice(0, 400).map((p) => {
    const sub = p.taxonomy_subcategory ? ` [${p.taxonomy_subcategory}]` : "";
    return `- id=${p.id}, name="${p.name}"${sub}`;
  });
  return `PARENT CANDIDATES (existing root ingredients you can group new variants under):\n${lines.join("\n")}`;
}

function sanitiseItem(
  raw: unknown,
  validExistingIds: Set<number>,
  validParentIds: Set<number>,
): ParsedAddIngredientItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const rawLine = safeString(r.rawLine, 240);
  if (!rawLine) return null;

  const matchedId = safePositiveInt(r.matchedIngredientId);
  const matchedName = safeString(r.matchedIngredientName, 160);
  const newName = safeString(r.newIngredientName, 160);

  const grocery = safeString(r.groceryCategory, 60);
  const groceryCategory: IngredientGroceryCategory | null =
    grocery && isIngredientGroceryCategory(grocery) ? grocery : null;

  const sub = safeString(r.taxonomySubcategory, 60);
  const taxonomySubcategory: IngredientTaxonomySubcategory | null =
    sub && isTaxonomySubcategory(sub) ? sub : null;

  const parentId = safePositiveInt(r.parentIngredientId);
  const parentName = safeString(r.parentIngredientName, 160);

  const loc = safeString(r.storageLocation, 32);
  const storageLocation: AddStorageLocation | null =
    loc && isAddStorageLocation(loc) ? loc : null;

  const item: ParsedAddIngredientItem = {
    rawLine,
    matchedIngredientId:
      matchedId != null && validExistingIds.has(matchedId) ? matchedId : null,
    matchedIngredientName: matchedName,
    newIngredientName: newName,
    groceryCategory,
    taxonomySubcategory,
    parentIngredientId:
      parentId != null && validParentIds.has(parentId) ? parentId : null,
    parentIngredientName: parentName,
    storageLocation,
    storageHints: asStorageHints(r.storageHints),
    confidence: safeConfidence(r.confidence),
    skipReason: safeString(r.skipReason, 120),
  };

  // If the LLM hallucinated a matched id we don't know about, drop the
  // match — the user should treat this as a new ingredient instead.
  if (matchedId != null && !validExistingIds.has(matchedId)) {
    item.matchedIngredientId = null;
    item.matchedIngredientName = null;
    if (item.confidence === "high") item.confidence = "medium";
  }

  // Same for hallucinated parent ids.
  if (parentId != null && !validParentIds.has(parentId)) {
    item.parentIngredientId = null;
    item.parentIngredientName = null;
  }

  return item;
}

/**
 * Rules-based defaults to use when the LLM call fails, returns nothing for
 * a row, or comes back with low-confidence guesses on metadata fields. We
 * never want a created ingredient to end up with zero categorisation just
 * because the API hiccupped.
 */
function fillFromRules(item: ParsedAddIngredientItem): ParsedAddIngredientItem {
  const name = item.newIngredientName ?? item.matchedIngredientName ?? item.rawLine;
  if (!item.taxonomySubcategory) {
    item.taxonomySubcategory = inferTaxonomySubcategoryFromName(name);
  }
  if (!item.groceryCategory) {
    item.groceryCategory = inferGroceryCategoryFromName(name);
  }
  if (!item.storageHints) {
    item.storageHints = inferStorageHintsFromName(name, item.taxonomySubcategory);
  }
  if (!item.storageLocation) {
    const hints = item.storageHints ?? [];
    if (hints.includes("fridge")) item.storageLocation = "Fridge";
    else if (hints.includes("freezer")) item.storageLocation = "Freezer";
    else if (hints.includes("counter")) item.storageLocation = "Counter";
    else item.storageLocation = "Shallow Pantry";
  }
  return item;
}

export type ParseAddIngredientsResult =
  | { ok: true; items: ParsedAddIngredientItem[] }
  | { ok: false; error: string };

/**
 * Run a single LLM round-trip to enrich the parsed names with categories,
 * subcategory, parent suggestion, and storage location. Falls back to
 * rules-based metadata when the network call fails so the user always
 * sees something usable in the review queue.
 */
export async function parseAddIngredientsContent(
  rawText: string,
  existing: AddIngredientExistingHint[],
  parents: AddIngredientParentCandidate[],
): Promise<ParseAddIngredientsResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const content = (rawText ?? "").trim();
  if (!content) {
    return { ok: false, error: "Type or paste at least one ingredient." };
  }

  const names = splitAddIngredientText(content);
  if (!names.length) {
    return { ok: false, error: "Couldn't read any ingredient names." };
  }

  // No API key → return rules-based items so the feature still "works"
  // (just without the LLM uplift). Useful in local dev when the env var
  // isn't set yet.
  if (!apiKey) {
    const items = names.map((name) =>
      fillFromRules({
        rawLine: name,
        matchedIngredientId: null,
        matchedIngredientName: null,
        newIngredientName: name,
        groceryCategory: null,
        taxonomySubcategory: null,
        parentIngredientId: null,
        parentIngredientName: null,
        storageLocation: null,
        storageHints: null,
        confidence: "low",
        skipReason: null,
      }),
    );
    return { ok: true, items };
  }

  const validExistingIds = new Set(existing.map((e) => e.id));
  const validParentIds = new Set(parents.map((p) => p.id));

  const userBlock = `${buildExistingBlock(existing)}\n\n${buildParentBlock(parents)}\n\nNAMES TO CLASSIFY:\n${names.join("\n")}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: PARSE_MODEL,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userBlock },
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
    const itemsByLine = new Map<string, ParsedAddIngredientItem>();
    for (const it of itemsRaw) {
      const sanitised = sanitiseItem(it, validExistingIds, validParentIds);
      if (!sanitised) continue;
      const key = sanitised.rawLine.toLowerCase();
      // Last write wins — protect against duplicate output rows.
      itemsByLine.set(key, fillFromRules(sanitised));
    }

    // Stitch in fallback rule-based items for any names the LLM dropped.
    const out: ParsedAddIngredientItem[] = [];
    for (const name of names) {
      const found = itemsByLine.get(name.toLowerCase());
      if (found) {
        out.push(found);
        continue;
      }
      out.push(
        fillFromRules({
          rawLine: name,
          matchedIngredientId: null,
          matchedIngredientName: null,
          newIngredientName: name,
          groceryCategory: null,
          taxonomySubcategory: null,
          parentIngredientId: null,
          parentIngredientName: null,
          storageLocation: null,
          storageHints: null,
          confidence: "low",
          skipReason: null,
        }),
      );
    }

    return { ok: true, items: out };
  } catch (err) {
    if (err instanceof Error) {
      const isTimeout =
        err.name === "TimeoutError" ||
        /aborted due to timeout/i.test(err.message);
      if (isTimeout) {
        return {
          ok: false,
          error:
            "The classifier took too long to respond. Try a shorter list or try again in a moment.",
        };
      }
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Add-ingredient classification failed." };
  }
}
