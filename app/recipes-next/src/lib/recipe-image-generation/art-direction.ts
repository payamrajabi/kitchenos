/**
 * House rules for kitchenOS recipe photos.
 *
 * These are the non-negotiables that appear in every generation prompt
 * regardless of what scene the Creative Director model invents.
 *
 * The goal is to push the generator AWAY from the typical "AI food" look
 * (plastic highlights, cartoon sheen, over-saturated colour, perfectly
 * symmetric plating, studio gradient backgrounds) and TOWARD real-camera
 * food photography: natural light, shallow depth of field, believable
 * imperfections, honest colour.
 *
 * Edit this file to tune the locked-in constraints. Creative choices
 * (vessel, lighting mood, setting, framing) are made by the Creative
 * Director in build-prompt.ts.
 */

/**
 * Hard constraints. The Creative Director is told to respect every one
 * of these, and the orchestrator also appends them to the final prompt
 * verbatim as a safety net.
 */
export const HARD_CONSTRAINTS: string[] = [
  "Square 1:1 composition at 1024x1024.",
  "Shot on a full-frame camera with a 50-85mm prime lens at f/1.2 to f/2.8 — shallow depth of field, subject tack-sharp, background softly out of focus.",
  "Natural-looking light only (window light, morning, afternoon, golden hour, overcast daylight, candle, low bar light). Never ring flash, never a studio gradient, never product-shot rim lighting.",
  "The food is the undisputed visual hero of the frame.",
  "The image must look like an unretouched real photograph taken by a skilled photographer — imperfect, honest, slightly muted colour, natural shadows.",
];

/**
 * Everything we explicitly do not want, phrased as a negative list that we
 * append to the positive prompt. gpt-image-1 doesn't support a separate
 * negative prompt field, so these are folded into the positive prompt.
 */
export const HOUSE_NEGATIVE_PROMPT: string[] = [
  "no text",
  "no watermarks",
  "no logos",
  "no hands in mid-motion",
  "no floating utensils",
  "no 3D render, no CGI, no illustration, no cartoon",
  "no plastic sheen",
  "no artificial oversaturation",
  "no stock photo watermark",
  "no studio gradient background",
  "no harsh flash or ring light",
  "no warped cutlery or extra fingers",
  "no AI artefacts",
];

/**
 * A short human-readable string of the constraints, appended to every prompt
 * as a tail. Kept concise so it doesn't dilute the creative body.
 */
export function hardConstraintsBlock(): string {
  return [
    "HARD CONSTRAINTS (must all be true in the final image):",
    ...HARD_CONSTRAINTS.map((c) => `• ${c}`),
    `Explicit avoid list: ${HOUSE_NEGATIVE_PROMPT.join(", ")}.`,
  ].join("\n");
}
