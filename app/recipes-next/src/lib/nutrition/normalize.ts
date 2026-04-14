/**
 * Ingredient name normalisation and generic-vs-branded classification.
 */

const FILLER_WORDS = new Set([
  "organic",
  "natural",
  "fresh",
  "frozen",
  "dried",
  "raw",
  "cooked",
  "canned",
  "whole",
  "chopped",
  "diced",
  "sliced",
  "minced",
  "grated",
  "ground",
  "crushed",
  "powdered",
  "packed",
  "unpacked",
  "peeled",
  "unpeeled",
  "boneless",
  "skinless",
]);

const COMMON_BRANDS = new Set([
  "heinz",
  "kraft",
  "del monte",
  "campbells",
  "kelloggs",
  "nestle",
  "general mills",
  "quaker",
  "barilla",
  "classico",
  "hunts",
  "philadelphia",
  "hellmanns",
  "best foods",
  "jif",
  "skippy",
  "smuckers",
  "ocean spray",
  "dole",
  "chobani",
  "fage",
  "oikos",
  "silk",
  "almond breeze",
  "oatly",
  "beyond meat",
  "impossible",
  "tyson",
  "perdue",
  "oscar mayer",
  "hormel",
  "presidents choice",
  "president's choice",
  "pc blue menu",
  "no name",
  "great value",
  "kirkland",
]);

/**
 * Lower-case, strip parenthetical notes, collapse whitespace.
 */
export function normalizeIngredientName(raw: string): string {
  let name = raw.trim().toLowerCase();
  name = name.replace(/\([^)]*\)/g, "").trim();
  name = name.replace(/,\s*$/, "");
  name = name.replace(/\s+/g, " ").trim();
  return name;
}

/**
 * Decide whether to search branded or generic nutrition databases.
 */
export function classifyIngredient(
  name: string,
  brand: string | null,
): "generic" | "branded" {
  if (brand && brand.trim() !== "") return "branded";

  const lower = name.toLowerCase();
  for (const b of COMMON_BRANDS) {
    if (lower.includes(b)) return "branded";
  }

  return "generic";
}

/**
 * Drop filler adjectives that confuse food-database search engines
 * while keeping the essential noun phrase.
 */
export function buildSearchQuery(normalized: string): string {
  const tokens = normalized.split(/\s+/);
  const kept = tokens.filter((t) => !FILLER_WORDS.has(t));
  return (kept.length > 0 ? kept : tokens).join(" ");
}
