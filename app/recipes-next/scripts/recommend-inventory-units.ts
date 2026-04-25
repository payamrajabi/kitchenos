/**
 * One-time inventory unit cleanup helper.
 *
 * Three modes:
 *   1. recommend  - call the model and write a review file. Nothing approved.
 *   2. auto       - call the model, auto-approve every row, write SQL, print
 *                   the SQL block to stdout for paste-into-Supabase.
 *   3. sql        - turn an approved review JSON file into a SQL migration.
 *
 * All modes read live Supabase data. They never write to Supabase.
 *
 * Recommend (with review):
 *   UNIT_CLEANUP_BATCH_SIZE=3 UNIT_CLEANUP_MODEL=gpt-5 \
 *     npx tsx scripts/recommend-inventory-units.ts recommend
 *
 * Auto (no review, prints final SQL):
 *   UNIT_CLEANUP_BATCH_SIZE=3 UNIT_CLEANUP_MODEL=gpt-5 \
 *     npx tsx scripts/recommend-inventory-units.ts auto
 *
 * SQL from an approved review file:
 *   npx tsx scripts/recommend-inventory-units.ts sql --input scripts/output/<review>.json
 */

import { createClient } from "@supabase/supabase-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createReviewFile,
  generateApprovedUnitCleanupSql,
  LOW_CONFIDENCE_THRESHOLD,
  markNeedsReview,
  parseUnitCleanupModelResponse,
  renderReviewMarkdown,
  STORAGE_LOCATIONS,
  type InventoryReviewItem,
  type ProductPriceBasisSuggestion,
  type ProductReviewItem,
  type UnitCleanupReviewFile,
} from "../src/lib/inventory-unit-cleanup/recommendations";
import { INGREDIENT_UNITS } from "../src/lib/unit-mapping";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_DIR = path.join(SCRIPT_DIR, "output");
const DEFAULT_SQL_OUTPUT = path.join(
  SCRIPT_DIR,
  "..",
  "..",
  "database",
  "supabase_migration_inventory_unit_cleanup.sql",
);
const DEFAULT_OPENAI_TIMEOUT_MS = 240_000;
const DEFAULT_MAX_RETRIES = 2;

const SYSTEM_PROMPT = `You are cleaning KitchenOS inventory units.

For every inventory item, answer these three questions:
1. How do people typically refer to this item when stocking it or buying it from the grocery store?
   That value goes into "stockUnit" (e.g. a "head" of lettuce, a "jar" of maple syrup, a "bag" of pecans).
2. How do people refer to this item in their recipes?
   That value goes into "recipeUnit" (e.g. "cup" of chopped lettuce, "tbsp" of maple syrup, "cup" of pecans).
3. Where do people typically store this item when it's actively in use at home?
   That value goes into "storageLocation". Options:
     - "Freezer": items that must stay frozen (ice cream, frozen vegetables, frozen meat, frozen dough).
     - "Fridge": items that must stay cold to be safe or fresh (tofu, dairy, fresh meat, opened sauces, fresh produce that wilts at room temp).
     - "Shallow Pantry": dry goods, spices, oils, vinegars, canned goods, baking ingredients, packaged shelf-stable foods, and produce that keeps at room temperature.
     - "Deep Pantry": only choose this when the user has clearly already filed the item under "Deep Pantry" in their existing inventory.
     - "Other": only choose this if none of the above apply.
   Default to "Shallow Pantry" for shelf-stable items if you are unsure.

Use only these allowed units:
${INGREDIENT_UNITS.join(", ")}

Storage location must be one of: ${STORAGE_LOCATIONS.join(", ")}.

For product rows, unitSizeAmount/unitSizeUnit describe the package contents, not the stock count.
Examples: a 500 g bag of rice is 500 + "g"; a 946 ml carton of soy milk is 946 + "ml"; a dozen eggs is 12 + "count".

Rules:
- Return one inventory recommendation for every supplied inventory item.
- Return one product recommendation for every supplied product row.
- Always choose stockUnit and recipeUnit from the allowed units, and storageLocation from the allowed list.
- For product unit size, use null when the amount or unit cannot be inferred from the current row/product name.
- Preserve current product price basis fields when they look reasonable; use null when no price basis is meaningful.
- Use confidence from 0 to 1. Lower confidence for uncertain culinary or package guesses.
- Keep reasons short and plain English.

Return ONLY valid JSON with this exact shape:
{
  "inventoryRecommendations": [
    {
      "inventoryItemId": 123,
      "stockUnit": "bottle",
      "recipeUnit": "ml",
      "storageLocation": "Fridge",
      "confidence": 0.92,
      "reason": "Soy sauce is bought as a bottle, measured by volume, kept cold once opened."
    }
  ],
  "productRecommendations": [
    {
      "productId": 456,
      "unitSizeAmount": 500,
      "unitSizeUnit": "g",
      "priceBasis": "package",
      "priceBasisAmount": null,
      "priceBasisUnit": null,
      "confidence": 0.88,
      "reason": "Product name indicates a 500 g package."
    }
  ]
}`;

