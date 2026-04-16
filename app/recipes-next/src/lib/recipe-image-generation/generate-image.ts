/**
 * Generate a final recipe image using OpenAI `gpt-image-1`.
 *
 * The Creative Director (build-prompt.ts) has already produced a rich,
 * self-contained prompt. We append the hard constraints + negative list as
 * a belt-and-braces tail and send it to OpenAI's highest-quality image
 * endpoint at square 1024x1024, `quality: "high"`.
 */

import { hardConstraintsBlock, HOUSE_NEGATIVE_PROMPT } from "./art-direction";

const OPENAI_IMAGE_MODEL = "gpt-image-1";
const OPENAI_IMAGE_TIMEOUT_MS = 180_000;

export type GenerateImageInput = {
  /** The full prompt from the Creative Director. */
  prompt: string;
};

export type GenerateImageResult = {
  /** Raw bytes of the generated image. */
  bytes: Uint8Array;
  /** MIME type reported by the provider. */
  contentType: string;
  /** Which provider produced the image — useful for logs. */
  provider: "openai-gpt-image-1";
};

async function downloadBytes(
  url: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Image download failed: ${res.status}`);
  }
  const contentType = res.headers.get("content-type") ?? "image/png";
  const buf = await res.arrayBuffer();
  return { bytes: new Uint8Array(buf), contentType };
}

function buildFinalPrompt(directorPrompt: string): string {
  // Staple the hard constraints and the negative list onto whatever the
  // director wrote — the director already encodes them, but re-stating is
  // cheap insurance against the image model ignoring a line.
  return [
    directorPrompt.trim(),
    "",
    hardConstraintsBlock(),
    "",
    `Explicitly avoid: ${HOUSE_NEGATIVE_PROMPT.join(", ")}.`,
  ].join("\n");
}

type OpenAIImageResponse = {
  data?: { b64_json?: string; url?: string }[];
  error?: { message?: string };
};

export async function generateRecipeImage(
  input: GenerateImageInput,
): Promise<GenerateImageResult> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY is not set.");

  const prompt = buildFinalPrompt(input.prompt);

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_IMAGE_MODEL,
      prompt,
      size: "1024x1024",
      n: 1,
      quality: "high",
    }),
    signal: AbortSignal.timeout(OPENAI_IMAGE_TIMEOUT_MS),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `OpenAI images error (${res.status}): ${txt.slice(0, 300)}`,
    );
  }

  const data = (await res.json()) as OpenAIImageResponse;
  const first = data.data?.[0];
  if (!first) {
    throw new Error(data.error?.message ?? "OpenAI returned no image.");
  }

  if (first.b64_json) {
    const bin = Buffer.from(first.b64_json, "base64");
    return {
      bytes: new Uint8Array(bin),
      contentType: "image/png",
      provider: "openai-gpt-image-1",
    };
  }

  if (first.url) {
    const { bytes, contentType } = await downloadBytes(first.url);
    return {
      bytes,
      contentType,
      provider: "openai-gpt-image-1",
    };
  }

  throw new Error("OpenAI image payload had neither b64_json nor url.");
}
