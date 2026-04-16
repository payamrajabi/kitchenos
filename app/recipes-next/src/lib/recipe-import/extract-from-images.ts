/**
 * Extract recipe text from one or more images using GPT-4o vision.
 * Accepts base64-encoded images (data URIs). Returns the combined extracted text.
 */

const VISION_MODEL = "gpt-4o";
const VISION_TIMEOUT_MS = 60_000;

type ImageInput = {
  base64DataUrl: string;
};

export async function extractRecipeTextFromImages(
  images: ImageInput[],
): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error:
        "OPENAI_API_KEY is not set. Add it to .env.local to enable image import.",
    };
  }

  if (!images.length) {
    return { ok: false, error: "No images provided." };
  }

  const imageContent = images.map((img) => ({
    type: "image_url" as const,
    image_url: { url: img.base64DataUrl, detail: "high" as const },
  }));

  const messages = [
    {
      role: "system" as const,
      content: `You extract recipe information from images. The image may be a screenshot of a recipe website, a photo of a handwritten recipe, a cookbook page, or anything containing recipe information.

Extract ALL recipe information you can see:
- Recipe name/title
- Ingredients list (with amounts and units when visible)
- Instructions/steps
- Any notes, tips, or commentary from the author
- Servings, prep time, cook time if visible
- Source attribution if visible

Output the extracted content as clean, structured plain text. Use clear headings like "Title:", "Ingredients:", "Instructions:", "Notes:" to organize the information. For ingredients, put each on its own line. For instructions, number each step.`,
    },
    {
      role: "user" as const,
      content: [
        {
          type: "text" as const,
          text: `Extract all recipe information from ${images.length === 1 ? "this image" : "these images"}.`,
        },
        ...imageContent,
      ],
    },
  ];

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages,
        max_tokens: 4000,
      }),
      signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
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
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return { ok: false, error: "No text extracted from images." };
    }
    return { ok: true, content };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Image extraction failed.";
    return { ok: false, error: message };
  }
}
