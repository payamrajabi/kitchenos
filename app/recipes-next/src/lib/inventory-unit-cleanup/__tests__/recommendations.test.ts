import { describe, expect, it } from "vitest";
import {
  createReviewFile,
  generateApprovedUnitCleanupSql,
  parseUnitCleanupModelResponse,
  renderReviewMarkdown,
  type InventoryReviewItem,
  type ProductReviewItem,
} from "../recommendations";

describe("inventory unit cleanup recommendations", () => {
  it("parses and normalizes valid model output", () => {
    const parsed = parseUnitCleanupModelResponse(
      JSON.stringify({
        inventoryRecommendations: [
          {
            inventoryItemId: 10,
            stockUnit: "bottle",
            recipeUnit: "L",
            storageLocation: "Fridge",
            confidence: 0.91,
            reason: "Stored in a bottle and measured by volume.",
          },
        ],
        productRecommendations: [
          {
            productId: 20,
            unitSizeAmount: 946,
            unitSizeUnit: "ml",
            priceBasis: "package",
            priceBasisAmount: null,
            priceBasisUnit: null,
            confidence: 0.86,
            reason: "Package size is clear from the product.",
          },
        ],
      }),
      { inventoryItemIds: [10], productIds: [20] },
    );

    expect(parsed.inventoryRecommendations[0]).toMatchObject({
      inventoryItemId: 10,
      stockUnit: "bottle",
      recipeUnit: "l",
    });
    expect(parsed.productRecommendations[0]).toMatchObject({
      productId: 20,
      unitSizeAmount: 946,
      unitSizeUnit: "ml",
    });
  });

  it("rejects units outside the app's allowed unit list", () => {
    expect(() =>
      parseUnitCleanupModelResponse(
        JSON.stringify({
          inventoryRecommendations: [
            {
              inventoryItemId: 10,
              stockUnit: "carton",
              recipeUnit: "ml",
              storageLocation: "Shallow Pantry",
              confidence: 0.7,
              reason: "Carton would be natural but is not supported.",
            },
          ],
          productRecommendations: [],
        }),
        { inventoryItemIds: [10], productIds: [] },
      ),
    ).toThrow(/allowed units/);
  });

  it("rejects missing rows so partial model output cannot become SQL", () => {
    expect(() =>
      parseUnitCleanupModelResponse(
        JSON.stringify({
          inventoryRecommendations: [],
          productRecommendations: [],
        }),
        { inventoryItemIds: [10], productIds: [] },
      ),
    ).toThrow(/expected rows/);
  });

  it("renders a review markdown file with low confidence rows flagged", () => {
    const review = createReviewFile({
      generatedAt: "2026-04-24T00:00:00.000Z",
      model: "test-model",
      inventoryRecommendations: [
        inventoryItem({
          confidence: 0.6,
          needsReview: true,
          reason: "Could be package or weight.",
        }),
      ],
      productRecommendations: [],
    });

    const markdown = renderReviewMarkdown(review);

    expect(markdown).toContain("Inventory rows needing review: 1");
    expect(markdown).toContain("no | yes | 1");
  });

  it("generates SQL only for approved rows", () => {
    const review = createReviewFile({
      generatedAt: "2026-04-24T00:00:00.000Z",
      model: "test-model",
      inventoryRecommendations: [
        inventoryItem({ inventoryItemId: 1, approved: true }),
        inventoryItem({ inventoryItemId: 2, approved: false }),
      ],
      productRecommendations: [
        productItem({ productId: 10, approved: true }),
        productItem({ productId: 11, approved: false }),
      ],
    });

    const sql = generateApprovedUnitCleanupSql(review);

    expect(sql).toContain("Approved inventory_items.unit updates: 1");
    expect(sql).toContain("(1, 'bottle'::text)");
    expect(sql).toContain("Approved inventory_items.recipe_unit updates: 1");
    expect(sql).toContain("(1, 'ml'::text)");
    expect(sql).not.toContain("(2,");
    expect(sql).toContain("Approved ingredient_products unit-size updates: 1");
    expect(sql).toContain("(10, 500::numeric, 'g'::text");
    expect(sql).toContain("Approved ingredient_products price-basis updates: 1");
    expect(sql).not.toContain("(11,");
  });

  it("escapes SQL strings in approved rows", () => {
    const review = createReviewFile({
      generatedAt: "2026-04-24T00:00:00.000Z",
      model: "test-model",
      inventoryRecommendations: [
        inventoryItem({
          approved: true,
          suggestedStockUnit: "bottle",
          suggestedRecipeUnit: "fl oz",
        }),
      ],
      productRecommendations: [],
    });

    const sql = generateApprovedUnitCleanupSql(review);

    expect(sql).toContain("'fl oz'::text");
  });
});

function inventoryItem(
  overrides: Partial<InventoryReviewItem> = {},
): InventoryReviewItem {
  return {
    inventoryItemId: 1,
    ingredientId: 100,
    ingredientName: "Soy Sauce",
    storageLocation: "Fridge",
    currentStockUnit: "bottle",
    currentRecipeUnit: null,
    suggestedStockUnit: "bottle",
    suggestedRecipeUnit: "ml",
    confidence: 0.95,
    needsReview: false,
    approved: false,
    reason: "Usually stored as a bottle and measured by volume.",
    ...overrides,
  };
}

function productItem(overrides: Partial<ProductReviewItem> = {}): ProductReviewItem {
  return {
    productId: 10,
    ingredientId: 100,
    ingredientName: "Rice",
    productName: "Rice 500 g",
    brand: null,
    currentUnitSizeAmount: null,
    currentUnitSizeUnit: null,
    suggestedUnitSizeAmount: 500,
    suggestedUnitSizeUnit: "g",
    currentPriceBasis: null,
    currentPriceBasisAmount: null,
    currentPriceBasisUnit: null,
    suggestedPriceBasis: "package",
    suggestedPriceBasisAmount: null,
    suggestedPriceBasisUnit: null,
    confidence: 0.9,
    needsReview: false,
    approved: false,
    reason: "Product name indicates the package size.",
    ...overrides,
  };
}
