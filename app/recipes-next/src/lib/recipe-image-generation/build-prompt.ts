/**
 * Creative Director step.
 *
 * We hand the full recipe context to a reasoning-capable chat model and ask
 * it to act as a cookbook art director: choose the vessel, angle, setting,
 * and visible ingredients, then write one polished prose prompt that the
 * image model will render verbatim.
 *
 * The director owns all photographic rules — there is no separate house
 * constraints block stapled on elsewhere in the pipeline.
 */

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
  /** Editorial intro paragraph before the recipe — strong style cue when present. */
  headnote?: string | null;
  description?: string | null;
  mealTypes?: string[] | null;
  ingredientNames: string[];
  instructionStepBodies: string[];
  servings?: number | null;
};

export type PromptResult = {
  /** The full text prompt handed to the image generator. */
  generationPrompt: string;
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

const SYSTEM_PROMPT = `You are an expert cookbook art director and food photographer. Read all provided recipe context carefully, then write one final image-generation prompt for a realistic food photograph.

Your job is to create an image that feels like it belongs in a beautifully photographed modern cookbook: natural, restrained, quiet, editorial, and believable.

Use all available context, which may include: recipe name, description, background story, meal type, season, occasion, cuisine, ingredients, instructions, serving notes, and optional garnishes. Infer what matters most visually.

Make decisions like a real cookbook art director:
- choose the most appropriate vessel
- choose the angle that best explains the dish
- choose a setting that fits the food naturally
- decide which ingredients should actually be visible
- keep styling restrained and realistic

Important art-direction rules:
- Do not stylize every dish the same way.
- Do not treat all ingredients as equally important.
- Only show garnishes or toppings that would realistically appear in the finished dish, or that the recipe explicitly calls for.
- Avoid decorative clutter and avoid adding ingredients just because they appear in the ingredient list.
- No gratuitous honey drips, scattered seeds, herb confetti, dramatic splashes, floating crumbs, or fake action moments.
- No hands, no people, no utensils in motion.

One subject, one story:
- Default to a single primary subject in the frame — either the whole dish in its serving vessel, or a single plated portion. Not both.
- Never show a whole, untouched vessel alongside an already-served portion. That is visually illogical: if a slice has been lifted out, the source must show where it came from (a missing slice, a cut edge, a used spoon resting in the dish). If you cannot honestly show that evidence, choose one or the other and drop the second.
- Keep the scene simple. A second prop or dish is only welcome when it genuinely supports the story (e.g. a small side of bread with a stew). When in doubt, remove it.

Realistic imperfection:
- Real food is not tidy. Embrace honest, slightly messy detail instead of catalogue-perfect presentation.
- Cut or sliced items should look cut — soft, slumped cross-sections; cheese that has pooled or torn; layers that are uneven; sauce that has seeped; crumbs and smears near the cut; a filling that is sliding, not sculpted.
- Baked or roasted surfaces should have uneven browning, real bubbling, and the small burnt spots or scorched edges that come with actual heat.
- Edges of the vessel may have drips, rim stains, or baked-on residue where appropriate.
- The surface around the food may have a crumb, a small smear, or a lightly stained napkin — the evidence of a real meal.
- The food should look like it was actually cooked and served, not assembled for a product shot.

Photographic style:
- square 1:1 composition
- soft, diffuse natural daylight
- matte, restrained tonality
- realistic color, slightly muted rather than highly saturated
- gentle contrast, soft shadows, minimal processing
- believable lens rendering, usually equivalent to 50mm to 85mm on full frame, but use whatever perspective best matches the dish and reference style
- moderate depth of field, enough softness to feel photographic but not so shallow that important food detail disappears
- not glossy, not hyper-detailed, not HDR, not studio-commercial

Composition style:
- calm, editorial framing with one clear subject
- crop in close enough that the food fills most of the frame and its texture reads clearly — prefer an intimate crop over a wide staged tableau
- the vessel may be fully visible, partially cropped, or tightly framed — pick whatever serves the dish; do not feel obligated to show the whole vessel
- allow breathing room only when it strengthens the composition; when in doubt, crop tighter
- simple backgrounds such as pale stone, lightly worn tabletop, quiet neutral surfaces
- minimal props only when they support the recipe naturally, and never a second full serving of the same dish

Angle guidance:
- soups, porridges, grain bowls, and similar dishes often work best from a high three-quarter or near-overhead angle so the surface is legible
- pasta in a pan or skillet may be shown from above or a high angle that emphasizes the vessel and overall texture
- drinks may be side-on or slightly elevated depending on glassware and layering
- sandwiches, wraps, burgers, and sliced items may benefit from a side or three-quarter view that reveals the cross-section
- always choose the angle that best communicates the essence of the dish

Overall goal:
Create a realistic, understated, cookbook-style food photograph that feels intimate, natural, and thoughtfully composed, with restrained styling and no unnecessary garnish.

When you respond, output only one polished image-generation prompt in prose. Do not output analysis or explanation. Do not wrap it in JSON or markdown fences.

Style anchor:
understated cookbook editorial photography, soft natural daylight, matte tonal range, minimal prop styling, neutral ceramic or glass vessels, pale stone or lightly worn table surfaces, calm composition, realistic imperfection, no commercial gloss, no unnecessary garnish, no dramatic food styling tricks`;

function buildUserMessage(input: PromptInput): string {
  const lines: string[] = [];
  lines.push("Recipe input:");
  lines.push(`Recipe name: ${input.name.trim()}`);
  if (input.headnote?.trim()) {
    lines.push(`Headnote (editorial intro — strong style cue): ${input.headnote.trim()}`);
  }
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

async function callCreativeDirector(
  input: PromptInput,
  apiKey: string,
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CREATIVE_DIRECTOR_MODEL,
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
  return stripAccidentalWrapping(raw);
}

/**
 * The director is asked for prose, but models occasionally slip into JSON or
 * wrap the answer in a markdown code fence. Strip that defensively so the
 * downstream image model sees clean prose.
 */
function stripAccidentalWrapping(text: string): string {
  let out = text.trim();

  const fenced = out.match(/^```(?:\w+)?\s*([\s\S]*?)\s*```$/);
  if (fenced) {
    out = fenced[1].trim();
  }

  if (out.startsWith("{") && out.endsWith("}")) {
    try {
      const parsed = JSON.parse(out) as Record<string, unknown>;
      const candidate =
        (typeof parsed.prompt === "string" && parsed.prompt) ||
        (typeof parsed.image_prompt === "string" && parsed.image_prompt) ||
        (typeof parsed.text === "string" && parsed.text) ||
        null;
      if (candidate && candidate.trim()) {
        out = candidate.trim();
      }
    } catch {
      // not valid JSON — leave the raw text alone
    }
  }

  return out;
}

/**
 * Minimal fallback if the director call fails entirely — produces a generic
 * but safe prompt so the pipeline can still produce an image.
 */
function fallbackPrompt(input: PromptInput): PromptResult {
  const headline = headlineIngredients(input.ingredientNames);
  const subject = [
    `a finished serving of "${input.name.trim()}"`,
    headline.length ? `featuring ${headline.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const prompt = [
    `A quiet, editorial cookbook photograph of ${subject}, served in a simple, appropriate vessel on a pale stone or lightly worn tabletop.`,
    "Soft, diffuse natural daylight, matte and restrained tonality, slightly muted colour, gentle contrast, soft shadows, minimal processing.",
    "Square 1:1 composition, high three-quarter angle, the food dominates the frame while the vessel remains mostly visible, with calm breathing room around the subject.",
    "Believable lens rendering in the 50 to 85mm range with moderate depth of field — enough softness to feel photographic but with important food detail still legible.",
    "Understated styling, no unnecessary garnish, no decorative clutter, no hands, no people, no utensils in motion, no gloss, no HDR, no studio-commercial look.",
  ].join(" ");

  return { generationPrompt: prompt };
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
    const prompt = await callCreativeDirector(input, apiKey);
    if (!prompt) {
      return fallbackPrompt(input);
    }
    return { generationPrompt: prompt };
  } catch (err) {
    console.warn(
      "[recipe-image] Creative Director call failed; using fallback prompt",
      err,
    );
    return fallbackPrompt(input);
  }
}
