import {
  INGREDIENT_UNITS,
  INGREDIENT_UNIT_VALUES,
  normalizeIngredientUnitForStorage,
} from "../unit-mapping";

export const UNIT_CLEANUP_REVIEW_VERSION = 1;
export const LOW_CONFIDENCE_THRESHOLD = 0.8;

const PRODUCT_PRICE_BASIS_VALUES = new Set(["package", "weight", "unit"]);

export type ProductPriceBasisSuggestion = "package" | "weight" | "unit";

export const STORAGE_LOCATIONS = [
  "Fridge",
  "Freezer",
  "Shallow Pantry",
  "Deep Pantry",
  "Other",
] as const;

export type StorageLocation = (typeof STORAGE_LOCATIONS)[number];

const STORAGE_LOCATION_VALUES = new Set<string>(STORAGE_LOCATIONS);

export type ParsedInventoryRecommendation = {
  inventoryItemId: number;
  stockUnit: string;
  recipeUnit: string;
  storageLocation: StorageLocation;
  confidence: number;
  reason: string;
};

export type ParsedProductRecommendation = {
  productId: number;
  unitSizeAmount: number | null;
  unitSizeUnit: string | null;
  priceBasis: ProductPriceBasisSuggestion | null;
  priceBasisAmount: number | null;
  priceBasisUnit: string | null;
  confidence: number;
  reason: string;
};

export type InventoryReviewItem = {
  inventoryItemId: number;
  ingredientId: number;
  ingredientName: string;
  storageLocation: string;
  currentStockUnit: string | null;
  currentRecipeUnit: string | null;
  suggestedStockUnit: string;
  suggestedRecipeUnit: string;
  suggestedStorageLocation?: StorageLocation;
  confidence: number;
  needsReview: boolean;
  approved: boolean;
  approveStockUnit?: boolean;
  approveRecipeUnit?: boolean;
  approveStorageLocation?: boolean;
  reason: string;
};

export type ProductReviewItem = {
  productId: number;
  ingredientId: number;
  ingredientName: string;
  productName: string;
  brand: string | null;
  currentUnitSizeAmount: number | null;
  currentUnitSizeUnit: string | null;
  suggestedUnitSizeAmount: number | null;
  suggestedUnitSizeUnit: string | null;
  currentPriceBasis: ProductPriceBasisSuggestion | null;
  currentPriceBasisAmount: number | null;
  currentPriceBasisUnit: string | null;
  suggestedPriceBasis: ProductPriceBasisSuggestion | null;
  suggestedPriceBasisAmount: number | null;
  suggestedPriceBasisUnit: string | null;
  confidence: number;
  needsReview: boolean;
  approved: boolean;
  approveUnitSize?: boolean;
  approvePriceBasis?: boolean;
  reason: string;
};

export type UnitCleanupReviewFile = {
  version: typeof UNIT_CLEANUP_REVIEW_VERSION;
  generatedAt: string;
  model: string;
  lowConfidenceThreshold: number;
  allowedUnits: readonly string[];
  approvalInstructions: string;
  inventoryRecommendations: InventoryReviewItem[];
  productRecommendations: ProductReviewItem[];
};

export function parseUnitCleanupModelResponse(
  raw: string,
  expected: {
    inventoryItemIds: readonly number[];
    productIds: readonly number[];
  },
): {
  inventoryRecommendations: ParsedInventoryRecommendation[];
  productRecommendations: ParsedProductRecommendation[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Could not parse model response as JSON.");
  }

  if (!isPlainObject(parsed)) {
    throw new Error("Model response must be a JSON object.");
  }

  const inventoryRaw = parsed.inventoryRecommendations;
  const productRaw = parsed.productRecommendations;
  if (!Array.isArray(inventoryRaw)) {
    throw new Error("Model response missing inventoryRecommendations array.");
  }
  if (!Array.isArray(productRaw)) {
    throw new Error("Model response missing productRecommendations array.");
  }

  const inventoryRecommendations = inventoryRaw.map((item, index) =>
    parseInventoryRecommendation(item, index),
  );
  const productRecommendations = productRaw.map((item, index) =>
    parseProductRecommendation(item, index),
  );

  assertExactIds(
    "inventoryRecommendations",
    inventoryRecommendations.map((r) => r.inventoryItemId),
    expected.inventoryItemIds,
  );
  assertExactIds(
    "productRecommendations",
    productRecommendations.map((r) => r.productId),
    expected.productIds,
  );

  return { inventoryRecommendations, productRecommendations };
}

