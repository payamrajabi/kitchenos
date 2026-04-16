/**
 * Post-generation vision check.
 *
 * After Flux / gpt-image-1 returns a candidate image, we ask GPT-4o to
 * judge whether it (a) actually depicts the recipe and (b) looks like a
 * real photo rather than an "AI food" image. If it fails, the orchestrator
 * retries generation once with a tightened prompt.
 *
 * Cheap to skip — the pipeline continues with whatever we have if QC errors.
 */

const QC_MODEL = "gpt-4o";
const QC_TIMEOUT_MS = 30_000;

export type QcInput = {
  recipeName: string;
  headlineIngredients: string[];
  imageDataUrl: string;
};

export type QcVerdict = {
  pass: boolean;
  /** Short reason — used to tighten the retry prompt. */
  reason?: string;
  /** Model-supplied score 1-5 on visual realism. */
  realismScore?: number;
  /** Model-supplied score 1-5 on dish match. */
  dishMatchScore?: number;
};

const QC_SYSTEM_PROMPT = `You are QA for an AI food photography pipeline.

You will be shown ONE generated image plus a dish name and key ingredients. Judge whether it is acceptable to publish as the hero photo for that dish.

Score it on two axes, 1 (terrible) to 5 (excellent):
- realism: does it look like a real camera photograph (not AI, not 3D, not plastic, no warped utensils, no extra fingers, no impossible shadows)?
- dishMatch: does it show the correct dish with the stated key ingredients?

It passes only if BOTH realism >= 3 AND dishMatch >= 3.

Return STRICT JSON (no prose):
{ "realism": <1-5>, "dishMatch": <1-5>, "pass": <true|false>, "reason": "<short sentence explaining the lower score, or 'looks good'>" }`;

export async function qcRecipeImage(
  input: QcInput,
): Promise<QcVerdict> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { pass: true, reason: "QC skipped (no api key)" };

  const userText = [
    `Dish: "${input.recipeName}"`,
    input.headlineIngredients.length
      ? `Key ingredients: ${input.headlineIngredients.join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: QC_MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: QC_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              {
                type: "image_url",
                image_url: { url: input.imageDataUrl, detail: "high" },
              },
            ],
          },
        ],
        max_tokens: 200,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(QC_TIMEOUT_MS),
    });

    if (!res.ok) return { pass: true, reason: "QC unreachable" };
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) return { pass: true, reason: "QC empty response" };

    const parsed = JSON.parse(raw) as {
      realism?: number;
      dishMatch?: number;
      pass?: boolean;
      reason?: string;
    };

    const realism = Number(parsed.realism);
    const dishMatch = Number(parsed.dishMatch);
    const pass =
      parsed.pass === true ||
      (Number.isFinite(realism) && realism >= 3 &&
        Number.isFinite(dishMatch) && dishMatch >= 3);

    return {
      pass,
      reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
      realismScore: Number.isFinite(realism) ? realism : undefined,
      dishMatchScore: Number.isFinite(dishMatch) ? dishMatch : undefined,
    };
  } catch {
    return { pass: true, reason: "QC error (skipped)" };
  }
}

/**
 * Turn raw bytes + content type into a data URL the vision API accepts.
 */
export function bytesToDataUrl(bytes: Uint8Array, contentType: string): string {
  const b64 = Buffer.from(bytes).toString("base64");
  return `data:${contentType};base64,${b64}`;
}
