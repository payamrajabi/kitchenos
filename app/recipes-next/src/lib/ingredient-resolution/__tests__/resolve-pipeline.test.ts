import { describe, expect, it } from "vitest";
import { resolveRecipeIngredients } from "../resolve-pipeline";
import type { InventoryIngredient } from "../types";
import type { LlmResolutionItem } from "../llm-resolve";
import type {
  BackboneMatch,
  BackboneCatalogueRow,
} from "@/lib/ingredient-backbone-catalogue";

function makeInventory(
  items: {
    id: number;
    name: string;
    parentId?: number | null;
    backbone_id?: string | null;
  }[],
): InventoryIngredient[] {
  return items.map((i) => ({
    id: i.id,
    name: i.name,
    parent_ingredient_id: i.parentId ?? null,
    category: null,
    grocery_category: null,
    backbone_id: i.backbone_id ?? null,
  }));
}

function stubLlm(items: LlmResolutionItem[]) {
  return async () => items;
}

function makeCatalogueEntry(
  partial: Partial<BackboneCatalogueRow> & {
    backbone_id: string;
    canonical_name: string;
    match_key: string;
  },
): BackboneCatalogueRow {
  return {
    variant: null,
    parent_backbone_id: null,
    taxonomy_subcategory: null,
    grocery_category: null,
    default_units: null,
    storage_hints: null,
    shelf_life_counter_days: null,
    shelf_life_fridge_days: null,
    shelf_life_freezer_days: null,
    packaged_common: false,
    is_composite: false,
    density_g_per_ml: null,
    canonical_unit_weight_g: null,
    aliases: [],
    notes: null,
    ...partial,
  };
}

function stubCatalogue(
  entries: Record<string, BackboneMatch | undefined>,
) {
  return async (names: string[]) => {
    const out = new Map<string, BackboneMatch>();
    for (const name of names) {
      const hit = entries[name];
      if (hit) out.set(name, hit);
    }
    return out;
  };
}