export function createReviewFile(input: {
  generatedAt: string;
  model: string;
  inventoryRecommendations: InventoryReviewItem[];
  productRecommendations: ProductReviewItem[];
}): UnitCleanupReviewFile {
  return {
    version: UNIT_CLEANUP_REVIEW_VERSION,
    generatedAt: input.generatedAt,
    model: input.model,
    lowConfidenceThreshold: LOW_CONFIDENCE_THRESHOLD,
    allowedUnits: INGREDIENT_UNITS,
    approvalInstructions:
      "Set approved to true only for rows you want included in the generated SQL.",
    inventoryRecommendations: input.inventoryRecommendations,
    productRecommendations: input.productRecommendations,
  };
}

export function markNeedsReview(confidence: number): boolean {
  return confidence < LOW_CONFIDENCE_THRESHOLD;
}

export function generateApprovedUnitCleanupSql(
  review: UnitCleanupReviewFile,
): string {
  const inventoryStockRows = review.inventoryRecommendations.filter((r) =>
    isInventoryStockUnitApproved(r),
  );
  const inventoryRecipeRows = review.inventoryRecommendations.filter((r) =>
    isInventoryRecipeUnitApproved(r),
  );
  const inventoryStorageRows = review.inventoryRecommendations.filter((r) =>
    isInventoryStorageLocationApproved(r),
  );
  const productUnitSizeRows = review.productRecommendations.filter((r) =>
    isProductUnitSizeApproved(r),
  );
  const productPriceBasisRows = review.productRecommendations.filter((r) =>
    isProductPriceBasisApproved(r),
  );
  const sections = [
    "-- One-time KitchenOS inventory unit cleanup.",
    "-- Generated from an approved review file. Re-run only if these IDs still match the intended rows.",
    "begin;",
  ];

  if (inventoryStockRows.length > 0) {
    sections.push(renderInventoryStockUnitUpdateSql(inventoryStockRows));
  } else {
    sections.push("-- No approved inventory_items.unit updates.");
  }

  if (inventoryRecipeRows.length > 0) {
    sections.push(renderInventoryRecipeUnitUpdateSql(inventoryRecipeRows));
  } else {
    sections.push("-- No approved inventory_items.recipe_unit updates.");
  }

  if (inventoryStorageRows.length > 0) {
    sections.push(renderInventoryStorageLocationUpdateSql(inventoryStorageRows));
  } else {
    sections.push("-- No approved inventory_items.storage_location updates.");
  }

  if (productUnitSizeRows.length > 0) {
    sections.push(renderProductUnitSizeUpdateSql(productUnitSizeRows));
  } else {
    sections.push("-- No approved ingredient_products unit-size updates.");
  }

  if (productPriceBasisRows.length > 0) {
    sections.push(renderProductPriceBasisUpdateSql(productPriceBasisRows));
  } else {
    sections.push("-- No approved ingredient_products price-basis updates.");
  }

  sections.push("commit;");
  return `${sections.join("\n\n")}\n`;
}

export function isInventoryStockUnitApproved(row: InventoryReviewItem): boolean {
  return row.approved || row.approveStockUnit === true;
}

export function isInventoryRecipeUnitApproved(row: InventoryReviewItem): boolean {
  return row.approved || row.approveRecipeUnit === true;
}

export function isInventoryStorageLocationApproved(
  row: InventoryReviewItem,
): boolean {
  if (!row.suggestedStorageLocation) return false;
  return row.approved || row.approveStorageLocation === true;
}

export function isProductUnitSizeApproved(row: ProductReviewItem): boolean {
  return row.approved || row.approveUnitSize === true;
}

export function isProductPriceBasisApproved(row: ProductReviewItem): boolean {
  return row.approved || row.approvePriceBasis === true;
}

