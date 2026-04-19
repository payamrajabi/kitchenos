import { parseAmount } from "@/lib/parse-amount";

/**
 * Display + conversion helpers for the recipe ingredients table's "Original /
 * Grams" toggle.
 *
 * Two rendering modes live here:
 *
 * 1. "Original" — render the authored amount in its authored unit, but only use
 *    Unicode fractions for cup/tsp/tbsp. Everything else gets decimal rounded
 *    to the nearest tenth.
 * 2. "Grams"    — convert the amount into grams using the unit type (mass or
 *    volume) and the ingredient's apparent density (g/ml). When the conversion
 *    can't be done cleanly (e.g. count-based units, or a volume unit with no
 *    density on the ingredient), callers fall back to the "Original" render.
 */

// Canonical volume factors (US cooking measures).
// We deliberately use the US customary tsp/tbsp/cup values that cookbooks
// assume — not metric tsp/tbsp — because these are the values that match how
// authors tend to write recipes and what readers expect.
const ML_PER_UNIT: Record<string, number> = {
  ml: 1,
  l: 1000,
  tsp: 4.92892,
  tbsp: 14.7868,
  cup: 240,
  "fl oz": 29.5735,
};

const GRAMS_PER_MASS_UNIT: Record<string, number> = {
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
};

// Unit labels that mean "so little / so vague it shouldn't be shown as grams".
// Multiplying `pinch × density` or `pinch × piece-weight` would produce nonsense.
const NON_GRAM_COUNT_UNITS = new Set([
  "pinch",
  "dash",
  "splash",
  "handful",
  "to taste",
]);

const FRACTION_DISPLAY_UNITS = new Set(["cup", "tsp", "tbsp"]);

const DECIMAL_TO_UNICODE: [number, string][] = [
  [0.125, "⅛"],
  [0.25, "¼"],
  [1 / 3, "⅓"],
  [0.375, "⅜"],
  [0.4, "⅖"],
  [0.5, "½"],
  [0.6, "⅗"],
  [0.625, "⅝"],
  [2 / 3, "⅔"],
  [0.75, "¾"],
  [0.8, "⅘"],
  [5 / 6, "⅚"],
  [0.875, "⅞"],
];

const FRACTION_TOLERANCE = 0.015;

function normUnit(unit: string | null | undefined): string {
  return (unit ?? "").trim().toLowerCase();
}

/** True for units we render with pretty fractions (cup, tsp, tbsp). */
export function unitUsesFractionDisplay(unit: string | null | undefined): boolean {
  return FRACTION_DISPLAY_UNITS.has(normUnit(unit));
}

/** Round to the nearest tenth, drop trailing ".0" for integers. */
function roundToTenth(n: number): number {
  return Math.round(n * 10) / 10;
}

function formatTenth(n: number): string {
  const r = roundToTenth(n);
  if (Number.isInteger(r)) return String(r);
  return r.toFixed(1);
}

/** Render a positive number as `½`, `1½`, etc. when it matches a clean fraction. */
function formatAsFraction(n: number): string | null {
  if (Number.isInteger(n)) return String(n);
  const whole = Math.floor(n);
  const frac = n - whole;
  for (const [decimal, glyph] of DECIMAL_TO_UNICODE) {
    if (Math.abs(frac - decimal) < FRACTION_TOLERANCE) {
      return whole > 0 ? `${whole}${glyph}` : glyph;
    }
  }
  return null;
}

/**
 * Render an authored amount + unit in "Original" mode. Fractions for cup/tsp/
 * tbsp; decimals rounded to the nearest tenth for everything else. Ranges
 * like `2-3` stay as ranges.
 */
export function displayAmountForUnit(
  raw: string | null | undefined,
  unit: string | null | undefined,
  scale = 1,
): string {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";

  const rangeMatch = s.match(
    /^(\S+(?:\s+\d+\s*\/\s*\d+)?)\s*(?:to|-|–|—)\s*(\S+(?:\s+\d+\s*\/\s*\d+)?)$/i,
  );
  if (rangeMatch) {
    const low = displayAmountForUnit(rangeMatch[1], unit, scale);
    const high = displayAmountForUnit(rangeMatch[2], unit, scale);
    return `${low}\u2013${high}`;
  }

  const n = parseAmount(s);
  if (n == null) return s;

  const scaled = Number.isFinite(scale) && scale > 0 ? n * scale : n;

  if (unitUsesFractionDisplay(unit)) {
    const frac = formatAsFraction(scaled);
    if (frac != null) return frac;
    return formatTenth(scaled);
  }

  return formatTenth(scaled);
}

export type GramConversionResult =
  | { kind: "converted"; grams: number }
  | { kind: "unsupported" };

