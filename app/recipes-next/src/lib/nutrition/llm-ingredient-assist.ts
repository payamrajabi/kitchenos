/**
 * LLM-assisted search prep for ingredient nutrition — **never** returns macros.
 * Produces better CNF / FDC query strings and ambiguity flags only.
 */

export type IngredientLlmAssist = {
  cnfSearchQuery: string;
  fdcFoundationSearchQuery: string;
  fdcBrandedSearchQuery: string;
  likelyAmbiguous: boolean;
  ambiguityNote: string | null;
};

const FALLBACK: IngredientLlmAssist = {
  cnfSearchQuery: "",
  fdcFoundationSearchQuery: "",
  fdcBrandedSearchQuery: "",
  likelyAmbiguous: false,
  ambiguityNote: null,
};

/**
 * Optional OpenAI step. Returns `null` when no key or on failure — pipeline falls back to deterministic queries.
 */
export async function ingredientNutritionLlmAssist(input: {
  name: string;
  brand: string | null;
}): Promise<IngredientLlmAssist | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const name = input.name.trim();
  if (!name) return null;

  const system = `You help map a pantry ingredient to public food composition databases (Canadian Nutrient File and USDA FoodData Central).
You only output search strategy — never calories, grams of protein, fat, carbs, or any nutrition numbers.
Return compact JSON with:
- cnfSearchQuery: best short English phrase for Canadian whole-food search (generic foods).
- fdcFoundationSearchQuery: best phrase for USDA Foundation Foods (generic / commodity).
- fdcBrandedSearchQuery: best phrase for packaged branded products (include brand if relevant).
- likelyAmbiguous: true if the name could reasonably match several different foods.
- ambiguityNote: short reason or null.

Rules:
- Prefer common culinary names (e.g. "bell pepper red raw" not marketing copy).
- For clear branded items, put brand in fdcBrandedSearchQuery.
- Never invent nutrition facts.`;

  const user = JSON.stringify({
    name,
    brand: input.brand?.trim() || null,
  });

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const cnfSearchQuery = String(parsed.cnfSearchQuery ?? "").trim();
    const fdcFoundationSearchQuery = String(
      parsed.fdcFoundationSearchQuery ?? "",
    ).trim();
    const fdcBrandedSearchQuery = String(
      parsed.fdcBrandedSearchQuery ?? "",
    ).trim();
    const likelyAmbiguous =
      parsed.likelyAmbiguous === true || parsed.likelyAmbiguous === "true";
    const ambiguityNoteRaw = parsed.ambiguityNote;
    const ambiguityNote =
      ambiguityNoteRaw == null || ambiguityNoteRaw === ""
        ? null
        : String(ambiguityNoteRaw).slice(0, 500);

    return {
      cnfSearchQuery,
      fdcFoundationSearchQuery,
      fdcBrandedSearchQuery,
      likelyAmbiguous,
      ambiguityNote,
    };
  } catch {
    return null;
  }
}

/** Merge LLM strings with deterministic fallback when empty. */
export function mergeAssistQueries(
  assist: IngredientLlmAssist | null,
  fallbackCnf: string,
): IngredientLlmAssist {
  if (!assist) {
    return {
      ...FALLBACK,
      cnfSearchQuery: fallbackCnf,
      fdcFoundationSearchQuery: fallbackCnf,
      fdcBrandedSearchQuery: fallbackCnf,
    };
  }
  return {
    cnfSearchQuery: assist.cnfSearchQuery || fallbackCnf,
    fdcFoundationSearchQuery:
      assist.fdcFoundationSearchQuery || assist.cnfSearchQuery || fallbackCnf,
    fdcBrandedSearchQuery:
      assist.fdcBrandedSearchQuery || assist.cnfSearchQuery || fallbackCnf,
    likelyAmbiguous: assist.likelyAmbiguous,
    ambiguityNote: assist.ambiguityNote,
  };
}