export function renderReviewMarkdown(review: UnitCleanupReviewFile): string {
  const inventoryNeedsReview = review.inventoryRecommendations.filter(
    (r) => r.needsReview,
  ).length;
  const productNeedsReview = review.productRecommendations.filter(
    (r) => r.needsReview,
  ).length;

  const lines = [
    "# Inventory Unit Cleanup Review",
    "",
    `Generated: ${review.generatedAt}`,
    `Model: ${review.model}`,
    `Allowed units: ${review.allowedUnits.join(", ")}`,
    "",
    "Nothing is approved by default. In the JSON file, set `approved` to `true` for rows you want to include in the SQL migration.",
    "",
    "## Summary",
    "",
    `- Inventory rows: ${review.inventoryRecommendations.length}`,
    `- Inventory rows needing review: ${inventoryNeedsReview}`,
    `- Product rows: ${review.productRecommendations.length}`,
    `- Product rows needing review: ${productNeedsReview}`,
    "",
    "## Inventory Recommendations",
    "",
    "| Approved | Review | ID | Ingredient | Stock | Recipe | Confidence | Reason |",
    "| --- | --- | ---: | --- | --- | --- | ---: | --- |",
  ];

  for (const row of review.inventoryRecommendations) {
    lines.push(
      [
        row.approved ? "yes" : "no",
        row.needsReview ? "yes" : "no",
        String(row.inventoryItemId),
        md(row.ingredientName),
        md(`${dash(row.currentStockUnit)} -> ${row.suggestedStockUnit}`),
        md(`${dash(row.currentRecipeUnit)} -> ${row.suggestedRecipeUnit}`),
        row.confidence.toFixed(2),
        md(row.reason),
      ].join(" | "),
    );
  }

  lines.push(
    "",
    "## Product Recommendations",
    "",
    "| Approved | Review | ID | Ingredient | Product | Size | Price Basis | Confidence | Reason |",
    "| --- | --- | ---: | --- | --- | --- | --- | ---: | --- |",
  );

  for (const row of review.productRecommendations) {
    lines.push(
      [
        row.approved ? "yes" : "no",
        row.needsReview ? "yes" : "no",
        String(row.productId),
        md(row.ingredientName),
        md([row.brand, row.productName].filter(Boolean).join(" ")),
        md(
          `${formatAmountUnit(
            row.currentUnitSizeAmount,
            row.currentUnitSizeUnit,
          )} -> ${formatAmountUnit(
            row.suggestedUnitSizeAmount,
            row.suggestedUnitSizeUnit,
          )}`,
        ),
        md(
          `${formatPriceBasis(
            row.currentPriceBasis,
            row.currentPriceBasisAmount,
            row.currentPriceBasisUnit,
          )} -> ${formatPriceBasis(
            row.suggestedPriceBasis,
            row.suggestedPriceBasisAmount,
            row.suggestedPriceBasisUnit,
          )}`,
        ),
        row.confidence.toFixed(2),
        md(row.reason),
      ].join(" | "),
    );
  }

  return `${lines.join("\n")}\n`;
}

function parseInventoryRecommendation(
  item: unknown,
  index: number,
): ParsedInventoryRecommendation {
  if (!isPlainObject(item)) {
    throw new Error(`inventoryRecommendations[${index}] must be an object.`);
  }
  return {
    inventoryItemId: parsePositiveInteger(
      item.inventoryItemId,
      `inventoryRecommendations[${index}].inventoryItemId`,
    ),
    stockUnit: parseRequiredUnit(
      item.stockUnit,
      `inventoryRecommendations[${index}].stockUnit`,
    ),
    recipeUnit: parseRequiredUnit(
      item.recipeUnit,
      `inventoryRecommendations[${index}].recipeUnit`,
    ),
    storageLocation: parseStorageLocation(
      item.storageLocation,
      `inventoryRecommendations[${index}].storageLocation`,
    ),
    confidence: parseConfidence(
      item.confidence,
      `inventoryRecommendations[${index}].confidence`,
    ),
    reason: parseReason(item.reason, `inventoryRecommendations[${index}].reason`),
  };
}

