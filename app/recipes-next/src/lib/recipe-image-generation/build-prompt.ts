/**
 * Build the generation prompt and Google Image search query for a recipe.
 *
 * Inputs live in Supabase. We accept them already-loaded so this function
 * stays pure and easy to test.
 */

import {
  DEFAULT_VESSEL,
  HOUSE_STYLE_BLOCK,
  describeVessel,
  type ArtDirectionContext,
  type VesselKind,
} from "./art-direction";

const VESSEL_INFER_MODEL = "gpt-4o-mini";
const VESSEL_INFER_TIMEOUT_MS = 15_000;

const VESSEL_VALUES: VesselKind[] = [
  "bowl",
  "plate",
  "shallow-bowl",
  "wide-plate",
  "glass",
  "mug",
  "baking-dish",
  "cutting-board",
  "skillet",
];

export type PromptInput = {
  name: string;
  description?: string | null;
  mealTypes?: string[] | null;
  ingredientNames: string[];
  instructionStepBodies: string[];
  servings?: number | null;
};

export type PromptResult = {
  /** Short phrase for Google Images — what a human would type. */
  searchQuery: string;
  /** Full text prompt for Flux Kontext Max / gpt-image-1. */
  generationPrompt: string;
  /** What vessel we picked (so QC / logs can reason about it). */
  vessel: VesselKind;
};

/**
 * Trim down an ingredient list to the 5-8 that most visually define the dish.
 * Leading ingredients in a recipe are usually the bulk — oil/salt/pepper at
 * the bottom are rarely visually identifying.
 */
function headlineIngredients(names: string[]): string[] {
  const cleaned = names
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
    .filter(
      (n) =>
        !/^(salt|pepper|black pepper|white pepper|water|olive oil|oil|butter|cooking spray|kosher salt|sea salt)$/i.test(
          n,
        ),
    );
  return cleaned.slice(0, 8);
}

/**
 * Use a small LLM call to pick the most believable vessel for the dish.
 * Falls back to a safe default if the call fails or the output is bogus.
 */
export async function inferVessel(
  input: PromptInput,
): Promise<{ vessel: VesselKind; finish?: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { vessel: DEFAULT_VESSEL };

  const firstInstructions = input.instructionStepBodies
    .slice(0, 4)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" | ");

  const userContent = [
    `Recipe name: ${input.name}`,
    input.description ? `Description: ${input.description}` : null,
    input.mealTypes?.length ? `Meal types: ${input.mealTypes.join(", ")}` : null,
    input.ingredientNames.length
      ? `Key ingredients: ${headlineIngredients(input.ingredientNames).join(", ")}`
      : null,
    firstInstructions ? `First steps: ${firstInstructions}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const systemPrompt = `You pick the most believable serving vessel for a finished dish in a food photograph.

Return a single JSON object of this exact shape (no prose, no markdown):
{ "vessel": "<one of: ${VESSEL_VALUES.join(" | ")}>", "finish": "<optional short descriptor like 'matte stoneware' or 'warm cream ceramic', or null>" }

Guidance:
- Soups, stews, curries, ramen, grain bowls → "bowl" or "shallow-bowl"
- Pasta, risotto, rice dishes with sauce → "shallow-bowl"
- Steaks, roasted veg, sandwiches, salads → "plate" or "wide-plate"
- Smoothies, cocktails → "glass"
- Hot drinks, porridge → "mug" or "bowl"
- Casseroles, lasagnas, baked pasta that's shown straight from the oven → "baking-dish"
- Bread, charcuterie, whole roasted meats → "cutting-board"
- One-pan pan-fried dishes shown in the pan → "skillet"

If uncertain, pick "shallow-bowl". Keep "finish" short (3-5 words) or null.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: VESSEL_INFER_MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        max_tokens: 80,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(VESSEL_INFER_TIMEOUT_MS),
    });
    if (!res.ok) return { vessel: DEFAULT_VESSEL };
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = JSON.parse(raw) as { vessel?: string; finish?: string | null };
    const v = (parsed.vessel ?? "").toLowerCase().trim();
    const vessel = (VESSEL_VALUES as string[]).includes(v)
      ? (v as VesselKind)
      : DEFAULT_VESSEL;
    const finish = parsed.finish && typeof parsed.finish === "string"
      ? parsed.finish.trim() || undefined
      : undefined;
    return { vessel, finish };
  } catch {
    return { vessel: DEFAULT_VESSEL };
  }
}

/**
 * Build the final generation prompt + search query. Pure, aside from an
 * optional LLM call delegated to `inferVessel`.
 */
export async function buildRecipeImagePrompt(
  input: PromptInput,
): Promise<PromptResult> {
  const headline = headlineIngredients(input.ingredientNames);
  const { vessel, finish } = await inferVessel(input);
  const ctx: ArtDirectionContext = { vessel, vesselFinish: finish };
  const vesselPhrase = describeVessel(ctx);

  const searchQuery = buildSearchQuery(input.name, headline);

  const subjectLine = [
    `Subject: a finished serving of "${input.name.trim()}"`,
    headline.length ? `featuring ${headline.join(", ")}` : null,
    `${vesselPhrase}`,
  ]
    .filter(Boolean)
    .join(", ");

  const referenceNote =
    "Use the attached reference photographs as a guide for the dish's real-world colour, plating, texture, and garnish. Do not copy any single reference — produce a fresh photograph that matches the spirit of the best elements.";

  const generationPrompt = [subjectLine + ".", HOUSE_STYLE_BLOCK, referenceNote]
    .join("\n\n")
    .trim();

  return { searchQuery, generationPrompt, vessel };
}

/**
 * A short phrase you'd actually type into Google Images. Deterministic so
 * tests can assert on it.
 */
export function buildSearchQuery(
  recipeName: string,
  headlineIngredientsList: string[],
): string {
  const name = recipeName.trim();
  const parts: string[] = [];
  if (name) parts.push(name);
  if (headlineIngredientsList.length) {
    parts.push(headlineIngredientsList.slice(0, 3).join(" "));
  }
  parts.push("food photography");
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
