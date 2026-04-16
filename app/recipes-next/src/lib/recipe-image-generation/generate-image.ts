/**
 * Generate a final recipe image.
 *
 * Primary path: Flux Kontext Max via Black Forest Labs' own API —
 * accepts up to 4 reference images alongside the text prompt and
 * currently produces the most "camera-real" food output.
 *
 * Fallback: OpenAI `gpt-image-1` via the images/generations endpoint.
 * Text-only (no refs) — less faithful but a useful safety net when BFL
 * is unavailable or the primary call fails repeatedly.
 */

import { HOUSE_NEGATIVE_PROMPT } from "./art-direction";

const BFL_ENDPOINT = "https://api.bfl.ai/v1/flux-kontext-max";
const BFL_SUBMIT_TIMEOUT_MS = 20_000;
const BFL_POLL_INTERVAL_MS = 2_000;
const BFL_TOTAL_TIMEOUT_MS = 120_000;

const OPENAI_IMAGE_MODEL = "gpt-image-1";
const OPENAI_IMAGE_TIMEOUT_MS = 120_000;

export type GenerateImageInput = {
  prompt: string;
  /** Up to 4 publicly-reachable reference image URLs. */
  referenceImageUrls: string[];
  /** Optional seed for reproducibility / re-rolls. */
  seed?: number;
};

export type GenerateImageResult = {
  /** Raw bytes of the generated image (PNG or JPEG). */
  bytes: Uint8Array;
  /** MIME type reported by the provider. */
  contentType: string;
  /** Which provider actually produced the image. */
  provider: "bfl-flux-kontext-max" | "openai-gpt-image-1";
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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

/**
 * BFL's Kontext endpoints accept each reference image as either a public URL
 * or a bare base64 string (no `data:...` prefix). Google Images URLs sometimes
 * 403 when fetched from a data centre, so we pre-download and base64-encode
 * every reference — this also removes a class of "URL was fine from the home
 * network but the provider couldn't reach it" failures.
 */
async function urlToBase64(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; kitchenOS recipe-image-pipeline/1.0)",
      Accept: "image/*,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Reference download failed (${res.status}) for ${url}`);
  }
  const buf = await res.arrayBuffer();
  return Buffer.from(buf).toString("base64");
}

/* ---------------------------------------------------------------- */
/*  Primary: Flux Kontext Max via Black Forest Labs direct          */
/* ---------------------------------------------------------------- */

type BflSubmitResponse = {
  id?: string;
  polling_url?: string;
  error?: string;
};

type BflPollResponse = {
  status?:
    | "Ready"
    | "Pending"
    | "Request Moderated"
    | "Content Moderated"
    | "Error"
    | "Task not found"
    | string;
  result?: { sample?: string };
  error?: string;
};

async function generateWithBfl(
  input: GenerateImageInput,
): Promise<GenerateImageResult> {
  const key = process.env.BFL_API_KEY?.trim();
  if (!key) throw new Error("BFL_API_KEY is not set.");

  // Download and base64-encode every reference up front; fail fast if any
  // reference is unreachable so we can fall back to text-only generation.
  const refs = input.referenceImageUrls.slice(0, 4);
  const refBase64: string[] = [];
  for (const url of refs) {
    try {
      refBase64.push(await urlToBase64(url));
    } catch (err) {
      console.warn("[recipe-image] skipping unreachable reference", url, err);
    }
  }

  const body: Record<string, unknown> = {
    prompt: input.prompt,
    aspect_ratio: "1:1",
    output_format: "png",
    safety_tolerance: 2,
    prompt_upsampling: false,
  };
  if (refBase64[0]) body.input_image = refBase64[0];
  if (refBase64[1]) body.input_image_2 = refBase64[1];
  if (refBase64[2]) body.input_image_3 = refBase64[2];
  if (refBase64[3]) body.input_image_4 = refBase64[3];
  if (input.seed != null) body.seed = input.seed;

  const submitRes = await fetch(BFL_ENDPOINT, {
    method: "POST",
    headers: {
      "x-key": key,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(BFL_SUBMIT_TIMEOUT_MS),
  });
  if (!submitRes.ok) {
    const txt = await submitRes.text().catch(() => "");
    throw new Error(
      `BFL submit failed (${submitRes.status}): ${txt.slice(0, 200)}`,
    );
  }
  const submit = (await submitRes.json()) as BflSubmitResponse;
  const pollUrl = submit.polling_url;
  if (!pollUrl) {
    throw new Error(
      submit.error ?? "BFL submit response missing polling_url.",
    );
  }

  const started = Date.now();
  let sampleUrl: string | null = null;
  while (Date.now() - started < BFL_TOTAL_TIMEOUT_MS) {
    await sleep(BFL_POLL_INTERVAL_MS);
    const pollRes = await fetch(pollUrl, {
      headers: { "x-key": key, Accept: "application/json" },
    });
    if (!pollRes.ok) continue;
    const poll = (await pollRes.json()) as BflPollResponse;
    const status = poll.status ?? "";
    if (status === "Ready") {
      sampleUrl = poll.result?.sample ?? null;
      break;
    }
    if (
      status === "Error" ||
      status === "Request Moderated" ||
      status === "Content Moderated" ||
      status === "Task not found"
    ) {
      throw new Error(
        `BFL generation failed: ${status}${poll.error ? ` (${poll.error})` : ""}`,
      );
    }
    // "Pending" or any transient — keep polling.
  }
  if (!sampleUrl) {
    throw new Error("BFL generation timed out.");
  }

  const { bytes, contentType } = await downloadBytes(sampleUrl);
  return {
    bytes,
    contentType,
    provider: "bfl-flux-kontext-max",
  };
}

/* ---------------------------------------------------------------- */
/*  Fallback: OpenAI gpt-image-1 (text-only, no refs)               */
/* ---------------------------------------------------------------- */

type OpenAIImageResponse = {
  data?: { b64_json?: string; url?: string }[];
  error?: { message?: string };
};

async function generateWithOpenAI(
  input: GenerateImageInput,
): Promise<GenerateImageResult> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY is not set.");

  // gpt-image-1 doesn't accept a negative prompt — bake the rejections into the
  // positive prompt instead so we still get a push away from "plastic AI" tells.
  const prompt = [
    input.prompt,
    `Avoid: ${HOUSE_NEGATIVE_PROMPT}.`,
  ].join("\n\n");

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
    throw new Error(`OpenAI images error (${res.status}): ${txt.slice(0, 200)}`);
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

/* ---------------------------------------------------------------- */
/*  Public entry                                                    */
/* ---------------------------------------------------------------- */

export async function generateRecipeImage(
  input: GenerateImageInput,
): Promise<GenerateImageResult> {
  const hasBfl = Boolean(process.env.BFL_API_KEY?.trim());

  if (hasBfl) {
    try {
      return await generateWithBfl(input);
    } catch (err) {
      console.warn(
        "[recipe-image] Flux Kontext Max (BFL) failed, falling back to gpt-image-1",
        err,
      );
    }
  }
  return generateWithOpenAI(input);
}
