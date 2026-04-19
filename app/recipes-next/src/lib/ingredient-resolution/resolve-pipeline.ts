/**
 * Ingredient resolution pipeline — orchestrates Stage 1 (deterministic)
 * and Stage 2 (LLM) into a unified resolution plan.
 */

import type {
  InventoryIngredient,
  IngredientResolution,
  ResolutionPlan,
} from "./types";
import { deterministicMatch, cleanDisplayName, normalizeForMatch } from "./normalize";
import { resolveIngredientsWithLlm, type LlmResolutionItem } from "./llm-resolve";
import type { BackboneMatch } from "@/lib/ingredient-backbone-catalogue";

const AUTO_APPLY_CONFIDENCE = 0.7;

/**
 * Catalogue-bridged lookup: given a list of recipe ingredient names, return
 * a Map of names → backbone catalogue matches (canonical or alias) for the
 * ones the catalogue recognises.
 *
 * Provided by the caller (so the pipeline stays pure / testable). The
 * default wiring passes in a batched Supabase query; tests can pass in
 * a stub.
 */
export type CatalogueLookup = (
  names: string[],
) => Promise<Map<string, BackboneMatch>>;

export type PipelineDeps = {
  llmResolve?: typeof resolveIngredientsWithLlm;
  catalogueLookup?: CatalogueLookup;
};

/**
 * Find an inventory item that shares a canonical identity with the given
 * catalogue match — either via its stamped `backbone_id`, or via a name
 * whose normalised key matches the catalogue's `match_key` or any alias.
 *
 * Returns the inventory item (or `null` if the user hasn't got one yet).
 */
function findInventoryByCatalogueIdentity(
  match: BackboneMatch,
  inventory: InventoryIngredient[],
  inventoryNormalizedIndex: Map<string, InventoryIngredient>,
): InventoryIngredient | null {
  for (const item of inventory) {
    if (item.backbone_id && item.backbone_id === match.entry.backbone_id) {
      return item;
    }
  }

  const canonicalHit = inventoryNormalizedIndex.get(match.entry.match_key);
  if (canonicalHit) return canonicalHit;

  for (const aliasKey of match.entry.aliases ?? []) {
    const aliasHit = inventoryNormalizedIndex.get(aliasKey);
    if (aliasHit) return aliasHit;
  }

  return null;
}

/**
 * Build a lookup of which ingredient ids are parents (have at least one child)
 * and which are children (have a parent_ingredient_id).
 */
function buildHierarchyMaps(inventory: InventoryIngredient[]) {
  const childOf = new Map<number, number>();
  const parentIds = new Set<number>();

  for (const item of inventory) {
    if (item.parent_ingredient_id != null) {
      childOf.set(item.id, item.parent_ingredient_id);
      parentIds.add(item.parent_ingredient_id);
    }
  }

  return { childOf, parentIds };
}

function inventoryById(inventory: InventoryIngredient[]): Map<number, InventoryIngredient> {
  const map = new Map<number, InventoryIngredient>();
  for (const item of inventory) {
    map.set(item.id, item);
  }
  return map;
}

/**
 * Convert an LLM resolution item into a typed IngredientResolution,
 * taking the existing hierarchy into account.
 */
function llmItemToResolution(
  item: LlmResolutionItem,
  byId: Map<number, InventoryIngredient>,
  hierarchy: ReturnType<typeof buildHierarchyMaps>,
): IngredientResolution {
  const { childOf, parentIds } = hierarchy;

  switch (item.action) {
    case "use_existing": {
      const existing = byId.get(item.existing_id!);
      if (!existing) {
        return {
          action: "create_standalone",
          recipeName: item.recipe_name,
          cleanName: item.clean_name || item.recipe_name,
          confidence: 1,
          reason: "LLM referenced unknown ingredient id; falling back to standalone.",
        };
      }
      return {
        action: "use_existing",
        recipeName: item.recipe_name,
        existingIngredientId: existing.id,
        existingIngredientName: existing.name,
        confidence: item.confidence,
        reason: item.reason,
      };
    }

    case "create_variant_under_existing": {
      const parent = byId.get(item.existing_id!);
      if (!parent) {
        return {
          action: "create_standalone",
          recipeName: item.recipe_name,
          cleanName: item.clean_name || item.recipe_name,
          confidence: 1,
          reason: "LLM referenced unknown parent id; falling back to standalone.",
        };
      }
      return {
        action: "create_variant_under_existing",
        recipeName: item.recipe_name,
        parentIngredientId: parent.id,
        parentIngredientName: parent.name,
        cleanName: item.clean_name || item.recipe_name,
        confidence: item.confidence,
        reason: item.reason,
      };
    }

    case "create_sibling_variant": {
      const sibling = byId.get(item.existing_id!);
      if (!sibling) {
        return {
          action: "create_standalone",
          recipeName: item.recipe_name,
          cleanName: item.clean_name || item.recipe_name,
          confidence: 1,
          reason: "LLM referenced unknown sibling id; falling back to standalone.",
        };
      }

      if (childOf.has(sibling.id)) {
        const parentId = childOf.get(sibling.id)!;
        const parent = byId.get(parentId);
        return {
          action: "create_variant_under_existing",
          recipeName: item.recipe_name,
          parentIngredientId: parentId,
          parentIngredientName: parent?.name ?? "Unknown",
          cleanName: item.clean_name || item.recipe_name,
          confidence: item.confidence,
          reason: `${item.reason} (existing item already has a parent — adding under it instead)`,
        };
      }

      if (parentIds.has(sibling.id)) {
        return {
          action: "create_variant_under_existing",
          recipeName: item.recipe_name,
          parentIngredientId: sibling.id,
          parentIngredientName: sibling.name,
          cleanName: item.clean_name || item.recipe_name,
          confidence: item.confidence,
          reason: `${item.reason} (existing item is already a parent — adding as variant)`,
        };
      }

      return {
        action: "create_sibling_variant",
        recipeName: item.recipe_name,
        existingSiblingId: sibling.id,
        existingSiblingName: sibling.name,
        parentName: item.parent_name ?? item.recipe_name,
        cleanName: item.clean_name || item.recipe_name,
        confidence: item.confidence,
        reason: item.reason,
      };
    }

    case "create_standalone":
    default:
      return {
        action: "create_standalone",
        recipeName: item.recipe_name,
        cleanName: item.clean_name || item.recipe_name,
        confidence: item.confidence,
        reason: item.reason,
      };
  }
}

