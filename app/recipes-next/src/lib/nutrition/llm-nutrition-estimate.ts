/**
 * Last-resort approximate macros when CNF / USDA return no usable match.
 * Uses the same OPENAI_API_KEY as search assist; returns null when unavailable or invalid.
 */

import { isCountBasedUnit } from "./unit-basis";

export type IngredientNutritionEstimate = {
  kcalPer100g: number;
  fatPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  /** Typical edible grams for one “count” item when the pantry unit is piece-like. */
  gramsPerCountUnit: number | null;
  rationale: string | null;
};

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function pickNum(raw: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const v = num(raw[key]);
    if (v != null) return v;
  }
  return null;
}

/** Strip ```json fences and parse; models sometimes wrap JSON in markdown. */
function tryParseJsonObject(content: string): Record<string, unknown> | null {
  const trimmed = content.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```/im.exec(trimmed);
  const blob = fence?.[1]?.trim() ?? trimmed;
  for (const candidate of [blob, trimmed]) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Merge nested objects models sometimes return (`nutrition`, `per_100g`, etc.). */
function flattenPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const nested = raw.nutrition ?? raw.per_100g ?? raw.per_100gm ?? raw.values ?? raw.data;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return { ...raw, ...(nested as Record<string, unknown>) };
  }
  return raw;
}

function sanitizeEstimate(raw: Record<string, unknown>): IngredientNutritionEstimate | null {
  const flat = flattenPayload(raw);

  const kcalDirect = pickNum(flat, [
    "kcal_per_100g",
    "kcalPer100g",
    "calories_per_100g",
    "energy_kcal",
    "calories",
    "kcal",
    "energy",
  ]);
  const protein = pickNum(flat, [
    "protein_g_per_100g",
    "proteinPer100g",
    "protein_g",
    "protein",
    "proteins_g",
  ]);
  const fat = pickNum(flat, [
    "fat_g_per_100g",
    "fatPer100g",
    "fat_g",
    "fat",
    "total_fat_g",
    "total_fat",
  ]);
  const carbs = pickNum(flat, [
    "carbs_g_per_100g",
    "carbsPer100g",
    "carbohydrate_g",
    "carbohydrates_g",
    "carbs_g",
    "carbs",
    "carbohydrate",
    "total_carbohydrate_g",
  ]);

  if (protein == null || fat == null || carbs == null) return null;
  if (protein < 0 || fat < 0 || carbs < 0) return null;
  if (protein > 100 || fat > 100 || carbs > 100) return null;

  const p = round1(clamp(protein, 0, 100));
  const f = round1(clamp(fat, 0, 100));
  const c = round1(clamp(carbs, 0, 100));
  const fromMacros = round1(9 * f + 4 * p + 4 * c);

  let k: number;
  if (
    kcalDirect != null &&
    Number.isFinite(kcalDirect) &&
    kcalDirect >= 0 &&
    kcalDirect <= 950
  ) {
    k = round1(clamp(kcalDirect, 0, 950));
    if (
      fromMacros > 0 &&
      Math.abs(k - fromMacros) > Math.max(15, fromMacros * 0.35)
    ) {
      k = fromMacros;
    }
  } else {
    k = fromMacros;
  }

  if (!Number.isFinite(k) || k <= 0) return null;

  const merged = { ...raw, ...flat };
  const gRaw = pickNum(merged, [
    "grams_per_count_unit",
    "gramsPerCountUnit",
    "grams_per_piece",
  ]);
  let gramsPerCountUnit: number | null = null;
  if (gRaw != null && gRaw > 0 && gRaw < 5000) {
    gramsPerCountUnit = round1(gRaw);
  }

  const rationaleRaw = merged.rationale ?? merged.note;
  const rationale =
    rationaleRaw == null || rationaleRaw === ""
      ? null
      : String(rationaleRaw).slice(0, 600);

  return {
    kcalPer100g: k,
    fatPer100g: f,
    proteinPer100g: p,
    carbsPer100g: c,
    gramsPerCountUnit,
    rationale,
  };
}

/**
 * Ask the model for typical per-100g nutrition for a home-cooking ingredient.
 * Returns null without an API key, on HTTP failure, or when JSON is invalid.
 */
export async function ingredientNutritionLlmEstimate(input: {
  name: string;
  brand: string | null;
  stockUnit: string | null;
}): Promise<IngredientNutritionEstimate | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const name = input.name.trim();
  if (!name) return null;

  const countHint = isCountBasedUnit(input.stockUnit)
    ? `The user stocks this by count (unit: "${input.stockUnit ?? "count"}"). Include grams_per_count_unit: your best estimate of edible grams for one typical item (e.g. one medium bell pepper). Use null only if impossible.`
    : `Set grams_per_count_unit to null.`;

  const system = `You estimate typical nutritional content for home cooking when official database IDs are unavailable.
Return a single JSON object with:
- kcal_per_100g: number (kilocalories per 100 g edible portion)
- protein_g_per_100g, fat_g_per_100g, carbs_g_per_100g: numbers (grams per 100 g)
- grams_per_count_unit: number or null — ${countHint}
- rationale: one short sentence on what you assumed (e.g. raw vs cooked), or null

Rules:
- Use common retail / home-kitchen assumptions (e.g. bell pepper: raw, trimmed edible portion unless the name says cooked or dried).
- Numbers only — no ranges in numeric fields; pick one plausible central value.
- Keep macros consistent with energy (roughly 4·protein + 4·carbs + 9·fat ≈ kcal per 100 g, within ~15%).`;

  const user = JSON.stringify({
    name,
    brand: input.brand?.trim() || null,
    stock_unit: input.stockUnit,
  });

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.25,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return null;

    const parsed = tryParseJsonObject(raw);
    if (!parsed) return null;
    return sanitizeEstimate(parsed);
  } catch {
    return null;
  }
}
