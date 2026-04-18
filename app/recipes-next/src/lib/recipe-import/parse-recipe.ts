/**
 * Shared LLM recipe parse pipeline.
 * Takes raw text (from any source) and returns a structured ParsedRecipe that
 * matches the authoring guide (structured title, headnote, yield, ingredient
 * groups with preparation/display, 1-based instructions, typed recipe note).
 *
 * When the user's existing ingredients are provided, the parser prefers
 * matching names from the inventory so the downstream resolution pipeline
 * gets trivial exact hits instead of relying on fuzzy/LLM matching.
 */

import type {
  ParsedIngredient,
  ParsedIngredientGroup,
  ParsedInstructionStep,
  ParsedRecipe,
  ParsedRecipeNote,
  ParsedTitle,
  ParsedYield,
} from "./types";
import type { RecipeNoteType, RecipeYieldLabel } from "@/types/database";

const PARSE_MODEL = "gpt-4o-mini";
const PARSE_TIMEOUT_MS = 45_000;

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

export type InventoryHint = { id: number; name: string; parentName?: string | null };

function buildInventoryBlock(inventory: InventoryHint[]): string {
  if (!inventory.length) return "";
  const lines = inventory.map((i) =>
    i.parentName ? `- ${i.name} (variant of "${i.parentName}")` : `- ${i.name}`,
  );
  return `
IMPORTANT — The user already has these ingredients in their kitchen inventory:
${lines.join("\n")}

When a recipe ingredient matches or is essentially the same as one of these, use the EXACT name from the list above (preserving case) for the "ingredient" field. For example:
- Recipe says "lasagna noodles" and inventory has "Lasagna" (variant of "Pasta") → "Lasagna"
- Recipe says "pepper" and inventory has "Black Pepper" → "Black Pepper"
- Recipe says "olive oil" and inventory has "Extra Virgin Olive Oil" → "Extra Virgin Olive Oil"
- Recipe says "butter" and inventory has "Salted Butter" → "Salted Butter"
Only match when the items are genuinely the same thing. Do NOT match related but distinct items (e.g. "Garlic" ≠ "Garlic Powder", "Coconut Milk" ≠ "Coconut").
If no inventory item matches, use a clean AP-style Title Case name as usual.`;
}

