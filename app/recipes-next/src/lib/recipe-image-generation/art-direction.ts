/**
 * Single source of truth for the kitchenOS recipe photo art direction.
 *
 * The goal of this block is to push the generator AWAY from the typical
 * "AI food" look (plastic highlights, cartoon sheen, over-saturated colour,
 * perfectly symmetric plating, studio gradient backgrounds) and TOWARD
 * real-camera food photography: natural light, shallow depth of field,
 * believable imperfections, honest colour.
 *
 * Edit this file to tune the house style — nothing else needs to change.
 */

export type VesselKind =
  | "bowl"
  | "plate"
  | "shallow-bowl"
  | "wide-plate"
  | "glass"
  | "mug"
  | "baking-dish"
  | "cutting-board"
  | "skillet";

export type ArtDirectionContext = {
  vessel: VesselKind;
  /** A short phrase to add to the vessel description, e.g. "matte stoneware". */
  vesselFinish?: string;
};

/**
 * The fixed technical + aesthetic block that every generation inherits.
 * Kept short on purpose — long prompts tend to make Flux drift.
 */
export const HOUSE_STYLE_BLOCK = [
  "Editorial food photography, 1:1 square crop.",
  "Natural window light from the side, soft diffused highlights, honest shadows.",
  "Shot on a 50mm prime lens at f/2.8, shallow depth of field, subject tack sharp and the background gently out of focus.",
  "Camera angle roughly 30 degrees above the table (three-quarter overhead), food takes up about 70% of the frame, a small amount of negative space.",
  "Neutral linen or light wood tabletop, one or two subtle unstyled props nearby (a folded napkin, a spoon, a small dish of salt) never crowding the hero.",
  "Colours natural and slightly muted — no over-saturation, no orange cast, no shiny plastic reflections.",
  "Appetising imperfection: a small drip, a few stray crumbs, irregular plating. Never symmetrical, never glossy, never cartoon.",
  "No text, no watermarks, no logos, no hands, no utensils mid-motion, no pack-shot product staging.",
].join(" ");

/**
 * Negative prompt shared across generations. Kept generic so we can feed it
 * to any provider that supports one (Flux does, gpt-image-1 does not).
 */
export const HOUSE_NEGATIVE_PROMPT = [
  "plastic",
  "artificial sheen",
  "oversaturated",
  "3d render",
  "cgi",
  "illustration",
  "cartoon",
  "stock photo watermark",
  "text overlay",
  "logos",
  "ai artifacts",
  "extra fingers",
  "warped utensils",
  "blurry subject",
  "harsh flash",
  "studio gradient background",
].join(", ");

const VESSEL_DESCRIPTION: Record<VesselKind, string> = {
  bowl: "served in a deep matte stoneware bowl",
  "shallow-bowl": "served in a wide shallow ceramic bowl",
  plate: "plated on a matte ceramic dinner plate",
  "wide-plate": "plated on a wide rimmed ceramic plate",
  glass: "served in a simple clear drinking glass",
  mug: "served in a plain ceramic mug",
  "baking-dish": "still in a well-loved ceramic baking dish",
  "cutting-board": "resting on a worn wooden cutting board",
  skillet: "still in a cast iron skillet",
};

export function describeVessel(ctx: ArtDirectionContext): string {
  const base = VESSEL_DESCRIPTION[ctx.vessel];
  const finish = ctx.vesselFinish?.trim();
  if (!finish) return base;
  return `${base} (${finish})`;
}

/**
 * Default fallback when vessel inference fails or is skipped.
 * A matte stoneware bowl works for ~80% of dishes without looking wrong.
 */
export const DEFAULT_VESSEL: VesselKind = "shallow-bowl";