/**
 * Convert an amount + unit pair to grams.
 *
 * - Mass units (g/kg/oz/lb) always convert.
 * - Volume units (ml/l/tsp/tbsp/cup/fl oz) convert when the ingredient has a
 *   density set; otherwise "unsupported".
 * - Count / descriptive units (piece, clove, slice, "3 eggs", empty unit, …)
 *   convert when the ingredient has a canonical piece weight
 *   (`canonicalUnitWeightG`) from the backbone catalogue — so "3 eggs" can be
 *   rendered as ~150 g. A small allow-list of vague units (`pinch`, `dash`,
 *   `to taste`, …) stays unsupported on purpose.
 */
export function convertAmountToGrams(
  amountNum: number,
  unit: string | null | undefined,
  densityGPerMl: number | null | undefined,
  canonicalUnitWeightG?: number | null,
): GramConversionResult {
  if (!Number.isFinite(amountNum) || amountNum < 0) {
    return { kind: "unsupported" };
  }
  const u = normUnit(unit);
  if (u in GRAMS_PER_MASS_UNIT) {
    return { kind: "converted", grams: amountNum * GRAMS_PER_MASS_UNIT[u] };
  }
  if (u in ML_PER_UNIT) {
    if (
      typeof densityGPerMl === "number" &&
      Number.isFinite(densityGPerMl) &&
      densityGPerMl > 0
    ) {
      return {
        kind: "converted",
        grams: amountNum * ML_PER_UNIT[u] * densityGPerMl,
      };
    }
    return { kind: "unsupported" };
  }
  if (NON_GRAM_COUNT_UNITS.has(u)) {
    return { kind: "unsupported" };
  }
  if (
    typeof canonicalUnitWeightG === "number" &&
    Number.isFinite(canonicalUnitWeightG) &&
    canonicalUnitWeightG > 0
  ) {
    return { kind: "converted", grams: amountNum * canonicalUnitWeightG };
  }
  return { kind: "unsupported" };
}

/**
 * Format a gram weight for display. Uses kg (rounded to the nearest tenth)
 * when the value is ≥ 1000 g, otherwise grams rounded to the nearest whole
 * gram — sub-gram precision is noise for cooking.
 */
export function formatGramsDisplay(grams: number): {
  amount: string;
  unit: "g" | "kg";
} {
  if (!Number.isFinite(grams) || grams < 0) {
    return { amount: "0", unit: "g" };
  }
  if (grams >= 1000) {
    return { amount: formatTenth(grams / 1000), unit: "kg" };
  }
  return { amount: String(Math.round(grams)), unit: "g" };
}

/**
 * Render an amount + unit pair in "Grams" mode, including scaling for the
 * servings stepper. Returns `null` when no clean gram value can be produced,
 * so the caller can fall back to the authored units.
 *
 * Handles ranges like `2-3 tbsp` or `25-30 g` by converting each endpoint
 * individually; if one side fails to convert, the whole thing is reported as
 * unsupported.
 */
export function displayAmountInGrams(
  raw: string | null | undefined,
  unit: string | null | undefined,
  densityGPerMl: number | null | undefined,
  scale = 1,
  canonicalUnitWeightG?: number | null,
): { amount: string; unit: "g" | "kg" } | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const rangeMatch = s.match(
    /^(\S+(?:\s+\d+\s*\/\s*\d+)?)\s*(?:to|-|–|—)\s*(\S+(?:\s+\d+\s*\/\s*\d+)?)$/i,
  );
  if (rangeMatch) {
    const low = displayAmountInGrams(
      rangeMatch[1],
      unit,
      densityGPerMl,
      scale,
      canonicalUnitWeightG,
    );
    const high = displayAmountInGrams(
      rangeMatch[2],
      unit,
      densityGPerMl,
      scale,
      canonicalUnitWeightG,
    );
    if (!low || !high) return null;
    // When the endpoints land on different display units (e.g. 900 g – 1.1 kg)
    // keep them both in grams for clarity — readers expect a consistent unit
    // inside a range.
    if (low.unit !== high.unit) {
      const lowG = low.unit === "kg" ? Number(low.amount) * 1000 : Number(low.amount);
      const highG = high.unit === "kg" ? Number(high.amount) * 1000 : Number(high.amount);
      return {
        amount: `${Math.round(lowG)}\u2013${Math.round(highG)}`,
        unit: "g",
      };
    }
    return {
      amount: `${low.amount}\u2013${high.amount}`,
      unit: low.unit,
    };
  }

  const n = parseAmount(s);
  if (n == null) return null;
  const scaled = Number.isFinite(scale) && scale > 0 ? n * scale : n;
  const result = convertAmountToGrams(scaled, unit, densityGPerMl, canonicalUnitWeightG);
  if (result.kind !== "converted") return null;
  return formatGramsDisplay(result.grams);
}
