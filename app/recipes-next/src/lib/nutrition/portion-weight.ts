/**
 * Pick a representative edible gram weight from USDA FDC foodPortions.
 * Used only for count-based inventory — macros always remain per 100 g from APIs.
 */

export type FdcPortionLike = {
  /** Omitted on some FDC payloads; callers treat missing as unusable. */
  gramWeight?: number | null;
  modifier?: string | null;
  portionDescription?: string | null;
  measureUnit?: string | null;
};

/**
 * Prefer whole-item / common household portions (egg, fruit, piece) over bulk weights.
 */
export function pickEdibleGramWeightFromPortions(
  portions: FdcPortionLike[],
  hints: { normalizedName: string },
): number | null {
  const nameTokens = hints.normalizedName.split(/\s+/).filter(Boolean);
  const valid = portions
    .map((p) => ({
      g:
        typeof p.gramWeight === "number" && Number.isFinite(p.gramWeight)
          ? p.gramWeight
          : null,
      text: `${p.modifier ?? ""} ${p.portionDescription ?? ""} ${p.measureUnit ?? ""}`.toLowerCase(),
    }))
    .filter((x): x is { g: number; text: string } => x.g != null && x.g > 0 && x.g < 10_000);

  if (valid.length === 0) return null;

  const tokenHit = valid.find((x) =>
    nameTokens.some((t) => t.length > 2 && x.text.includes(t)),
  );

  const prefer = (re: RegExp) =>
    valid.find((x) => re.test(x.text))?.g ?? null;

  const ranked =
    tokenHit?.g ??
    prefer(/\b(whole|1\s|one\s|large|medium|small)\b/) ??
    prefer(/\b(egg|slice|piece|fruit|stalk|clove)\b/) ??
    valid.find((x) => x.g >= 5 && x.g <= 500)?.g ??
    valid[0]?.g;

  return ranked != null ? Math.round(ranked * 10) / 10 : null;
}
