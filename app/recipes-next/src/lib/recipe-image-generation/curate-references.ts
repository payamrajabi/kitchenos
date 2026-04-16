/**
 * Replace the human "eye" for picking appetising reference photos.
 *
 * We send GPT-4o all the candidate thumbnails in a single vision call and
 * ask it to rank them against an explicit rubric (lighting, plating,
 * dish match, "looks like a real photo"). It returns indices we use to
 * select the top 3 originals.
 */

import type { ReferenceCandidate } from "./search-references";

const CURATION_MODEL = "gpt-4o";
const CURATION_TIMEOUT_MS = 45_000;
const DESIRED_TOP = 3;

export type CurationInput = {
  recipeName: string;
  headlineIngredients: string[];
  candidates: ReferenceCandidate[];
};

export type CurationResult = {
  picked: ReferenceCandidate[];
  /** Ranked indices (0-based) referencing the input candidates array. */
  rankedIndices: number[];
  /** Model-supplied reasoning. Captured for logs/QA, never shown to users. */
  notes?: string;
};

const CURATION_SYSTEM_PROMPT = `You are a food photography editor curating reference photos.

You will be shown a numbered set of thumbnails (index 0, 1, 2, ...). Rank them from BEST to WORST as a reference for how a specific dish should look in a real editorial food photograph.

Score each candidate on:
1. Is this a genuine photograph (not an illustration, 3D render, or obvious AI image)?
2. Does it actually show the dish described (correct main ingredients visible, correct form)?
3. Is the lighting natural and flattering (soft window light, not flat studio or harsh flash)?
4. Is the plating believable (real-world, slightly imperfect, editorial — not pack-shot staged)?
5. Is it free of watermarks, logos, text overlays, faces, and heavy recipe-card graphics?

Heavily penalise: cartoon/illustration, AI-generated images, stock photos with visible watermarks, infographic layouts with text, pack-shot white-background product photography, photos that don't actually match the dish.

Return STRICT JSON (no prose, no markdown) with this shape:
{
  "ranked": [<index>, <index>, ...],
  "notes": "one short sentence about why the top pick won"
}

Include ALL candidate indices in the ranked array, best first.`;

export async function curateReferenceCandidates(
  input: CurationInput,
): Promise<
  { ok: true; result: CurationResult } | { ok: false; error: string }
> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error: "OPENAI_API_KEY is not set.",
    };
  }
  if (!input.candidates.length) {
    return { ok: false, error: "No candidates to curate." };
  }

  const userText = [
    `Dish: "${input.recipeName}"`,
    input.headlineIngredients.length
      ? `Key visible ingredients: ${input.headlineIngredients.join(", ")}`
      : null,
    `I am showing you ${input.candidates.length} candidate thumbnails, indexed 0 through ${input.candidates.length - 1} in the order they appear below.`,
    "Rank them best to worst using the rubric.",
  ]
    .filter(Boolean)
    .join("\n");

  const imageContent = input.candidates.map((c) => ({
    type: "image_url" as const,
    image_url: { url: c.thumbnailUrl, detail: "low" as const },
  }));

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CURATION_MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: CURATION_SYSTEM_PROMPT },
          {
            role: "user",
            content: [{ type: "text", text: userText }, ...imageContent],
          },
        ],
        max_tokens: 300,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(CURATION_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error: `OpenAI curation error (${res.status}): ${body.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      return fallbackRanking(input.candidates);
    }

    const parsed = JSON.parse(raw) as {
      ranked?: unknown;
      notes?: string;
    };
    const indices = Array.isArray(parsed.ranked)
      ? (parsed.ranked.filter(
          (n) => typeof n === "number" && Number.isInteger(n),
        ) as number[])
      : [];

    const seen = new Set<number>();
    const clean: number[] = [];
    for (const i of indices) {
      if (i < 0 || i >= input.candidates.length) continue;
      if (seen.has(i)) continue;
      seen.add(i);
      clean.push(i);
    }
    for (let i = 0; i < input.candidates.length; i++) {
      if (!seen.has(i)) clean.push(i);
    }

    const pickedIndices = clean.slice(0, DESIRED_TOP);
    return {
      ok: true,
      result: {
        picked: pickedIndices.map((i) => input.candidates[i]),
        rankedIndices: clean,
        notes: typeof parsed.notes === "string" ? parsed.notes : undefined,
      },
    };
  } catch {
    return fallbackRanking(input.candidates);
  }
}

function fallbackRanking(
  candidates: ReferenceCandidate[],
): { ok: true; result: CurationResult } {
  const ranked = candidates.map((_, i) => i);
  return {
    ok: true,
    result: {
      picked: candidates.slice(0, DESIRED_TOP),
      rankedIndices: ranked,
      notes: "curation fallback: kept search order",
    },
  };
}
