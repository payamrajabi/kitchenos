/**
 * Shared LLM recipe parse pipeline.
 * Takes raw text (from any source) and returns a structured ParsedRecipe.
 *
 * When the user's existing ingredients are provided, the parser prefers
 * matching names from the inventory so the downstream resolution pipeline
 * gets trivial exact hits instead of relying on fuzzy/LLM matching.
 */

import type { ParsedRecipe } from "./types";

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

When a recipe ingredient matches or is essentially the same as one of these, use the EXACT name from the list above (preserving case). For example:
- Recipe says "lasagna noodles" and inventory has "Lasagna" (variant of "Pasta") → use "Lasagna"
- Recipe says "pepper" and inventory has "Black Pepper" → use "Black Pepper"
- Recipe says "olive oil" and inventory has "Extra Virgin Olive Oil" → use "Extra Virgin Olive Oil"
- Recipe says "butter" and inventory has "Salted Butter" → use "Salted Butter"
Only match when the items are genuinely the same thing. Do NOT match related but distinct items (e.g. "Garlic" ≠ "Garlic Powder", "Coconut Milk" ≠ "Coconut").
If no inventory item matches, use a clean AP-style Title Case name as usual.`;
}

const BASE_SYSTEM_PROMPT = `You are a recipe parser. Given raw text that contains a recipe (from a blog, screenshot transcription, social media post, or pasted notes), extract and return a single JSON object with this exact shape:

{
  "name": "Recipe Name",
  "description": "One or two sentences of author commentary or what makes this recipe special. Max 250 characters. null if nothing relevant.",
  "source_url": "Original URL if visible in the text, otherwise null",
  "servings": 4,
  "prep_time_minutes": 15,
  "cook_time_minutes": 30,
  "meal_types": ["Dinner"],
  "ingredient_sections": [
    {
      "title": "Section name like Sauce, Base, Seasoning, or null if no grouping needed",
      "ingredients": [
        {
          "name": "ingredient name (AP-style Title Case, singular, no brand names)",
          "amount": "2" or "1/2" or null,
          "unit": "cup" or "tbsp" or null,
          "is_optional": false
        }
      ]
    }
  ],
  "instruction_steps": [
    {
      "body": "Concise instruction text",
      "timer_seconds_low": 900,
      "timer_seconds_high": 1200
    }
  ],
  "notes": "Any tips, variations, or storage instructions. null if none."
}

Rules:
1. INGREDIENT ORDERING: Reorder ingredients to match when they first appear in the instructions. Ingredients used first in cooking should appear first.
2. INGREDIENT GROUPING: If the recipe has distinct components (sauce, dressing, base, filling, garnish, etc.), group ingredients into sections with descriptive titles. If all ingredients are used together, use a single section with title null.
3. INGREDIENT NAMES: Use simple, singular, AP-style Title Case names (e.g. "Garlic" not "3 cloves of fresh garlic", "Tomato Paste" not "tomato paste"). Strip brand names, marketing language, and "organic/fresh" qualifiers unless they change the ingredient identity (e.g. keep "Fresh Mozzarella" vs "Mozzarella").
4. UNITS: Use these exact unit strings when applicable: count, g, kg, oz, lb, ml, l, fl oz, cup, tsp, tbsp, ea, piece, dozen, whole, clove, slice, sprig, pinch, head, bunch, pkg, bag, box, block, tub, container, jar, bottle, can, roll, sleeve. Use null for unitless items (e.g. "salt to taste").
5. INSTRUCTION SIMPLIFICATION: Rewrite instructions to be scannable — short, direct sentences. Keep important technique details and temperatures. Remove filler text, personal stories, and excessive explanation. Each step should focus on one action.
6. TIMERS: Extract timing from instructions. If a step says "cook for 15 minutes", set timer_seconds_low=900 and timer_seconds_high=900. For ranges like "bake 25-30 min", set timer_seconds_low=1500 and timer_seconds_high=1800. Only set timers when there is an explicit wait/cook/bake/rest duration. Both null otherwise.
7. MEAL TYPES: Choose from exactly: "Breakfast", "Lunch", "Dinner", "Snack", "Dessert". A recipe can have multiple. Pick based on what the recipe is.
8. DESCRIPTION: Summarize the recipe's appeal or the author's note in 1-2 sentences (max 250 chars). This is NOT the full instructions — it's a tagline.
9. AMOUNTS: Keep amounts as strings to preserve fractions like "1/2", "3/4". Use null for "to taste" or unspecified amounts.
10. Return ONLY valid JSON. No markdown, no explanation, no extra text.`;

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
  "Lunch",
  "Dinner",
  "Snack",
  "Dessert",
]);

function sanitizeParsedRecipe(raw: Record<string, unknown>): ParsedRecipe | null {
  const name = safeString(raw.name);
  if (!name) return null;

  const mealTypesRaw = Array.isArray(raw.meal_types) ? raw.meal_types : [];
  const meal_types = mealTypesRaw
    .map((t) => String(t).trim())
    .filter((t) => VALID_MEAL_TYPES.has(t));

  const sectionsRaw = Array.isArray(raw.ingredient_sections)
    ? raw.ingredient_sections
    : [];
  const ingredient_sections = sectionsRaw
    .filter(
      (s): s is Record<string, unknown> =>
        s != null && typeof s === "object" && !Array.isArray(s),
    )
    .map((s) => {
      const ings = Array.isArray(s.ingredients) ? s.ingredients : [];
      return {
        title: safeString(s.title),
        ingredients: ings
          .filter(
            (i): i is Record<string, unknown> =>
              i != null && typeof i === "object" && !Array.isArray(i),
          )
          .map((i) => ({
            name: safeString(i.name) ?? "unknown",
            amount: safeString(i.amount),
            unit: safeString(i.unit),
            is_optional: i.is_optional === true,
          }))
          .filter((i) => i.name !== "unknown"),
      };
    })
    .filter((s) => s.ingredients.length > 0);

  const stepsRaw = Array.isArray(raw.instruction_steps)
    ? raw.instruction_steps
    : [];
  const instruction_steps = stepsRaw
    .filter(
      (s): s is Record<string, unknown> =>
        s != null && typeof s === "object" && !Array.isArray(s),
    )
    .map((s) => ({
      body: safeString(s.body) ?? "",
      timer_seconds_low: safeInt(s.timer_seconds_low),
      timer_seconds_high: safeInt(s.timer_seconds_high),
    }))
    .filter((s) => s.body !== "");

  return {
    name,
    description: safeString(raw.description, 250),
    source_url: safeString(raw.source_url),
    servings: safeInt(raw.servings),
    prep_time_minutes: safeInt(raw.prep_time_minutes),
    cook_time_minutes: safeInt(raw.cook_time_minutes),
    meal_types,
    ingredient_sections,
    instruction_steps,
    notes: safeString(raw.notes),
  };
}

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