/**
 * Main entry point: resolve a batch of recipe ingredient names against
 * the user's inventory.
 *
 * Returns a ResolutionPlan describing what should happen for each name.
 */
export async function resolveRecipeIngredients(
  recipeNames: string[],
  inventory: InventoryIngredient[],
  deps: PipelineDeps = {},
): Promise<ResolutionPlan> {
  const names = recipeNames.map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) {
    return { resolutions: [], needsConfirmation: false };
  }

  const resolutions: IngredientResolution[] = [];

  // Stage 1: Deterministic matching
  const deterministicMatches = deterministicMatch(names, inventory);
  const unresolved: string[] = [];

  for (const name of names) {
    const match = deterministicMatches.get(name);
    if (match) {
      resolutions.push({
        action: "use_existing",
        recipeName: name,
        existingIngredientId: match.id,
        existingIngredientName: match.name,
        confidence: 1,
        reason: "Deterministic name match.",
      });
    } else {
      unresolved.push(name);
    }
  }

  // Stage 1.5: Catalogue-bridged match. For each still-unresolved name, see
  // if the backbone catalogue recognises it; if it does, check whether the
  // user already has an inventory item with the same canonical identity
  // (either via stamped backbone_id or via a name that the catalogue calls
  // the same thing). When it hits, we link to the existing row instead of
  // asking the LLM — preventing duplicates like "Garbanzo Beans" living
  // alongside "Chickpeas".
  if (unresolved.length > 0 && deps.catalogueLookup) {
    const catalogueMatches = await deps.catalogueLookup(unresolved);

    if (catalogueMatches.size > 0) {
      // Build once, reuse across every unresolved name.
      const inventoryNormalizedIndex = new Map<string, InventoryIngredient>();
      for (const item of inventory) {
        const key = normalizeForMatch(item.name);
        if (key && !inventoryNormalizedIndex.has(key)) {
          inventoryNormalizedIndex.set(key, item);
        }
      }

      const stillUnresolved: string[] = [];
      for (const name of unresolved) {
        const cMatch = catalogueMatches.get(name);
        if (!cMatch) {
          stillUnresolved.push(name);
          continue;
        }
        const existing = findInventoryByCatalogueIdentity(
          cMatch,
          inventory,
          inventoryNormalizedIndex,
        );
        if (existing) {
          const canonical = cMatch.entry.canonical_name;
          resolutions.push({
            action: "use_existing",
            recipeName: name,
            existingIngredientId: existing.id,
            existingIngredientName: existing.name,
            confidence: 0.95,
            reason:
              cMatch.matchType === "canonical"
                ? `Matched "${canonical}" in the ingredient catalogue; reusing "${existing.name}".`
                : `Matched alias in the ingredient catalogue (canonical: ${canonical}); reusing "${existing.name}".`,
          });
        } else {
          stillUnresolved.push(name);
        }
      }

      unresolved.length = 0;
      unresolved.push(...stillUnresolved);
    }
  }

  // Stage 2: LLM resolution for anything deterministic didn't catch
  if (unresolved.length > 0) {
    const llmResolve = deps.llmResolve ?? resolveIngredientsWithLlm;
    const llmResults = await llmResolve(unresolved, inventory);

    const byId = inventoryById(inventory);
    const hierarchy = buildHierarchyMaps(inventory);
    const llmByName = new Map<string, LlmResolutionItem>();
    for (const item of llmResults) {
      llmByName.set(item.recipe_name, item);
    }

    for (const name of unresolved) {
      const llmItem = llmByName.get(name);
      if (llmItem) {
        resolutions.push(llmItemToResolution(llmItem, byId, hierarchy));
      } else {
        resolutions.push({
          action: "create_standalone",
          recipeName: name,
          cleanName: cleanDisplayName(name),
          confidence: 1,
          reason: "No match found (LLM did not return a result for this ingredient).",
        });
      }
    }
  }

  const needsConfirmation = resolutions.some(
    (r) =>
      r.action === "create_sibling_variant" &&
      r.confidence < AUTO_APPLY_CONFIDENCE,
  );

  return { resolutions, needsConfirmation };
}