const BASE_SYSTEM_PROMPT = `You are a recipe parser. Given raw text that contains a recipe (from a blog, screenshot transcription, social media post, cookbook page, or pasted notes), extract and return a single JSON object that follows this exact shape:

{
  "title": {
    "primary": "Base recipe name without a qualifier (2-6 words, e.g. 'Cherry Coconut Granola', 'Black Sesame Flax Dressing')",
    "qualifier": "Subordinate continuation of the title — often introduced by with/and/in/over/for — or null if there is no qualifier"
  },
  "headnote": "Editorial intro/background paragraph that appears before the recipe metadata. 60-180 words. null if none.",
  "description": "One or two sentences summarising what makes this recipe special. Max 250 characters. null if nothing relevant.",
  "source_url": "Original URL if visible in the text, otherwise null",
  "yield": {
    "label": "serves" | "makes" | null,
    "quantity": "Numeric or textual quantity, e.g. '4', '6 to 8', 'about 1/2'. null if unknown.",
    "unit": "Unit when needed, e.g. 'cups', 'loaf', 'cookies'. null if implied by the label.",
    "display": "Full human-readable yield line, e.g. 'Serves 2', 'Makes 12 cups'. Always provide when label is set."
  },
  "prep_time_minutes": 15,
  "cook_time_minutes": 30,
  "meal_types": ["Dinner"],
  "ingredient_groups": [
    {
      "heading": "Optional group heading like 'For the Dressing' or 'To Serve'. null if ingredients do not need grouping.",
      "items": [
        {
          "amount": "2" | "1/2" | "Pinch" | null,
          "unit": "cup" | "tbsp" | null,
          "ingredient": "ingredient name (AP-style Title Case, singular, no brand names)",
          "preparation": "Preparation or state note, e.g. 'finely chopped', 'divided', 'to serve'. null if none.",
          "display": "Verbatim / source-faithful version of the line, e.g. '2 cups rolled oats, toasted'.",
          "is_optional": false
        }
      ]
    }
  ],
  "instructions": [
    {
      "step_number": 1,
      "text": "Concise instruction text",
      "timer_seconds_low": 900,
      "timer_seconds_high": 1200
    }
  ],
  "recipe_note": {
    "type": "note" | "variation" | "storage" | "substitution" | null,
    "title": "Optional label for the note block, e.g. 'Note', 'Variation'. null if none.",
    "text": "Body text of the note block. null if no note."
  }
}

Rules:
1. TITLE: Split the recipe name into a short core (primary) and an optional subordinate extension (qualifier). The qualifier is what naturally continues the title after with/and/in/over/for/on. If the title has no qualifier, set "qualifier": null.
2. HEADNOTE vs DESCRIPTION: Headnote is the editorial intro paragraph(s) that sit before the recipe proper (often personal, often 60-180 words). Description is a 1-2 sentence tagline summarising the recipe's appeal (max 250 chars). If the source only has one intro blob, put it in headnote and leave description null.
3. YIELD: Choose "serves" when the text uses Serves/Feeds (a person count). Choose "makes" when it describes what is produced (cookies, loaves, cups, jars, bars). Preserve ranges like "6 to 8" verbatim in quantity. Always compose a clean "display" string (e.g. "Serves 6 to 8", "Makes 12 cups").
4. INGREDIENT ORDERING: Reorder ingredients so they match when they first appear in the instructions. Ingredients used first should appear first within their group.
5. INGREDIENT GROUPING: If the recipe has distinct components (sauce, dressing, base, filling, garnish, etc.), group ingredients into groups with descriptive headings ("For the Dressing", "To Serve"). If all ingredients are used together, use a single group with heading null.
6. INGREDIENT NAME: Use simple, singular, AP-style Title Case names in the "ingredient" field (e.g. "Garlic" not "3 cloves of fresh garlic", "Tomato Paste" not "tomato paste"). Strip brand names, marketing language, and "organic/fresh" qualifiers unless they change the ingredient identity (e.g. keep "Fresh Mozzarella" vs "Mozzarella").
7. INGREDIENT PREPARATION: Put preparation/state phrases into "preparation" — not into "ingredient". Examples: "finely chopped", "divided", "at room temperature", "cut into 1-inch cubes", "to serve", "for garnish". null if no prep state is implied.
8. INGREDIENT DISPLAY: Set "display" to a clean verbatim-style source line ("2 cups rolled oats, toasted"). This preserves typographic fidelity for UI fallback. Always provide a display line.
9. UNITS: Use these exact unit strings when applicable: count, g, kg, oz, lb, ml, l, fl oz, cup, tsp, tbsp, ea, piece, dozen, whole, clove, slice, sprig, pinch, head, bunch, pkg, bag, box, block, tub, container, jar, bottle, can, roll, sleeve. Use null for unitless items (e.g. "salt to taste").
10. INSTRUCTION SIMPLIFICATION: Rewrite instructions to be scannable — short, direct sentences. Keep important technique details and temperatures. Remove filler text, personal stories, and excessive explanation. Each step should focus on one action.
11. STEP NUMBERS: Set step_number to 1, 2, 3, … densely across the full instructions array.
12. TIMERS: Extract timing from instructions. If a step says "cook for 15 minutes", set timer_seconds_low=900 and timer_seconds_high=900. For ranges like "bake 25-30 min", set timer_seconds_low=1500 and timer_seconds_high=1800. Only set timers when there is an explicit wait/cook/bake/rest duration. Both null otherwise.
13. MEAL TYPES: Choose from exactly: "Breakfast", "Snack", "Lunch", "Dinner", "Dessert", "Drink". A recipe can have multiple. Pick based on what the recipe is (use "Drink" for cocktails, smoothies, and other beverages).
14. AMOUNTS: Keep amounts as strings to preserve fractions like "1/2", "3/4". Use null for "to taste" or unspecified amounts.
15. RECIPE NOTE: If the source has a tip/variation/storage/substitution block after the instructions, populate recipe_note with the appropriate type and the body in text. If the author labels it (e.g. "Variation:"), mirror that into title. If there is no such block, set all three fields to null.
16. Return ONLY valid JSON. No markdown, no explanation, no extra text.`;

/* ------------------------------------------------------------------ */
/*  Safe primitive coercion                                           */
/* ------------------------------------------------------------------ */

function safeString(v: unknown, maxLen?: number): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  return maxLen ? s.slice(0, maxLen) : s;
}

function safeInt(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.trunc(n);
}

const VALID_MEAL_TYPES = new Set([
  "Breakfast",
  "Snack",
  "Lunch",
  "Dinner",
  "Dessert",
  "Drink",
]);

