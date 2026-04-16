/**
 * Ingredient resolution pipeline — orchestrates Stage 1 (deterministic)
 * and Stage 2 (LLM) into a unified resolution plan.
 */

import type {
  InventoryIngredient,
  IngredientResolution,
  ResolutionPlan,
} from "./types";
import { deterministicMatch, cleanDisplayName } from "./normalize";
import { resolveIngredientsWithLlm, type LlmResolutionItem } from "./llm-resolve";

const AUTO_APPLY_CONFIDENCE = 0.7;

export type PipelineDeps = {
  llmResolve?: typeof resolveIngredientsWithLlm;
};

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
