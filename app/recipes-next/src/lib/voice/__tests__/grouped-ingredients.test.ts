import { describe, expect, it } from "vitest";
import type {
  RecipeIngredientRow,
  RecipeIngredientSectionRow,
} from "@/types/database";
import { groupIngredientsForVoice } from "@/lib/voice/grouped-ingredients";

function row(
  partial: Partial<RecipeIngredientRow> & {
    id: number;
    ingredient_id: number;
    name: string;
    grocery_category?: string | null;
  },
): RecipeIngredientRow {
  const {
    name,
    grocery_category,
    line_sort_order = partial.id,
    ...rest
  } = partial;
  return {
    recipe_id: 1,
    section_id: null,
    line_sort_order,
    amount: null,
    unit: null,
    preparation: null,
    display: null,
    is_optional: false,
    ingredients: {
      id: partial.ingredient_id,
      name,
      density_g_per_ml: null,
      canonical_unit_weight_g: null,
      grocery_category: grocery_category ?? null,
    },
    ...rest,
  };
}

const NO_SECTIONS: RecipeIngredientSectionRow[] = [];

describe("groupIngredientsForVoice", () => {
  it("orders pantry items before fridge before produce before protein", () => {
    const result = groupIngredientsForVoice({
      recipeIngredients: [
        row({ id: 1, ingredient_id: 1, name: "Garlic", grocery_category: "Produce" }),
        row({ id: 2, ingredient_id: 2, name: "Pasta", grocery_category: "Pantry" }),
        row({ id: 3, ingredient_id: 3, name: "Chicken Thighs", grocery_category: "Meat" }),
        row({ id: 4, ingredient_id: 4, name: "Parmesan", grocery_category: "Dairy" }),
      ],
      recipeIngredientSections: NO_SECTIONS,
      stockedIds: new Set(),
    });

    const order = result.flatMap((bucket) => bucket.lines.map((l) => l.name));
    expect(order).toEqual(["Pasta", "Parmesan", "Garlic", "Chicken Thighs"]);
  });

  it("groups within a bucket and preserves recipe order inside a bucket", () => {
    const result = groupIngredientsForVoice({
      recipeIngredients: [
        row({ id: 10, ingredient_id: 1, name: "Olive Oil", grocery_category: "Pantry" }),
        row({ id: 11, ingredient_id: 2, name: "Salt", grocery_category: "Pantry" }),
        row({ id: 12, ingredient_id: 3, name: "Tomato", grocery_category: "Produce" }),
        row({ id: 13, ingredient_id: 4, name: "Black Pepper", grocery_category: "Pantry" }),
      ],
      recipeIngredientSections: NO_SECTIONS,
      stockedIds: new Set(),
    });

    const pantry = result.find((b) => b.category.toLowerCase() === "pantry");
    expect(pantry?.lines.map((l) => l.name)).toEqual([
      "Olive Oil",
      "Salt",
      "Black Pepper",
    ]);
  });

  it("falls back to an Other bucket when grocery_category is null", () => {
    const result = groupIngredientsForVoice({
      recipeIngredients: [
        row({ id: 1, ingredient_id: 1, name: "Mystery Item", grocery_category: null }),
      ],
      recipeIngredientSections: NO_SECTIONS,
      stockedIds: new Set(),
    });

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("Other");
    expect(result[0].lines[0].name).toBe("Mystery Item");
  });

  it("flags stocked ingredients via the line.inStock boolean", () => {
    const result = groupIngredientsForVoice({
      recipeIngredients: [
        row({ id: 1, ingredient_id: 7, name: "Olive Oil", grocery_category: "Pantry" }),
        row({ id: 2, ingredient_id: 8, name: "Salt", grocery_category: "Pantry" }),
      ],
      recipeIngredientSections: NO_SECTIONS,
      stockedIds: new Set([7]),
    });

    const lines = result.flatMap((b) => b.lines);
    expect(lines.find((l) => l.name === "Olive Oil")?.inStock).toBe(true);
    expect(lines.find((l) => l.name === "Salt")?.inStock).toBe(false);
  });

  it("attaches section headings when present", () => {
    const sections: RecipeIngredientSectionRow[] = [
      { id: "section-1", recipe_id: 1, heading: "For the Dressing", sort_order: 0 },
    ];
    const result = groupIngredientsForVoice({
      recipeIngredients: [
        row({
          id: 1,
          ingredient_id: 1,
          name: "Olive Oil",
          grocery_category: "Pantry",
          section_id: "section-1",
        }),
      ],
      recipeIngredientSections: sections,
      stockedIds: new Set(),
    });

    expect(result[0].lines[0].sectionHeading).toBe("For the Dressing");
  });

  it("matches loosely when grocery_category uses a known prefix", () => {
    const result = groupIngredientsForVoice({
      recipeIngredients: [
        row({
          id: 1,
          ingredient_id: 1,
          name: "Basil",
          grocery_category: "Produce — leafy herbs",
        }),
        row({ id: 2, ingredient_id: 2, name: "Salt", grocery_category: "Pantry" }),
      ],
      recipeIngredientSections: NO_SECTIONS,
      stockedIds: new Set(),
    });

    const order = result.flatMap((bucket) => bucket.lines.map((l) => l.name));
    expect(order).toEqual(["Salt", "Basil"]);
  });
});