const VALID_YIELD_LABELS = new Set<RecipeYieldLabel>(["serves", "makes"]);
const VALID_NOTE_TYPES = new Set<RecipeNoteType>([
  "note",
  "variation",
  "storage",
  "substitution",
]);

/* ------------------------------------------------------------------ */
/*  Sanitiser — maps LLM JSON onto ParsedRecipe                       */
/* ------------------------------------------------------------------ */

function sanitizeTitle(raw: unknown, fallbackName: string | null): ParsedTitle {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>;
    const primary = safeString(r.primary);
    const qualifier = safeString(r.qualifier);
    if (primary) return { primary, qualifier };
  }
  return {
    primary: fallbackName ?? "Untitled Recipe",
    qualifier: null,
  };
}

function buildDisplayName(title: ParsedTitle): string {
  return title.qualifier
    ? `${title.primary} ${title.qualifier}`.replace(/\s+/g, " ").trim()
    : title.primary.trim();
}

function sanitizeYield(raw: unknown): ParsedYield {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { label: null, quantity: null, unit: null, display: null };
  }
  const r = raw as Record<string, unknown>;
  const labelRaw = safeString(r.label)?.toLowerCase();
  const label =
    labelRaw && VALID_YIELD_LABELS.has(labelRaw as RecipeYieldLabel)
      ? (labelRaw as RecipeYieldLabel)
      : null;
  return {
    label,
    quantity: safeString(r.quantity),
    unit: safeString(r.unit),
    display: safeString(r.display),
  };
}

function sanitizeRecipeNote(
  raw: unknown,
  fallbackText: string | null,
): ParsedRecipeNote {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return fallbackText
      ? { type: "note", title: null, text: fallbackText }
      : { type: null, title: null, text: null };
  }
  const r = raw as Record<string, unknown>;
  const typeRaw = safeString(r.type)?.toLowerCase();
  const type =
    typeRaw && VALID_NOTE_TYPES.has(typeRaw as RecipeNoteType)
      ? (typeRaw as RecipeNoteType)
      : null;
  const text = safeString(r.text) ?? fallbackText;
  return {
    type: type ?? (text ? "note" : null),
    title: safeString(r.title),
    text,
  };
}

function sanitizeIngredientItem(raw: unknown): ParsedIngredient | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  // Accept either the new `ingredient` key or a legacy `name` fallback.
  const ingredient =
    safeString(r.ingredient) ?? safeString(r.name) ?? null;
  if (!ingredient) return null;
  return {
    ingredient,
    amount: safeString(r.amount),
    unit: safeString(r.unit),
    preparation: safeString(r.preparation),
    display: safeString(r.display),
    is_optional: r.is_optional === true,
  };
}

function sanitizeIngredientGroup(raw: unknown): ParsedIngredientGroup | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const itemsRaw = Array.isArray(r.items)
    ? r.items
    : Array.isArray(r.ingredients) // legacy field name
      ? r.ingredients
      : [];
  const items = itemsRaw
    .map(sanitizeIngredientItem)
    .filter((i): i is ParsedIngredient => i != null);
  if (items.length === 0) return null;
  return {
    heading: safeString(r.heading) ?? safeString(r.title),
    items,
  };
}

function sanitizeInstructionStep(
  raw: unknown,
  fallbackStepNumber: number,
): ParsedInstructionStep | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const text = safeString(r.text) ?? safeString(r.body);
  if (!text) return null;
  const step = safeInt(r.step_number);
  return {
    step_number: step && step > 0 ? step : fallbackStepNumber,
    text,
    timer_seconds_low: safeInt(r.timer_seconds_low),
    timer_seconds_high: safeInt(r.timer_seconds_high),
  };
}

/**
 * Derive an integer servings from the yield block, if the quantity is a
 * plain number. Keeps the existing servings-stepper scaling math working.
 */
function deriveServings(y: ParsedYield): number | null {
  if (!y.quantity) return null;
  const trimmed = y.quantity.trim();
  const plainNumber = /^\d+$/.exec(trimmed);
  if (plainNumber) return Number(plainNumber[0]);
  // Ranges like "6 to 8" or "6-8": take the lower bound.
  const lowerBound = /^(\d+)\s*(?:to|-|–|—)\s*\d+$/i.exec(trimmed);
  if (lowerBound) return Number(lowerBound[1]);
  return null;
}