function parseStorageLocation(raw: unknown, field: string): StorageLocation {
  if (typeof raw !== "string") {
    throw new Error(`${field} must be a string.`);
  }
  if (!STORAGE_LOCATION_VALUES.has(raw)) {
    throw new Error(
      `${field} must be one of: ${STORAGE_LOCATIONS.join(", ")}. Got "${raw}".`,
    );
  }
  return raw as StorageLocation;
}

function parseProductRecommendation(
  item: unknown,
  index: number,
): ParsedProductRecommendation {
  if (!isPlainObject(item)) {
    throw new Error(`productRecommendations[${index}] must be an object.`);
  }
  return {
    productId: parsePositiveInteger(
      item.productId,
      `productRecommendations[${index}].productId`,
    ),
    unitSizeAmount: parseOptionalPositiveNumber(
      item.unitSizeAmount,
      `productRecommendations[${index}].unitSizeAmount`,
    ),
    unitSizeUnit: parseOptionalUnit(
      item.unitSizeUnit,
      `productRecommendations[${index}].unitSizeUnit`,
    ),
    priceBasis: parseOptionalPriceBasis(
      item.priceBasis,
      `productRecommendations[${index}].priceBasis`,
    ),
    priceBasisAmount: parseOptionalPositiveNumber(
      item.priceBasisAmount,
      `productRecommendations[${index}].priceBasisAmount`,
    ),
    priceBasisUnit: parseOptionalUnit(
      item.priceBasisUnit,
      `productRecommendations[${index}].priceBasisUnit`,
    ),
    confidence: parseConfidence(
      item.confidence,
      `productRecommendations[${index}].confidence`,
    ),
    reason: parseReason(item.reason, `productRecommendations[${index}].reason`),
  };
}

function renderInventoryStockUnitUpdateSql(rows: InventoryReviewItem[]): string {
  const values = rows
    .map(
      (row) =>
        `  (${row.inventoryItemId}, ${sqlText(row.suggestedStockUnit)})`,
    )
    .join(",\n");

  return `-- Approved inventory_items.unit updates: ${rows.length}
with updates(id, unit) as (
  values
${values}
)
update public.inventory_items as target
set unit = updates.unit,
    updated_at = now()
from updates
where target.id = updates.id;`;
}

function renderInventoryRecipeUnitUpdateSql(rows: InventoryReviewItem[]): string {
  const values = rows
    .map(
      (row) =>
        `  (${row.inventoryItemId}, ${sqlText(row.suggestedRecipeUnit)})`,
    )
    .join(",\n");

  return `-- Approved inventory_items.recipe_unit updates: ${rows.length}
with updates(id, recipe_unit) as (
  values
${values}
)
update public.inventory_items as target
set recipe_unit = updates.recipe_unit,
    updated_at = now()
from updates
where target.id = updates.id;`;
}

function renderInventoryStorageLocationUpdateSql(
  rows: InventoryReviewItem[],
): string {
  const values = rows
    .map((row) => {
      const location = row.suggestedStorageLocation as StorageLocation;
      return `  (${row.inventoryItemId}, ${sqlText(location)})`;
    })
    .join(",\n");

  return `-- Approved inventory_items.storage_location updates: ${rows.length}
with updates(id, storage_location) as (
  values
${values}
)
update public.inventory_items as target
set storage_location = updates.storage_location,
    updated_at = now()
from updates
where target.id = updates.id;`;
}

function renderProductUnitSizeUpdateSql(rows: ProductReviewItem[]): string {
  const values = rows
    .map(
      (row) =>
        `  (${row.productId}, ${sqlNumeric(
          row.suggestedUnitSizeAmount,
        )}, ${sqlNullableText(row.suggestedUnitSizeUnit)})`,
    )
    .join(",\n");

  return `-- Approved ingredient_products unit-size updates: ${rows.length}
with updates(
  id,
  unit_size_amount,
  unit_size_unit
) as (
  values
${values}
)
update public.ingredient_products as target
set unit_size_amount = updates.unit_size_amount,
    unit_size_unit = updates.unit_size_unit,
    updated_at = now()
from updates
where target.id = updates.id;`;
}

