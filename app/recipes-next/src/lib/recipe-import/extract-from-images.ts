/**
 * Extract recipe text from one or more images using GPT-4o vision.
 * Accepts base64-encoded images (data URIs). Returns the combined extracted text.
 */

const VISION_MODEL = "gpt-4o";
const VISION_TIMEOUT_MS = 60_000;

type ImageInput = {
  base64DataUrl: string;
};

type ExtractOptions = {
  userText?: string;
};

export async function extractRecipeTextFromImages(
  images: ImageInput[],
  options: ExtractOptions = {},
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

  const userText = options.userText?.trim() ?? "";

  const imageContent = images.map((img) => ({
    type: "image_url" as const,
    image_url: { url: img.base64DataUrl, detail: "high" as const },
  }));

  const userIntro =
    images.length === 1
      ? "Extract all recipe information from this image."
      : "Extract all recipe information from these images.";

  const userBlocks: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "high" } }
  > = [
    {
      type: "text" as const,
      text: userIntro,
    },
  ];

  if (userText) {
    userBlocks.push({
      type: "text" as const,
      text: `The user also added these notes or instructions. Treat them as primary intent — use them to disambiguate the image(s), fill gaps, and override anything in the image(s) that contradicts them:\n\n"""\n${userText}\n"""`,
    });
  }

  userBlocks.push(...imageContent);

  const messages = [
    {
      role: "system" as const,
      content: `You extract recipe information from images and any accompanying user notes. The images may be screenshots of recipe websites, photos of handwritten recipes, cookbook pages, food photos, or anything containing recipe information. The user may also provide their own notes, tweaks, or a full description of the recipe they want.

Extract ALL recipe information you can see, combined with what the user says:
- Recipe title (preserve any subordinate qualifier such as "… with Brown Butter")
- Headnote / editorial intro paragraph if the source has one
- Yield line ("Serves 4", "Makes 12 cookies", etc.) — keep the exact wording and any ranges
- Ingredients list (with amounts, units, AND preparation states intact — e.g. "2 tbsp olive oil, divided", "1 small onion, finely chopped")
- Instructions/steps
- Any note/variation/storage/substitution block from the author — reproduce the header/label if present
- Prep time, cook time if visible
- Source attribution / URL if visible

If the user's notes conflict with the image, the user's notes win.
If the user provides content the image doesn't (e.g. a recipe idea with no source image), synthesize a sensible recipe from their notes and use the image(s) only as visual reference.

Output the extracted content as clean, structured plain text. Use clear headings like "Title:", "Headnote:", "Yield:", "Ingredients:", "Instructions:", "Note:" (or "Variation:", "Storage:", "Substitution:"). For ingredients, put each on its own line and keep preparation phrases after a comma. For instructions, number each step starting at 1.`,
    },
    {
      role: "user" as const,
      content: userBlocks,
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