function sanitizeParsedRecipe(raw: Record<string, unknown>): ParsedRecipe | null {
  // Title handling (supports legacy flat `name` as fallback).
  const fallbackName = safeString(raw.name);
  const title = sanitizeTitle(raw.title, fallbackName);
  const displayName = buildDisplayName(title);

  const headnote = safeString(raw.headnote, 4000);
  const description = safeString(raw.description, 250);

  // Yield (supports legacy flat `servings`).
  let yieldBlock = sanitizeYield(raw.yield);
  if (
    !yieldBlock.quantity &&
    !yieldBlock.display &&
    raw.servings != null
  ) {
    const legacyServings = safeInt(raw.servings);
    if (legacyServings != null) {
      yieldBlock = {
        label: "serves",
        quantity: String(legacyServings),
        unit: null,
        display: `Serves ${legacyServings}`,
      };
    }
  }
  const servings = deriveServings(yieldBlock);

  const mealTypesRaw = Array.isArray(raw.meal_types) ? raw.meal_types : [];
  const meal_types = mealTypesRaw
    .map((t) => String(t).trim())
    .filter((t) => VALID_MEAL_TYPES.has(t));

  // Ingredient groups (supports legacy `ingredient_sections`).
  const groupsRaw = Array.isArray(raw.ingredient_groups)
    ? raw.ingredient_groups
    : Array.isArray(raw.ingredient_sections)
      ? raw.ingredient_sections
      : [];
  const ingredient_groups = groupsRaw
    .map(sanitizeIngredientGroup)
    .filter((g): g is ParsedIngredientGroup => g != null);

  // Instructions (supports legacy `instruction_steps`).
  const stepsRaw = Array.isArray(raw.instructions)
    ? raw.instructions
    : Array.isArray(raw.instruction_steps)
      ? raw.instruction_steps
      : [];
  const instruction_steps: ParsedInstructionStep[] = [];
  stepsRaw.forEach((s, idx) => {
    const step = sanitizeInstructionStep(s, idx + 1);
    if (step) instruction_steps.push(step);
  });
  // Re-number densely from 1 regardless of what the model returned.
  instruction_steps.forEach((step, idx) => {
    step.step_number = idx + 1;
  });

  // Recipe note (supports legacy flat `notes`).
  const legacyNotes = safeString(raw.notes);
  const recipe_note = sanitizeRecipeNote(raw.recipe_note, legacyNotes);
  const flatNotes = recipe_note.text;

  return {
    name: displayName,
    title,
    headnote,
    description,
    source_url: safeString(raw.source_url),
    servings,
    yield: yieldBlock,
    prep_time_minutes: safeInt(raw.prep_time_minutes),
    cook_time_minutes: safeInt(raw.cook_time_minutes),
    meal_types,
    ingredient_groups,
    instruction_steps,
    notes: flatNotes,
    recipe_note,
  };
}

/* ------------------------------------------------------------------ */
/*  Public entrypoint                                                 */
/* ------------------------------------------------------------------ */

export async function parseRecipeContent(
  rawContent: string,
  opts?: { sourceUrl?: string; inventory?: InventoryHint[] },
): Promise<{ ok: true; recipe: ParsedRecipe } | { ok: false; error: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error:
        "OPENAI_API_KEY is not set. Add it to .env.local to enable recipe import.",
    };
  }

  const content = rawContent.trim();
  if (!content) {
    return { ok: false, error: "No content to parse." };
  }

  const truncated = content.slice(0, 30_000);
  const inventoryBlock = buildInventoryBlock(opts?.inventory ?? []);
  const systemPrompt = inventoryBlock
    ? BASE_SYSTEM_PROMPT + "\n" + inventoryBlock
    : BASE_SYSTEM_PROMPT;

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
          { role: "system", content: systemPrompt },
          { role: "user", content: truncated },
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
    if (!raw) {
      return { ok: false, error: "No response from the AI model." };
    }

    const parsed = tryParseJsonObject(raw);
    if (!parsed) {
      return { ok: false, error: "Could not parse AI response as JSON." };
    }

    if (opts?.sourceUrl && !parsed.source_url) {
      parsed.source_url = opts.sourceUrl;
    }

    const recipe = sanitizeParsedRecipe(parsed);
    if (!recipe) {
      return { ok: false, error: "AI response did not contain a valid recipe." };
    }

    return { ok: true, recipe };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Recipe parsing failed.";
    return { ok: false, error: message };
  }
}