function renderProductPriceBasisUpdateSql(rows: ProductReviewItem[]): string {
  const values = rows
    .map(
      (row) =>
        `  (${row.productId}, ${sqlNullableText(
          row.suggestedPriceBasis,
        )}, ${sqlNumeric(row.suggestedPriceBasisAmount)}, ${sqlNullableText(
          row.suggestedPriceBasisUnit,
        )})`,
    )
    .join(",\n");

  return `-- Approved ingredient_products price-basis updates: ${rows.length}
with updates(
  id,
  price_basis,
  price_basis_amount,
  price_basis_unit
) as (
  values
${values}
)
update public.ingredient_products as target
set price_basis = updates.price_basis,
    price_basis_amount = updates.price_basis_amount,
    price_basis_unit = updates.price_basis_unit,
    updated_at = now()
from updates
where target.id = updates.id;`;
}

function assertExactIds(
  label: string,
  actualIds: number[],
  expectedIds: readonly number[],
) {
  const actual = new Set(actualIds);
  const expected = new Set(expectedIds);

  if (actual.size !== actualIds.length) {
    throw new Error(`${label} contains duplicate IDs.`);
  }
  if (actual.size !== expected.size) {
    throw new Error(
      `${label} returned ${actual.size} rows for ${expected.size} expected rows.`,
    );
  }
  for (const id of expected) {
    if (!actual.has(id)) {
      throw new Error(`${label} missing expected ID ${id}.`);
    }
  }
}

function parseRequiredUnit(raw: unknown, field: string): string {
  if (typeof raw !== "string") {
    throw new Error(`${field} must be a string.`);
  }
  const unit = normalizeIngredientUnitForStorage(raw);
  if (!INGREDIENT_UNIT_VALUES.has(unit)) {
    throw new Error(`${field} must be one of the allowed units. Got "${raw}".`);
  }
  return unit;
}

function parseOptionalUnit(raw: unknown, field: string): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw !== "string") {
    throw new Error(`${field} must be a string or null.`);
  }
  const unit = normalizeIngredientUnitForStorage(raw);
  if (!INGREDIENT_UNIT_VALUES.has(unit)) {
    throw new Error(`${field} must be one of the allowed units. Got "${raw}".`);
  }
  return unit;
}

function parseOptionalPriceBasis(
  raw: unknown,
  field: string,
): ProductPriceBasisSuggestion | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw !== "string" || !PRODUCT_PRICE_BASIS_VALUES.has(raw)) {
    throw new Error(`${field} must be package, weight, unit, or null.`);
  }
  return raw as ProductPriceBasisSuggestion;
}

function parsePositiveInteger(raw: unknown, field: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${field} must be a positive integer.`);
  }
  return n;
}

function parseOptionalPositiveNumber(raw: unknown, field: string): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${field} must be a positive number or null.`);
  }
  return n;
}

function parseConfidence(raw: unknown, field: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new Error(`${field} must be a number from 0 to 1.`);
  }
  return n;
}

function parseReason(raw: unknown, field: string): string {
  if (typeof raw !== "string") {
    throw new Error(`${field} must be a string.`);
  }
  const reason = raw.trim();
  if (!reason) {
    throw new Error(`${field} must not be blank.`);
  }
  return reason;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sqlText(value: string): string {
  return `${sqlString(value)}::text`;
}

function sqlNullableText(value: string | null): string {
  return value === null ? "null::text" : sqlText(value);
}

function sqlNumeric(value: number | null): string {
  return value === null ? "null::numeric" : `${value}::numeric`;
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function md(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function dash(value: string | null): string {
  return value ?? "-";
}

function formatAmountUnit(amount: number | null, unit: string | null): string {
  if (amount == null && unit == null) return "-";
  if (amount == null) return unit ?? "-";
  return unit ? `${amount} ${unit}` : String(amount);
}

function formatPriceBasis(
  basis: ProductPriceBasisSuggestion | null,
  amount: number | null,
  unit: string | null,
): string {
  if (!basis) return "-";
  if (basis === "package") return "package";
  return [basis, formatAmountUnit(amount, unit)].join(" ");
}
