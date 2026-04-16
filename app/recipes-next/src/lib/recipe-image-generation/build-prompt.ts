/**
 * Creative Director step.
 *
 * We hand the full recipe context to a reasoning-capable chat model and ask
 * it to act as a world-class food photography art director: pick a scene,
 * vessel, lighting mood, framing, and props that suit the dish, then write a
 * rich cinematic generation prompt that the image model will render verbatim.
 *
 * The hard constraints from art-direction.ts are communicated in the system
 * prompt AND stapled onto the final prompt by the orchestrator — belt and
 * braces so the model can't quietly drift off-brief.
 */

import { hardConstraintsBlock, HOUSE_NEGATIVE_PROMPT } from "./art-direction";

/**
 * Reasoning-capable chat model used to direct each shot. Tune here.
 * `gpt-5` is the strongest available at the time of writing; `gpt-4.1` is a
 * reasonable cheaper fallback, `o3` for maximum reasoning depth.
 */
const CREATIVE_DIRECTOR_MODEL =
  process.env.RECIPE_IMAGE_DIRECTOR_MODEL?.trim() || "gpt-5";

const CREATIVE_DIRECTOR_TIMEOUT_MS = 60_000;

export type PromptInput = {
  name: string;
  description?: string | null;
  mealTypes?: string[] | null;
  ingredientNames: string[];
  instructionStepBodies: string[];
  servings?: number | null;
};

export type PromptResult = {
  /** The full text prompt handed to the image generator. */
  generationPrompt: string;
  /** Short model-provided summary of the creative choice (for logs). */
  sceneConcept: string;
};

/**
 * Drop clearly-invisible pantry staples from the ingredient list before
 * showing it to the director — they rarely help define the shot and waste
 * tokens. Returns at most 12 headline ingredients.
 */
function headlineIngredients(names: string[]): string[] {
  return names
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
    .filter(
      (n) =>
        !/^(salt|pepper|black pepper|white pepper|water|olive oil|oil|butter|cooking spray|kosher salt|sea salt|flaky sea salt)$/i.test(
          n,
        ),
    )
    .slice(0, 12);
}

const SYSTEM_PROMPT = `You are a world-class food photography art director for an editorial cookbook publisher. Given a recipe, you make a single thoughtful creative decision about how the dish should be photographed, then write a rich, cinematic image-generation prompt that another model will render verbatim.

Think carefully about what the dish IS in real life and what SCENE would make it look most appetising to a reader. Make specific, evocative choices. Avoid generic "bowl on a table" staging — pick the scene a great editorial photographer would pick.

You have full creative freedom over these:
- Serving vessel. Be specific and appropriate (e.g. enamel Le Creuset dutch oven for chili, Waterford crystal coupe for a classic cocktail, a scuffed PlanetBox metal lunch tin for school lunches, a worn wooden board for bread, a wide rimmed ceramic pasta plate, a clay tagine, a small ramekin, a cast-iron skillet straight from the oven).
- Lighting mood. Match the dish and occasion: bright morning window light for breakfast; warm golden late-afternoon for comfort food; dim moody low-lit bar for cocktails; soft overcast daylight for a picnic; candlelit dusk for a date-night plate; cool open shade outdoors.
- Setting and surface. Linen, pine farm table, marble counter, bar top with a brass rail, a kid's school table, a picnic blanket on grass, a tiled kitchen counter, a rustic cutting board — pick what fits.
- Composition and framing. Tight cross-section, three-quarter overhead, straight overhead flat lay, 45-degree hero angle, close subject with breathing room, cropped in tight. Whatever best sells the dish.
- Props. One or two subtle, unstyled props that reinforce the scene (a folded napkin, a spoon mid-dip, a small bowl of salt flakes, a glass of wine slightly out of focus, a crumpled bill at the bar, a lunchbox thermos). Never crowd the hero.

Hard constraints you must build into the prompt (these are non-negotiable):
${hardConstraintsBlock()}

Also explicitly avoid: ${HOUSE_NEGATIVE_PROMPT.join(", ")}.

OUTPUT FORMAT — return STRICT JSON with exactly these two keys and nothing else. No markdown fences, no commentary:
{
  "scene_concept": "<one sentence summary of your creative choice, e.g. 'Scuffed enamel dutch oven of chili on a pine farm table in warm late-afternoon light'>",
  "prompt": "<the full image-generation prompt, 2-4 paragraphs of rich cinematic description, written the way a photographer would brief an AI image model. Must encode every hard constraint. Name the specific vessel, the lens, the aperture, the light, the surface, the props, the framing, the mood.>"
}`;