type IngredientRow = {
  id: number;
  name: string;
  variant: string | null;
  parent_ingredient_id: number | null;
  taxonomy_subcategory: string | null;
  food_type: string | null;
  default_units: string[] | string | null;
  packaged_common: boolean | number | null;
  is_composite: boolean | number | null;
};

type InventoryRow = {
  id: number;
  ingredient_id: number;
  storage_location: string;
  quantity: number | null;
  unit: string | null;
  recipe_unit: string | null;
  notes: string | null;
};

type ProductRow = {
  id: number;
  ingredient_id: number;
  rank: number;
  name: string;
  brand: string | null;
  barcode: string | null;
  notes: string | null;
  price_basis: ProductPriceBasisSuggestion | null;
  price_basis_amount: number | null;
  price_basis_unit: string | null;
  unit_size_amount: number | null;
  unit_size_unit: string | null;
};

type InventoryContext = {
  inventoryItemId: number;
  ingredientId: number;
  ingredientName: string;
  parentIngredientName: string | null;
  variant: string | null;
  taxonomySubcategory: string | null;
  foodType: string | null;
  defaultUnits: string[];
  packagedCommon: boolean;
  isComposite: boolean;
  storageLocation: string;
  quantity: number | null;
  currentStockUnit: string | null;
  currentRecipeUnit: string | null;
  notes: string | null;
};

type ProductContext = {
  productId: number;
  ingredientId: number;
  ingredientName: string;
  rank: number;
  productName: string;
  brand: string | null;
  barcode: string | null;
  notes: string | null;
  currentUnitSizeAmount: number | null;
  currentUnitSizeUnit: string | null;
  currentPriceBasis: ProductPriceBasisSuggestion | null;
  currentPriceBasisAmount: number | null;
  currentPriceBasisUnit: string | null;
};

type LoadedData = {
  inventory: InventoryContext[];
  products: ProductContext[];
};

function requiredEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

function argValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function parseBatchSize(): number {
  const raw = process.env.UNIT_CLEANUP_BATCH_SIZE?.trim();
  if (!raw) return 3;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0 || n > 100) {
    throw new Error("UNIT_CLEANUP_BATCH_SIZE must be an integer from 1 to 100.");
  }
  return n;
}

function parsePositiveIntegerEnv(input: {
  name: string;
  defaultValue: number;
  maxValue: number;
}): number {
  const raw = process.env[input.name]?.trim();
  if (!raw) return input.defaultValue;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0 || n > input.maxValue) {
    throw new Error(
      `${input.name} must be an integer from 1 to ${input.maxValue}.`,
    );
  }
  return n;
}