describe("resolveRecipeIngredients", () => {
  it("resolves exact matches deterministically without calling LLM", async () => {
    const inventory = makeInventory([
      { id: 1, name: "Soy Milk" },
      { id: 2, name: "Butter" },
    ]);

    let llmCalled = false;
    const plan = await resolveRecipeIngredients(
      ["soy milk", "Butter"],
      inventory,
      {
        llmResolve: async () => {
          llmCalled = true;
          return [];
        },
      },
    );

    expect(llmCalled).toBe(false);
    expect(plan.resolutions).toHaveLength(2);
    expect(plan.resolutions[0].action).toBe("use_existing");
    expect(plan.resolutions[1].action).toBe("use_existing");
    expect(plan.needsConfirmation).toBe(false);
  });

  it("resolves plurals deterministically", async () => {
    const inventory = makeInventory([{ id: 1, name: "Egg" }]);

    const plan = await resolveRecipeIngredients(["Eggs"], inventory, {
      llmResolve: stubLlm([]),
    });

    expect(plan.resolutions).toHaveLength(1);
    expect(plan.resolutions[0].action).toBe("use_existing");
    if (plan.resolutions[0].action === "use_existing") {
      expect(plan.resolutions[0].existingIngredientId).toBe(1);
    }
  });

  it("sends unresolved names to LLM and uses results", async () => {
    const inventory = makeInventory([{ id: 1, name: "Soy Milk" }]);

    const plan = await resolveRecipeIngredients(
      ["Whole Milk"],
      inventory,
      {
        llmResolve: stubLlm([
          {
            recipe_name: "Whole Milk",
            action: "create_sibling_variant",
            existing_id: 1,
            parent_name: "Milk",
            clean_name: "Whole Milk",
            confidence: 0.92,
            reason: "Both are milk variants",
          },
        ]),
      },
    );

    expect(plan.resolutions).toHaveLength(1);
    expect(plan.resolutions[0].action).toBe("create_sibling_variant");
    if (plan.resolutions[0].action === "create_sibling_variant") {
      expect(plan.resolutions[0].existingSiblingId).toBe(1);
      expect(plan.resolutions[0].parentName).toBe("Milk");
    }
  });

  it("falls back to standalone when LLM returns nothing", async () => {
    const inventory = makeInventory([{ id: 1, name: "Salt" }]);

    const plan = await resolveRecipeIngredients(
      ["Fish Sauce"],
      inventory,
      { llmResolve: stubLlm([]) },
    );

    expect(plan.resolutions).toHaveLength(1);
    expect(plan.resolutions[0].action).toBe("create_standalone");
  });

  it("handles mixed batch: some deterministic, some LLM, some standalone", async () => {
    const inventory = makeInventory([
      { id: 1, name: "Butter" },
      { id: 2, name: "Tomatoes" },
    ]);

    const plan = await resolveRecipeIngredients(
      ["butter", "Unsalted Butter", "Fish Sauce"],
      inventory,
      {
        llmResolve: stubLlm([
          {
            recipe_name: "Unsalted Butter",
            action: "create_sibling_variant",
            existing_id: 1,
            parent_name: "Butter",
            clean_name: "Unsalted Butter",
            confidence: 0.95,
            reason: "Salted/unsalted are variants",
          },
          {
            recipe_name: "Fish Sauce",
            action: "create_standalone",
            existing_id: null,
            parent_name: null,
            clean_name: "Fish Sauce",
            confidence: 1,
            reason: "New ingredient",
          },
        ]),
      },
    );

    expect(plan.resolutions).toHaveLength(3);

    const butterMatch = plan.resolutions.find((r) => r.recipeName === "butter");
    expect(butterMatch?.action).toBe("use_existing");

    const unsalted = plan.resolutions.find(
      (r) => r.recipeName === "Unsalted Butter",
    );
    expect(unsalted?.action).toBe("create_sibling_variant");

    const fishSauce = plan.resolutions.find(
      (r) => r.recipeName === "Fish Sauce",
    );
    expect(fishSauce?.action).toBe("create_standalone");
  });

  it("redirects create_sibling_variant to create_variant_under_existing when sibling already has a parent", async () => {
    const inventory = makeInventory([
      { id: 10, name: "Milk" },
      { id: 1, name: "Soy Milk", parentId: 10 },
    ]);

    const plan = await resolveRecipeIngredients(
      ["Oat Milk"],
      inventory,
      {
        llmResolve: stubLlm([
          {
            recipe_name: "Oat Milk",
            action: "create_sibling_variant",
            existing_id: 1,
            parent_name: "Milk",
            clean_name: "Oat Milk",
            confidence: 0.9,
            reason: "Both are milk variants",
          },
        ]),
      },
    );

    expect(plan.resolutions).toHaveLength(1);
    expect(plan.resolutions[0].action).toBe("create_variant_under_existing");
    if (plan.resolutions[0].action === "create_variant_under_existing") {
      expect(plan.resolutions[0].parentIngredientId).toBe(10);
    }
  });

  it("redirects create_sibling_variant to create_variant_under_existing when sibling is already a parent", async () => {
    const inventory = makeInventory([
      { id: 1, name: "Tomatoes" },
      { id: 2, name: "Cherry Tomatoes", parentId: 1 },
    ]);

    const plan = await resolveRecipeIngredients(
      ["Diced Tomatoes"],
      inventory,
      {
        llmResolve: stubLlm([
          {
            recipe_name: "Diced Tomatoes",
            action: "create_sibling_variant",
            existing_id: 1,
            parent_name: "Tomatoes",
            clean_name: "Diced Tomatoes",
            confidence: 0.88,
            reason: "Processed form of tomatoes",
          },
        ]),
      },
    );

    expect(plan.resolutions).toHaveLength(1);
    expect(plan.resolutions[0].action).toBe("create_variant_under_existing");
    if (plan.resolutions[0].action === "create_variant_under_existing") {
      expect(plan.resolutions[0].parentIngredientId).toBe(1);
    }
  });

  it("returns empty resolutions for empty input", async () => {
    const plan = await resolveRecipeIngredients([], [], {
      llmResolve: stubLlm([]),
    });

    expect(plan.resolutions).toHaveLength(0);
    expect(plan.needsConfirmation).toBe(false);
  });

  it("catalogue bridge: matches via stamped backbone_id on inventory", async () => {
    const inventory = makeInventory([
      { id: 42, name: "Chickpeas", backbone_id: "chickpea" },
    ]);

    let llmCalled = false;
    const plan = await resolveRecipeIngredients(
      ["Garbanzo Beans"],
      inventory,
      {
        llmResolve: async () => {
          llmCalled = true;
          return [];
        },
        catalogueLookup: stubCatalogue({
          "Garbanzo Beans": {
            matchType: "alias",
            entry: makeCatalogueEntry({
              backbone_id: "chickpea",
              canonical_name: "Chickpea",
              match_key: "chickpea",
              aliases: ["bean garbanzo"],
            }),
          },
        }),
      },
    );

    expect(llmCalled).toBe(false);
    expect(plan.resolutions).toHaveLength(1);
    expect(plan.resolutions[0].action).toBe("use_existing");
    if (plan.resolutions[0].action === "use_existing") {
      expect(plan.resolutions[0].existingIngredientId).toBe(42);
    }
  });

  it("catalogue bridge: matches via canonical name even without backbone_id", async () => {
    const inventory = makeInventory([{ id: 7, name: "Chickpeas" }]);

    let llmCalled = false;
    const plan = await resolveRecipeIngredients(
      ["Garbanzo Beans"],
      inventory,
      {
        llmResolve: async () => {
          llmCalled = true;
          return [];
        },
        catalogueLookup: stubCatalogue({
          "Garbanzo Beans": {
            matchType: "alias",
            entry: makeCatalogueEntry({
              backbone_id: "chickpea",
              canonical_name: "Chickpea",
              match_key: "chickpea",
              aliases: ["bean garbanzo"],
            }),
          },
        }),
      },
    );

    expect(llmCalled).toBe(false);
    expect(plan.resolutions).toHaveLength(1);
    expect(plan.resolutions[0].action).toBe("use_existing");
    if (plan.resolutions[0].action === "use_existing") {
      expect(plan.resolutions[0].existingIngredientId).toBe(7);
    }
  });

  it("catalogue bridge: falls through to LLM when catalogue hits but inventory has no canonical match", async () => {
    const inventory = makeInventory([{ id: 1, name: "Butter" }]);

    const plan = await resolveRecipeIngredients(
      ["Garbanzo Beans"],
      inventory,
      {
        llmResolve: stubLlm([
          {
            recipe_name: "Garbanzo Beans",
            action: "create_standalone",
            existing_id: null,
            parent_name: null,
            clean_name: "Garbanzo Beans",
            confidence: 1,
            reason: "New ingredient",
          },
        ]),
        catalogueLookup: stubCatalogue({
          "Garbanzo Beans": {
            matchType: "alias",
            entry: makeCatalogueEntry({
              backbone_id: "chickpea",
              canonical_name: "Chickpea",
              match_key: "chickpea",
              aliases: ["bean garbanzo"],
            }),
          },
        }),
      },
    );

    expect(plan.resolutions).toHaveLength(1);
    expect(plan.resolutions[0].action).toBe("create_standalone");
  });
});