function buildUserMessage(input: PromptInput): string {
  const lines: string[] = [];
  lines.push(`Recipe name: ${input.name.trim()}`);
  if (input.description?.trim()) {
    lines.push(`Description: ${input.description.trim()}`);
  }
  if (input.mealTypes?.length) {
    lines.push(`Meal types: ${input.mealTypes.join(", ")}`);
  }
  if (input.servings != null && input.servings > 0) {
    lines.push(`Servings: ${input.servings}`);
  }
  const headline = headlineIngredients(input.ingredientNames);
  if (headline.length) {
    lines.push(`Key ingredients (in order of importance): ${headline.join(", ")}`);
  }
  const steps = input.instructionStepBodies
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);
  if (steps.length) {
    lines.push("Instructions:");
    steps.forEach((body, idx) => {
      lines.push(`${idx + 1}. ${body}`);
    });
  }
  return lines.join("\n");
}

type DirectorResponse = {
  scene_concept?: string;
  prompt?: string;
};

async function callCreativeDirector(
  input: PromptInput,
  apiKey: string,
): Promise<DirectorResponse> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CREATIVE_DIRECTOR_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserMessage(input) },
      ],
    }),
    signal: AbortSignal.timeout(CREATIVE_DIRECTOR_TIMEOUT_MS),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `Creative Director call failed (${res.status}): ${txt.slice(0, 300)}`,
    );
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!raw) throw new Error("Creative Director returned empty content.");
  try {
    return JSON.parse(raw) as DirectorResponse;
  } catch {
    throw new Error("Creative Director returned non-JSON content.");
  }
}

/**
 * Minimal fallback if the director call fails entirely — produces a generic
 * but safe prompt so the pipeline can still produce an image.
 */
function fallbackPrompt(input: PromptInput): PromptResult {
  const headline = headlineIngredients(input.ingredientNames);
  const subject = [
    `A finished serving of "${input.name.trim()}"`,
    headline.length ? `featuring ${headline.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const prompt = [
    `${subject}, photographed as a single hero image for a modern editorial cookbook.`,
    "Served in a visually appropriate vessel on a neutral linen or worn wood surface, with soft natural window light from the side and one or two subtle unstyled props nearby.",
    "Shot on a full-frame camera with an 85mm prime lens at f/2.0 — shallow depth of field, the subject tack-sharp, the background gently out of focus. Composition is a three-quarter overhead view with the food as the visual hero.",
    "The image must look like an unretouched real photograph, honest colours, slightly muted, natural shadows. No text, no watermarks, no logos, no hands, no 3D or CGI, no cartoon, no plastic sheen.",
  ].join("\n\n");

  return {
    generationPrompt: prompt,
    sceneConcept: "Fallback: neutral editorial hero shot (director unavailable).",
  };
}

/**
 * Build the final generation prompt using the Creative Director. Returns a
 * safe fallback prompt if the director call fails for any reason — we don't
 * want a transient OpenAI blip to block image generation entirely.
 */
export async function buildRecipeImagePrompt(
  input: PromptInput,
): Promise<PromptResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return fallbackPrompt(input);
  }

  try {
    const result = await callCreativeDirector(input, apiKey);
    const prompt = (result.prompt ?? "").trim();
    const sceneConcept = (result.scene_concept ?? "").trim();
    if (!prompt) {
      return fallbackPrompt(input);
    }
    return {
      generationPrompt: prompt,
      sceneConcept: sceneConcept || "Director returned no scene summary.",
    };
  } catch (err) {
    console.warn(
      "[recipe-image] Creative Director call failed; using fallback prompt",
      err,
    );
    return fallbackPrompt(input);
  }
}
