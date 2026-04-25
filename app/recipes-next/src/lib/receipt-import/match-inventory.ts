/**
 * Deterministic pre-match pass: given a raw receipt line, look for any of the
 * user's existing inventory ingredients inside the line BEFORE the LLM sees
 * it. The goal is to stop the LLM from accidentally creating a "new" Avocado
 * Oil Spray when we already have one on file just because the receipt
 * prepended "Chosen Foods" to it.
 *
 * Strategy:
 * 1. Normalise every inventory ingredient name with the same
 *    `normalizeForMatch` used in the recipe pipeline (lowercase, singularise,
 *    strip package sizes, sort tokens). Index them by their normalised key,
 *    but also by their **token SET** (sorted, deduped) so we can look up
 *    arbitrary substrings of the receipt line.
 * 2. Tokenise the receipt line using the same normaliser so strings like
 *    "Chosen Foods Avocado Oil Spray, qty 1, $22.99" reduce to a clean token
 *    stream ["avocado", "chosen", "foods", "oil", "spray"].
 * 3. Slide a window across the tokens, largest-first (down to 2 tokens
 *    minimum), and look for any window whose sorted-unique token set exactly
 *    matches an inventory entry's sorted-unique token set. Single-token
 *    matches are allowed too, but only when the token is at least 4
 *    characters (to keep "oat" from colliding with "oats" after
 *    singularisation ambiguity — they're the same in practice via singularize
 *    already, but this prevents accidents with tiny tokens).
 *
 * "Medium" strictness: we do whole-word token matches via the shared
 * normaliser. Tokens like "oats" vs "oatmeal" DON'T collide because they
 * singularise to different stems.
 */

import { normalizeForMatch } from "@/lib/ingredient-resolution/normalize";

export type InventoryMatchCandidate = {
  id: number;
  name: string;
  aliases?: string[];
};

export type InventoryMatchResult = {
  ingredient: InventoryMatchCandidate;
  /** Number of tokens that matched — we prefer the longest match when
   * multiple candidates could apply to the same line. */
  matchedTokenCount: number;
};

/** Build a reusable index for fast per-line lookup. */
export function buildInventoryMatchIndex(
  inventory: InventoryMatchCandidate[],
): Map<string, InventoryMatchCandidate> {
  const byKey = new Map<string, InventoryMatchCandidate>();
  for (const item of inventory) {
    for (const name of [item.name, ...(item.aliases ?? [])]) {
      const key = normalizeForMatch(name);
      if (!key) continue;
      if (byKey.has(key)) continue; // first wins; this is vanishingly rare
      byKey.set(key, item);
    }
  }
  return byKey;
}

/**
 * Tokenise a raw receipt line the way `normalizeForMatch` would. We stop
 * short of sorting so we can run a windowed search.
 */
function tokeniseLine(line: string): string[] {
  const normalised = normalizeForMatch(line);
  if (!normalised) return [];
  return normalised.split(" ").filter(Boolean);
}

/**
 * Find the best (longest-match-wins) inventory ingredient that appears inside
 * the receipt line. Returns null if no window matches.
 */
export function matchReceiptLineToInventory(
  rawLine: string,
  index: Map<string, InventoryMatchCandidate>,
): InventoryMatchResult | null {
  if (index.size === 0) return null;
  const tokens = tokeniseLine(rawLine);
  if (tokens.length === 0) return null;

  // Precompute the set of token counts we need to probe: anything from the
  // full line down to 2, plus single-token matches for strong whole words.
  for (let windowSize = tokens.length; windowSize >= 1; windowSize--) {
    for (let start = 0; start + windowSize <= tokens.length; start++) {
      const window = tokens.slice(start, start + windowSize);

      // Single-token matches are only allowed when the token is meaty. Tiny
      // words like "oil" or "cup" would otherwise false-positive.
      if (windowSize === 1 && window[0].length < 5) continue;

      // normalizeForMatch sorts tokens and dedupes implicitly when both sides
      // are passed through it — so we produce the same key both sides do.
      const unique = Array.from(new Set(window)).sort();
      const key = unique.join(" ");
      const hit = index.get(key);
      if (hit) {
        return { ingredient: hit, matchedTokenCount: windowSize };
      }
    }
  }
  return null;
}
