import { describe, it, expect } from "vitest";
import type { ShoppingListItem } from "@/app/actions/shop";
import {
  mapUnitToInstacart,
  shoppingListItemsToInstacartLineItems,
} from "@/lib/instacart/map-line-items";

function item(partial: Partial<ShoppingListItem>): ShoppingListItem {
  return {
    ingredientId: 1,
    ingredientName: "Soy Milk",
    category: "Dairy",
    groceryCategory: "Dairy",
    neededAmount: 1,
    neededUnit: "l",
    onHandAmount: 0,
    onHandUnit: "",
    unitsMatch: true,
    ...partial,
  };
}

describe("mapUnitToInstacart", () => {
  it("passes through standard grocery units", () => {
    expect(mapUnitToInstacart("g")).toBe("g");
    expect(mapUnitToInstacart("kg")).toBe("kg");
    expect(mapUnitToInstacart("l")).toBe("l");
    expect(mapUnitToInstacart("ml")).toBe("ml");
    expect(mapUnitToInstacart("oz")).toBe("oz");
    expect(mapUnitToInstacart("tbsp")).toBe("tbsp");
    expect(mapUnitToInstacart("cup")).toBe("cup");
  });

  it("maps countable and package-style units to 'each'", () => {
    expect(mapUnitToInstacart("count")).toBe("each");
    expect(mapUnitToInstacart("ea")).toBe("each");
    expect(mapUnitToInstacart("piece")).toBe("each");
    expect(mapUnitToInstacart("bag")).toBe("each");
    expect(mapUnitToInstacart("jar")).toBe("each");
    expect(mapUnitToInstacart("can")).toBe("each");
  });

  it("defaults missing or unrecognised units to 'each'", () => {
    expect(mapUnitToInstacart("")).toBe("each");
    expect(mapUnitToInstacart(null)).toBe("each");
    expect(mapUnitToInstacart(undefined)).toBe("each");
    expect(mapUnitToInstacart("nonsense")).toBe("each");
  });
});

describe("shoppingListItemsToInstacartLineItems", () => {
  it("emits one line per shopping list row with mapped measurements", () => {
    const lines = shoppingListItemsToInstacartLineItems(
      [
        item({ ingredientId: 1, ingredientName: "Soy Milk", neededAmount: 1.5, neededUnit: "l" }),
        item({ ingredientId: 2, ingredientName: "Eggs", neededAmount: 6, neededUnit: "count" }),
      ],
      new Map(),
    );

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      name: "Soy Milk",
      display_text: "Soy Milk",
      line_item_measurements: [{ quantity: 1.5, unit: "l" }],
    });
    expect(lines[0].upcs).toBeUndefined();
    expect(lines[1]).toMatchObject({
      name: "Eggs",
      line_item_measurements: [{ quantity: 6, unit: "each" }],
    });
  });

  it("attaches a UPC when a barcode exists for the ingredient", () => {
    const lines = shoppingListItemsToInstacartLineItems(
      [item({ ingredientId: 7, ingredientName: "Soy Milk" })],
      new Map([[7, "025293600324"]]),
    );

    expect(lines[0].upcs).toEqual(["025293600324"]);
  });

  it("rounds 'each' quantities up to whole numbers and at least 1", () => {
    const lines = shoppingListItemsToInstacartLineItems(
      [
        item({ ingredientId: 1, neededAmount: 0.25, neededUnit: "count" }),
        item({ ingredientId: 2, neededAmount: 2.3, neededUnit: "piece" }),
      ],
      new Map(),
    );

    expect(lines[0].line_item_measurements?.[0]).toEqual({ quantity: 1, unit: "each" });
    expect(lines[1].line_item_measurements?.[0]).toEqual({ quantity: 3, unit: "each" });
  });

  it("clamps weight/volume quantities to at least 0.01 and two decimals", () => {
    const lines = shoppingListItemsToInstacartLineItems(
      [
        item({ ingredientId: 1, neededAmount: 0, neededUnit: "g" }),
        item({ ingredientId: 2, neededAmount: 1.236, neededUnit: "kg" }),
      ],
      new Map(),
    );

    expect(lines[0].line_item_measurements?.[0]).toEqual({ quantity: 0.01, unit: "g" });
    expect(lines[1].line_item_measurements?.[0]).toEqual({ quantity: 1.24, unit: "kg" });
  });

  it("trims whitespace from barcodes and drops empty strings", () => {
    const lines = shoppingListItemsToInstacartLineItems(
      [
        item({ ingredientId: 1, ingredientName: "A" }),
        item({ ingredientId: 2, ingredientName: "B" }),
      ],
      new Map([
        [1, "  111  "],
        [2, "   "],
      ]),
    );

    expect(lines[0].upcs).toEqual(["111"]);
    expect(lines[1].upcs).toBeUndefined();
  });
});
