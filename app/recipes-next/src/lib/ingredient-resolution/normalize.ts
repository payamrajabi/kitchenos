/**
 * Deterministic ingredient-name normalization (Stage 1 of resolution).
 *
 * Handles: case, whitespace, hyphens, basic plurals, common prefixes
 * like "fresh" / "organic", and embedded package sizes ("14oz").
 *
 * This is the fast path — no network calls, no LLM.
 */

/**
 * Strip leading qualifiers that don't change the identity of an ingredient.
 * Order matters: longer phrases first to avoid partial matches.
 */
const STRIP_PREFIXES = [
  "raw ",
  "fresh ",
  "organic ",
  "all natural ",
  "natural ",
  "free range ",
  "free-range ",
  "cage free ",
  "cage-free ",
  "grass fed ",
  "grass-fed ",
  "low fat ",
  "low-fat ",
  "nonfat ",
  "non-fat ",
  "reduced fat ",
  "reduced-fat ",
  "fat free ",
  "fat-free ",
  "sugar free ",
  "sugar-free ",
  "gluten free ",
  "gluten-free ",
  "whole grain ",
  "whole-grain ",
];

/**
 * Embedded package sizes that should be stripped from names.
 * Matches patterns like "14oz", "400 ml", "28-oz", "1.5 kg".
 */
const PACKAGE_SIZE_RE = /\b\d+(?:\.\d+)?[\s-]?(?:oz|fl\s*oz|ml|l|g|kg|lb|ct|pk|pack)\b/gi;

/**
 * Basic English de-pluralisation — not comprehensive, but covers
 * the ingredient names that matter: "tomatoes" → "tomato",
 * "berries" → "berry", "leaves" → "leaf", "eggs" → "egg".
 */
function singularize(word: string): string {
  if (word.length < 3) return word;
  if (word.endsWith("ies") && word.length > 4) {
    return word.slice(0, -3) + "y";
  }
  if (word.endsWith("ves")) {
    return word.slice(0, -3) + "f";
  }
  if (
    word.endsWith("ses") ||
    word.endsWith("shes") ||
    word.endsWith("ches") ||
    word.endsWith("xes") ||
    word.endsWith("zes")
  ) {
    return word.slice(0, -2);
  }
  if (word.endsWith("oes") && word.length > 4) {
    return word.slice(0, -2);
  }
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Transliterate accented Latin characters to ASCII equivalents.
 * Uses Unicode NFD decomposition: "ñ" → "n\u0303" → strip combining marks → "n".
 * Preserves the base letter so "jalapeño" → "jalapeno", "crème" → "creme".
 */
function toAscii(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Produce a normalized key for matching.
 *
 * Two ingredient names that normalise to the same key are considered
 * the same ingredient (deterministic match, no LLM needed).
 *
 * Transformations applied:
 * 1. Lowercase
 * 2. Replace hyphens with spaces
 * 3. Strip embedded package sizes ("14oz", "400 ml")
 * 4. Strip known-irrelevant prefixes ("fresh", "organic")
 * 5. Transliterate accented characters to ASCII (ñ→n, é→e, ü→u)
 * 6. Drop remaining non-alphanumeric characters
 * 7. Collapse whitespace
 * 8. Singularise each word
 * 9. Sort words alphabetically (so "red bell pepper" = "bell pepper red")
 *
 * Step 9 is aggressive — it means word order doesn't matter.
 * This is fine for matching but we never display the normalised key.
 */
export function normalizeForMatch(name: string): string {
  let s = name.toLowerCase().trim();
  s = s.replace(/-/g, " ");
  s = s.replace(PACKAGE_SIZE_RE, " ");

  for (const prefix of STRIP_PREFIXES) {
    if (s.startsWith(prefix)) {
      s = s.slice(prefix.length);
    }
  }

  s = toAscii(s);
  s = s.replace(/[^a-z0-9\s]/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  const words = s.split(" ").map(singularize);
  words.sort();
  return words.join(" ");
}

/**
 * Clean up a display name without changing its identity.
 * Strips package sizes and trims whitespace but preserves case and word order.
 */
export function cleanDisplayName(name: string): string {
  let s = name.trim();
  s = s.replace(PACKAGE_SIZE_RE, "").trim();
  s = s.replace(/\s+/g, " ");
  return s;
}

/**
 * Words that stay lowercase in AP-style title case (unless they're the
 * first word). Short prepositions, articles, and conjunctions.
 */
const AP_LOWERCASE = new Set([
  "a", "an", "the",
  "and", "but", "or", "nor", "for", "yet", "so",
  "of", "in", "to", "on", "at", "by", "with", "from", "as", "per",
  "vs",
]);

/**
 * Convert an ingredient name to AP-style Title Case.
 *
 * - First word is always capitalised
 * - Short articles / prepositions / conjunctions stay lowercase
 * - Everything else gets an initial capital
 */
export function toTitleCaseAP(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;

  return trimmed
    .split(" ")
    .map((word, idx) => {
      if (idx === 0) return capitalizeWord(word);
      if (AP_LOWERCASE.has(word.toLowerCase())) return word.toLowerCase();
      return capitalizeWord(word);
    })
    .join(" ");
}

function capitalizeWord(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Stage 1: match each recipe ingredient name against the user's inventory
 * using deterministic normalisation.
 *
 * Returns a Map from recipe ingredient name → matched inventory ingredient id,
 * only for names that matched. Names not in the returned map need Stage 2 (LLM).
 */
export function deterministicMatch(
  recipeNames: string[],
  inventory: { id: number; name: string }[],
): Map<string, { id: number; name: string }> {
  const indexByKey = new Map<string, { id: number; name: string }>();
  for (const item of inventory) {
    const key = normalizeForMatch(item.name);
    if (key && !indexByKey.has(key)) {
      indexByKey.set(key, item);
    }
  }

  const matches = new Map<string, { id: number; name: string }>();
  for (const name of recipeNames) {
    const key = normalizeForMatch(name);
    if (!key) continue;
    const hit = indexByKey.get(key);
    if (hit) {
      matches.set(name, hit);
    }
  }
  return matches;
}