async function loadInventoryData(): Promise<LoadedData> {
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const [inventoryResult, ingredientResult, productResult] = await Promise.all([
    supabase
      .from("inventory_items")
      .select("id, ingredient_id, storage_location, quantity, unit, recipe_unit, notes")
      .order("id", { ascending: true }),
    supabase
      .from("ingredients")
      .select(
        "id, name, variant, parent_ingredient_id, taxonomy_subcategory, food_type, default_units, packaged_common, is_composite",
      )
      .order("id", { ascending: true }),
    supabase
      .from("ingredient_products")
      .select(
        "id, ingredient_id, rank, name, brand, barcode, notes, price_basis, price_basis_amount, price_basis_unit, unit_size_amount, unit_size_unit",
      )
      .order("ingredient_id", { ascending: true })
      .order("rank", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  if (inventoryResult.error) {
    throw new Error(`Could not load inventory_items: ${inventoryResult.error.message}`);
  }
  if (ingredientResult.error) {
    throw new Error(`Could not load ingredients: ${ingredientResult.error.message}`);
  }
  if (productResult.error) {
    throw new Error(`Could not load ingredient_products: ${productResult.error.message}`);
  }

  const ingredients = (ingredientResult.data ?? []) as IngredientRow[];
  const ingredientById = new Map(ingredients.map((row) => [row.id, row]));
  const inventoryRows = (inventoryResult.data ?? []) as InventoryRow[];
  const inventoryIngredientIds = new Set(
    inventoryRows.map((row) => row.ingredient_id),
  );
  const productRows = ((productResult.data ?? []) as ProductRow[]).filter((row) =>
    inventoryIngredientIds.has(row.ingredient_id),
  );

  const inventory = inventoryRows.map((row) => {
    const ingredient = ingredientById.get(row.ingredient_id);
    if (!ingredient) {
      throw new Error(`Inventory item ${row.id} references missing ingredient.`);
    }
    const parent = ingredient.parent_ingredient_id
      ? (ingredientById.get(ingredient.parent_ingredient_id) ?? null)
      : null;
    return {
      inventoryItemId: row.id,
      ingredientId: row.ingredient_id,
      ingredientName: displayIngredientName(ingredient, parent),
      parentIngredientName: parent?.name ?? null,
      variant: ingredient.variant,
      taxonomySubcategory: ingredient.taxonomy_subcategory,
      foodType: ingredient.food_type,
      defaultUnits: parseDefaultUnits(ingredient.default_units),
      packagedCommon: Boolean(ingredient.packaged_common),
      isComposite: Boolean(ingredient.is_composite),
      storageLocation: row.storage_location,
      quantity: row.quantity,
      currentStockUnit: row.unit,
      currentRecipeUnit: row.recipe_unit,
      notes: row.notes,
    } satisfies InventoryContext;
  });

  const products = productRows.map((row) => {
    const ingredient = ingredientById.get(row.ingredient_id);
    if (!ingredient) {
      throw new Error(`Product ${row.id} references missing ingredient.`);
    }
    const parent = ingredient.parent_ingredient_id
      ? (ingredientById.get(ingredient.parent_ingredient_id) ?? null)
      : null;
    return {
      productId: row.id,
      ingredientId: row.ingredient_id,
      ingredientName: displayIngredientName(ingredient, parent),
      rank: row.rank,
      productName: row.name,
      brand: row.brand,
      barcode: row.barcode,
      notes: row.notes,
      currentUnitSizeAmount: row.unit_size_amount,
      currentUnitSizeUnit: row.unit_size_unit,
      currentPriceBasis: normalizePriceBasis(row.price_basis),
      currentPriceBasisAmount: row.price_basis_amount,
      currentPriceBasisUnit: row.price_basis_unit,
    } satisfies ProductContext;
  });

  return { inventory, products };
}

async function generateRecommendationsForBatch(input: {
  apiKey: string;
  model: string;
  timeoutMs: number;
  inventory: InventoryContext[];
  products: ProductContext[];
}) {
  const userContent = JSON.stringify({
    inventoryItems: input.inventory,
    products: input.products,
  });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
    signal: AbortSignal.timeout(input.timeoutMs),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI API error (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error("No response content from the AI model.");

  return parseUnitCleanupModelResponse(raw, {
    inventoryItemIds: input.inventory.map((row) => row.inventoryItemId),
    productIds: input.products.map((row) => row.productId),
  });
}

async function generateRecommendationsForBatchWithRetries(input: {
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
  inventory: InventoryContext[];
  products: ProductContext[];
}) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= input.maxRetries + 1; attempt += 1) {
    try {
      return await generateRecommendationsForBatch(input);
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      if (attempt > input.maxRetries) break;
      console.warn(
        `Batch request failed on attempt ${attempt}; retrying (${message})`,
      );
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

type RunRecommendationsOptions = {
  autoApproveAll: boolean;
};

type RunRecommendationsResult = {
  outputJson: string;
  outputMarkdown: string;
  review: UnitCleanupReviewFile;
};

async function runRecommendations(
  options: RunRecommendationsOptions,
): Promise<RunRecommendationsResult> {
  const model = requiredEnv("UNIT_CLEANUP_MODEL");
  const apiKey = requiredEnv("OPENAI_API_KEY");
  const batchSize = parseBatchSize();
  const timeoutMs = parsePositiveIntegerEnv({
    name: "UNIT_CLEANUP_TIMEOUT_MS",
    defaultValue: DEFAULT_OPENAI_TIMEOUT_MS,
    maxValue: 900_000,
  });
  const maxRetries = parsePositiveIntegerEnv({
    name: "UNIT_CLEANUP_MAX_RETRIES",
    defaultValue: DEFAULT_MAX_RETRIES,
    maxValue: 10,
  });
  const generatedAt = new Date().toISOString();
  const defaultBaseName = `inventory-unit-cleanup-review-${generatedAt.replace(
    /[:.]/g,
    "-",
  )}`;
  const outputJson =
    argValue("--output") ??
    path.join(DEFAULT_OUTPUT_DIR, `${defaultBaseName}.json`);
  const outputMarkdown =
    argValue("--markdown") ??
    outputJson.replace(/\.json$/i, ".md");

  console.log("Loading inventory, ingredient, and product data...");
  const loaded = await loadInventoryData();
  console.log(
    `Loaded ${loaded.inventory.length} inventory row(s) and ${loaded.products.length} product row(s).`,
  );
  console.log(
    `Batch size: ${batchSize}; timeout: ${Math.round(
      timeoutMs / 1000,
    )}s; retries per batch: ${maxRetries}.`,
  );

  const inventoryById = new Map(
    loaded.inventory.map((row) => [row.inventoryItemId, row]),
  );
  const productById = new Map(loaded.products.map((row) => [row.productId, row]));
  const productsByIngredientId = groupProductsByIngredientId(loaded.products);
  const seenProductIds = new Set<number>();
  const inventoryRecommendations: InventoryReviewItem[] = [];
  const productRecommendations: ProductReviewItem[] = [];

  for (let start = 0; start < loaded.inventory.length; start += batchSize) {
    const inventoryBatch = loaded.inventory.slice(start, start + batchSize);
    const ingredientIds = new Set(inventoryBatch.map((row) => row.ingredientId));
    const productBatch = [...ingredientIds].flatMap((ingredientId) =>
      (productsByIngredientId.get(ingredientId) ?? []).filter((product) => {
        if (seenProductIds.has(product.productId)) return false;
        seenProductIds.add(product.productId);
        return true;
      }),
    );

    console.log(
      `Requesting recommendations for inventory rows ${start + 1}-${Math.min(
        start + batchSize,
        loaded.inventory.length,
      )} of ${loaded.inventory.length}...`,
    );

    const parsed = await generateRecommendationsForBatchWithRetries({
      apiKey,
      model,
      timeoutMs,
      maxRetries,
      inventory: inventoryBatch,
      products: productBatch,
    });

    for (const rec of parsed.inventoryRecommendations) {
      const current = inventoryById.get(rec.inventoryItemId);
      if (!current) {
        throw new Error(`Model returned unknown inventory ID ${rec.inventoryItemId}.`);
      }
      inventoryRecommendations.push({
        inventoryItemId: rec.inventoryItemId,
        ingredientId: current.ingredientId,
        ingredientName: current.ingredientName,
        storageLocation: current.storageLocation,
        currentStockUnit: current.currentStockUnit,
        currentRecipeUnit: current.currentRecipeUnit,
        suggestedStockUnit: rec.stockUnit,
        suggestedRecipeUnit: rec.recipeUnit,
        suggestedStorageLocation: rec.storageLocation,
        confidence: rec.confidence,
        needsReview: markNeedsReview(rec.confidence),
        approved: options.autoApproveAll,
        reason: rec.reason,
      });
    }

    for (const rec of parsed.productRecommendations) {
      const current = productById.get(rec.productId);
      if (!current) {
        throw new Error(`Model returned unknown product ID ${rec.productId}.`);
      }
      productRecommendations.push({
        productId: rec.productId,
        ingredientId: current.ingredientId,
        ingredientName: current.ingredientName,
        productName: current.productName,
        brand: current.brand,
        currentUnitSizeAmount: current.currentUnitSizeAmount,
        currentUnitSizeUnit: current.currentUnitSizeUnit,
        suggestedUnitSizeAmount: rec.unitSizeAmount,
        suggestedUnitSizeUnit: rec.unitSizeUnit,
        currentPriceBasis: current.currentPriceBasis,
        currentPriceBasisAmount: current.currentPriceBasisAmount,
        currentPriceBasisUnit: current.currentPriceBasisUnit,
        suggestedPriceBasis: rec.priceBasis,
        suggestedPriceBasisAmount: rec.priceBasisAmount,
        suggestedPriceBasisUnit: rec.priceBasisUnit,
        confidence: rec.confidence,
        needsReview: markNeedsReview(rec.confidence),
        approved: options.autoApproveAll,
        reason: rec.reason,
      });
    }

    await writeReviewArtifacts({
      outputJson,
      outputMarkdown,
      generatedAt,
      model,
      inventoryRecommendations,
      productRecommendations,
    });
    console.log(
      `Checkpoint saved with ${inventoryRecommendations.length} inventory recommendation(s).`,
    );
  }

  const review = await writeReviewArtifacts({
    outputJson,
    outputMarkdown,
    generatedAt,
    model,
    inventoryRecommendations,
    productRecommendations,
  });

  return { outputJson, outputMarkdown, review };
}

async function recommend() {
  const result = await runRecommendations({ autoApproveAll: false });
  console.log("\n--- Review files written ---");
  console.log(`JSON    : ${result.outputJson}`);
  console.log(`Markdown: ${result.outputMarkdown}`);
  console.log(
    `Low confidence threshold: ${LOW_CONFIDENCE_THRESHOLD}. Nothing is approved by default.`,
  );
}

async function autoRun() {
  const result = await runRecommendations({ autoApproveAll: true });
  const sql = generateApprovedUnitCleanupSql(result.review);
  const sqlOutputPath = argValue("--output") ?? DEFAULT_SQL_OUTPUT;
  await mkdir(path.dirname(sqlOutputPath), { recursive: true });
  await writeFile(sqlOutputPath, sql);

  console.log("\n--- Auto-approved review files written ---");
  console.log(`JSON    : ${result.outputJson}`);
  console.log(`Markdown: ${result.outputMarkdown}`);
  console.log(`SQL file: ${sqlOutputPath}`);
  console.log(
    `\n=================== BEGIN SQL (paste into Supabase SQL editor) ===================`,
  );
  console.log(sql);
  console.log(
    `=================== END SQL ====================================================`,
  );
}


async function writeReviewArtifacts(input: {
  outputJson: string;
  outputMarkdown: string;
  generatedAt: string;
  model: string;
  inventoryRecommendations: InventoryReviewItem[];
  productRecommendations: ProductReviewItem[];
}): Promise<UnitCleanupReviewFile> {
  const review = createReviewFile({
    generatedAt: input.generatedAt,
    model: input.model,
    inventoryRecommendations: [...input.inventoryRecommendations].sort(
      (a, b) => a.inventoryItemId - b.inventoryItemId,
    ),
    productRecommendations: [...input.productRecommendations].sort(
      (a, b) => a.productId - b.productId,
    ),
  });

  await mkdir(path.dirname(input.outputJson), { recursive: true });
  await mkdir(path.dirname(input.outputMarkdown), { recursive: true });
  await writeFile(input.outputJson, `${JSON.stringify(review, null, 2)}\n`);
  await writeFile(input.outputMarkdown, renderReviewMarkdown(review));

  return review;
}

async function generateSql() {
  const inputPath = argValue("--input");
  if (!inputPath) {
    throw new Error("SQL mode requires --input <review-json-path>.");
  }
  const outputPath = argValue("--output") ?? DEFAULT_SQL_OUTPUT;
  const raw = await readFile(inputPath, "utf8");
  const review = JSON.parse(raw) as UnitCleanupReviewFile;
  const sql = generateApprovedUnitCleanupSql(review);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, sql);

  const inventoryApproved = review.inventoryRecommendations.filter(
    (row) => row.approved,
  ).length;
  const productsApproved = review.productRecommendations.filter(
    (row) => row.approved,
  ).length;

  console.log("\n--- SQL written ---");
  console.log(`Output: ${outputPath}`);
  console.log(`Approved inventory rows: ${inventoryApproved}`);
  console.log(`Approved product rows  : ${productsApproved}`);
}

function groupProductsByIngredientId(products: ProductContext[]) {
  const grouped = new Map<number, ProductContext[]>();
  for (const product of products) {
    const rows = grouped.get(product.ingredientId) ?? [];
    rows.push(product);
    grouped.set(product.ingredientId, rows);
  }
  return grouped;
}

function displayIngredientName(
  ingredient: IngredientRow,
  parent: IngredientRow | null,
): string {
  if (parent && ingredient.variant) {
    return `${parent.name} - ${ingredient.variant}`;
  }
  if (ingredient.variant && !ingredient.name.includes(ingredient.variant)) {
    return `${ingredient.name} - ${ingredient.variant}`;
  }
  return ingredient.name;
}

function parseDefaultUnits(raw: IngredientRow["default_units"]): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return raw
      .split(",")
      .map((unit) => unit.trim())
      .filter(Boolean);
  }
}

function normalizePriceBasis(
  raw: string | null,
): ProductPriceBasisSuggestion | null {
  if (raw === "package" || raw === "weight" || raw === "unit") return raw;
  return null;
}

async function main() {
  const command = process.argv[2] && !process.argv[2].startsWith("--")
    ? process.argv[2]
    : "recommend";

  if (command === "recommend") {
    await recommend();
    return;
  }
  if (command === "auto") {
    await autoRun();
    return;
  }
  if (command === "sql") {
    await generateSql();
    return;
  }

  throw new Error(
    `Unknown command "${command}". Use recommend, auto, or sql.`,
  );
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
