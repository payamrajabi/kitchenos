/**
 * LLM-based ingredient resolution (Stage 2 of the pipeline).
 *
 * Sends unresolved recipe ingredient names + the user's full inventory to
 * gpt-4o-mini in a single batch call. The model returns a structured JSON
 * response describing how each name relates to existing inventory.
 */

import type { InventoryIngredient } from "./types";

/* ------------------------------------------------------------------ */
/*  LLM response shape                                                */
/* ------------------------------------------------------------------ */

export type LlmResolutionItem = {
  recipe_name: string;
  action:
    | "use_existing"
    | "create_variant_under_existing"
    | "create_sibling_variant"
    | "create_standalone";
  /** Id of the existing ingredient this relates to (null for standalone). */
  existing_id: number | null;
  /** For create_sibling_variant: the name for the new parent row. */
  parent_name: string | null;
  /** Cleaned display name (strips package sizes, etc.). */
  clean_name: string;
  confidence: number;
  reason: string;
};

export type LlmResolutionResponse = {
  resolutions: LlmResolutionItem[];
};

/* ------------------------------------------------------------------ */
/*  JSON helpers (same pattern as llm-nutrition-estimate.ts)           */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Sanitise / validate the LLM response                              */
/* ------------------------------------------------------------------ */

const VALID_ACTIONS = new Set([
  "use_existing",
  "create_variant_under_existing",
  "create_sibling_variant",
  "create_standalone",
]);

function sanitizeItem(
  raw: Record<string, unknown>,
  inventoryIds: Set<number>,
): LlmResolutionItem | null {
  const recipeName = typeof raw.recipe_name === "string" ? raw.recipe_name.trim() : "";
  if (!recipeName) return null;

  const action = typeof raw.action === "string" ? raw.action.trim() : "";
  if (!VALID_ACTIONS.has(action)) return null;

  const existingIdRaw = raw.existing_id ?? raw.match_id ?? raw.existingId;
  const existingId =
    existingIdRaw != null && Number.isFinite(Number(existingIdRaw))
      ? Number(existingIdRaw)
      : null;

  if (action !== "create_standalone" && (existingId == null || !inventoryIds.has(existingId))) {
    return null;
  }

  const parentName = typeof raw.parent_name === "string" ? raw.parent_name.trim() || null : null;
  if (action === "create_sibling_variant" && !parentName) return null;

  const cleanName = typeof raw.clean_name === "string" ? raw.clean_name.trim() : recipeName;

  const confidenceRaw = raw.confidence;
  const confidence =
    typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw)
      ? Math.min(1, Math.max(0, confidenceRaw))
      : 0.5;

  const reason = typeof raw.reason === "string" ? raw.reason.slice(0, 300) : "";

  return {
    recipe_name: recipeName,
    action: action as LlmResolutionItem["action"],
    existing_id: existingId,
    parent_name: parentName,
    clean_name: cleanName,
    confidence,
    reason,
  };
}

function sanitizeResponse(
  raw: Record<string, unknown>,
  inventoryIds: Set<number>,
): LlmResolutionItem[] {
  const arr = raw.resolutions;
  if (!Array.isArray(arr)) return [];
  const results: LlmResolutionItem[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const sanitized = sanitizeItem(item as Record<string, unknown>, inventoryIds);
    if (sanitized) results.push(sanitized);
  }
  return results;
}

/* ------------------------------------------------------------------ */
/*  Build the prompt                                                  */
/* ------------------------------------------------------------------ */

function buildInventoryContext(inventory: InventoryIngredient[]): string {
  const parentMap = new Map<number, string>();
  for (const item of inventory) {
    parentMap.set(item.id, item.name);
  }

  const lines: string[] = [];
  for (const item of inventory) {
    const parentLabel =
      item.parent_ingredient_id != null
        ? ` (variant of "${parentMap.get(item.parent_ingredient_id) ?? "?"}")`
        : "";
    lines.push(`  { "id": ${item.id}, "name": "${item.name}"${parentLabel} }`);
  }
  return lines.join("\n");
}

function buildSystemPrompt(): string {
  return `You are an ingredient matching assistant for a home kitchen inventory system.

You receive:
1. A list of ingredient names from a recipe.
2. The user's current inventory (with ids and any existing parent/variant relationships).

For EACH recipe ingredient, decide how it relates to the inventory and return a JSON object.

ACTIONS (pick exactly one per ingredient):
- "use_existing": The recipe ingredient IS the same real-world item as an existing inventory ingredient (synonym, regional name, or trivially different wording). Set existing_id to that ingredient's id.
- "create_variant_under_existing": The recipe ingredient is a specific variant of an existing PARENT ingredient. Set existing_id to the parent's id. Example: recipe says "Diced Tomatoes", inventory has "Tomatoes" as a parent → create variant under Tomatoes.
- "create_sibling_variant": The recipe ingredient and an existing STANDALONE ingredient (no parent, no children) are both variants of a shared concept. Set existing_id to the existing standalone, parent_name to the shared concept. Example: recipe says "Whole Milk", inventory has "Soy Milk" (standalone) → both are variants of "Milk".
- "create_standalone": No meaningful relationship to any existing ingredient. Truly new.

RULES:
- Prefer "use_existing" when the items are genuinely interchangeable (Cilantro = Coriander leaves, Arugula = Rocket).
- Do NOT "use_existing" when items are related but distinct (Garlic ≠ Garlic Powder, Coconut Milk ≠ Coconut).
- "create_sibling_variant" should only be used when the existing item is standalone (not already a variant or parent of variants). If the existing item already has a parent, use "create_variant_under_existing" with the parent id instead.
- For "create_sibling_variant", the parent_name should be a short generic category (e.g. "Milk", "Butter", "Onion") — not the same as either variant name.
- Strip package sizes from clean_name (e.g. "14oz Diced Tomatoes" → "Diced Tomatoes").
- Strip brand names from clean_name when they don't affect identity (e.g. "Philadelphia Cream Cheese" → "Cream Cheese").
- Confidence should reflect how certain you are: 0.95+ for near-certain matches, 0.7-0.9 for reasonable variant groupings, below 0.5 for uncertain.
- When an ingredient has no relationship to anything in the inventory, use "create_standalone" with confidence 1.0.

Return a single JSON object: { "resolutions": [ ... ] }
Each resolution must have: recipe_name, action, existing_id (or null), parent_name (or null), clean_name, confidence, reason.`;
}

/* ------------------------------------------------------------------ */
/*  The LLM call                                                      */
/* ------------------------------------------------------------------ */

export async function resolveIngredientsWithLlm(
  unresolvedNames: string[],
  inventory: InventoryIngredient[],
): Promise<LlmResolutionItem[]> {
  if (unresolvedNames.length === 0) return [];

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return [];

  const inventoryIds = new Set(inventory.map((i) => i.id));
  const inventoryContext = buildInventoryContext(inventory);

  const userMessage = JSON.stringify({
    recipe_ingredients: unresolvedNames,
    note: "Resolve each recipe ingredient against the inventory below.",
  });

  const inventoryBlock = `Current inventory:\n${inventoryContext}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.15,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "system", content: inventoryBlock },
          { role: "user", content: userMessage },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) return [];

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return [];

    const parsed = tryParseJsonObject(content);
    if (!parsed) return [];

    return sanitizeResponse(parsed, inventoryIds);
  } catch {
    return [];
  }
}
