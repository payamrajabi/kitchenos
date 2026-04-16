const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 0.5,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 0.25,
  "¾": 0.75,
  "⅕": 0.2,
  "⅖": 0.4,
  "⅗": 0.6,
  "⅘": 0.8,
  "⅙": 1 / 6,
  "⅚": 5 / 6,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};

/**
 * Parse a recipe amount string into a numeric value.
 * Handles integers ("2"), decimals ("1.5"), simple fractions ("1/2"),
 * mixed numbers ("1 1/2"), and unicode fraction characters ("1½").
 * Returns null if the string can't be parsed.
 */
export function parseAmount(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (!s) return null;

  for (const [char, val] of Object.entries(UNICODE_FRACTIONS)) {
    if (s.includes(char)) {
      const before = s.slice(0, s.indexOf(char)).trim();
      const whole = before ? Number(before) : 0;
      if (!Number.isFinite(whole)) return null;
      return whole + val;
    }
  }

  const mixedMatch = s.match(/^(\d+(?:\.\d+)?)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixedMatch) {
    const whole = Number(mixedMatch[1]);
    const num = Number(mixedMatch[2]);
    const den = Number(mixedMatch[3]);
    if (den === 0) return null;
    return whole + num / den;
  }

  const fractionMatch = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fractionMatch) {
    const num = Number(fractionMatch[1]);
    const den = Number(fractionMatch[2]);
    if (den === 0) return null;
    return num / den;
  }

  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Format a numeric amount for display, rounding to a clean decimal. */
export function formatAmount(n: number): string {
  if (Number.isInteger(n)) return String(n);
  const rounded = Math.round(n * 100) / 100;
  return String(rounded);
}

const DECIMAL_TO_UNICODE: [number, string][] = [
  [0.125, "⅛"],
  [0.25, "¼"],
  [0.333, "⅓"],
  [0.375, "⅜"],
  [0.4, "⅖"],
  [0.5, "½"],
  [0.6, "⅗"],
  [0.625, "⅝"],
  [0.666, "⅔"],
  [0.75, "¾"],
  [0.8, "⅘"],
  [0.833, "⅚"],
  [0.875, "⅞"],
];

const FRACTION_TOLERANCE = 0.015;

/**
 * Pretty-print an amount string using Unicode fractions when possible.
 * "0.5" → "½", "1.5" → "1½", "0.25" → "¼", "3" → "3".
 * Falls back to the original string if no clean fraction matches.
 */
export function displayAmount(raw: string | null | undefined): string {
  if (raw == null) return "";
  const s = raw.trim();
  if (!s) return "";

  const n = parseAmount(s);
  if (n == null) return s;

  if (Number.isInteger(n)) return String(n);

  const whole = Math.floor(n);
  const frac = n - whole;

  for (const [decimal, glyph] of DECIMAL_TO_UNICODE) {
    if (Math.abs(frac - decimal) < FRACTION_TOLERANCE) {
      return whole > 0 ? `${whole}${glyph}` : glyph;
    }
  }

  return formatAmount(n);
}
