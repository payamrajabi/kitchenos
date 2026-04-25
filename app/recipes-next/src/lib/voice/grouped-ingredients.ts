import type {
  RecipeIngredientRow,
  RecipeIngredientSectionRow,
} from "@/types/database";

// Smart-grouped order for "gather these ingredients" voice prompting. We sort
// recipe ingredient lines by their ingredient's `grocery_category` so the
// cook moves through the kitchen in one direction (pantry → fridge → freezer
// → produce → protein) instead of zig-zagging.
//
// When `grocery_category` is missing we fall back to a sensible bucket so
// every line lands somewhere; ties within a bucket preserve the original
// recipe order (sections then `line_sort_order`).

const PRIORITY_ORDER: ReadonlyArray<string> = [
  // Pantry-style aisles first — usually cabinet, low effort.
  "pantry",
  "spices",
  "spice",
  "baking",
  "oils",
  "oils & vinegars",
  "condiments",
  "canned",
  "canned goods",
  "grains",
  "grains & pasta",
  "pasta",
  "rice",
  "snacks",
  "international",
  "drinks",
  "beverages",
  // Then refrigerated.
  "dairy",
  "dairy & eggs",
  "eggs",
  "deli",
  // Then frozen.
  "frozen",
  // Then perishables that bruise — keeps you from balancing them on top.
  "produce",
  "fruit",
  "vegetables",
  "herbs",
  "fresh herbs",
  // Then proteins last so they're the last thing pulled out before cooking.
  "meat",
  "meat & seafood",
  "seafood",
  "fish",
  "poultry",
];

function bucketIndex(rawCategory: string | null | undefined): number {
  const value = (rawCategory ?? "").trim().toLowerCase();
  if (!value) return PRIORITY_ORDER.length;
  const exact = PRIORITY_ORDER.indexOf(value);
  if (exact !== -1) return exact;
  // Loose match — recipes coming back from the LLM sometimes use phrases like
  // "Produce — leafy greens"; matching the leading word keeps those grouped.
  for (let i = 0; i < PRIORITY_ORDER.length; i++) {
    if (value.startsWith(PRIORITY_ORDER[i])) return i;
  }
  return PRIORITY_ORDER.length;
}

export type GroupedIngredientLine = {
  /** The recipe_ingredients row id — what the agent passes via set_focus. */
  recipeIngredientId: number;
  /** Display name for the system prompt + on-screen highlight. */
  name: string;
  amount: string | null;
  unit: string | null;
  preparation: string | null;
  isOptional: boolean;
  groceryCategory: string | null;
  inStock: boolean;
  /** Section heading (e.g. "For the Dressing") or null when ungrouped. */
  sectionHeading: string | null;
};

export type GroupedIngredientBucket = {
  category: string;
  lines: GroupedIngredientLine[];
};

type SortInput = {
  recipeIngredients: RecipeIngredientRow[];
  recipeIngredientSections: RecipeIngredientSectionRow[];
  stockedIds: ReadonlySet<number>;
};

/**
 * Walk the recipe's ingredient lines once, slot each into a grocery bucket,
 * and return the buckets in priority order. Within each bucket, the order
 * the recipe wrote them in is preserved so siblings stay together.
 *
 * Reads `grocery_category` and the canonical name from the joined
 * `ingredients` row attached to each `RecipeIngredientRow` (loaded by
 * `lib/load-recipe-detail.ts`).
 */
export function groupIngredientsForVoice({
  recipeIngredients,
  recipeIngredientSections,
  stockedIds,
}: SortInput): GroupedIngredientBucket[] {
  const sectionLookup = new Map<string, RecipeIngredientSectionRow>();
  for (const section of recipeIngredientSections) {
    sectionLookup.set(section.id, section);
  }

  const enriched = recipeIngredients.map((row, index) => {
    const ing = row.ingredients ?? null;
    const name = ing?.name?.trim() || row.display?.trim() || "Ingredient";
    const groceryCategory = ing?.grocery_category ?? null;
    const sectionHeading = row.section_id
      ? sectionLookup.get(row.section_id)?.heading?.trim() || null
      : null;
    const line: GroupedIngredientLine = {
      recipeIngredientId: row.id,
      name,
      amount: row.amount?.trim() || null,
      unit: row.unit?.trim() || null,
      preparation: row.preparation?.trim() || null,
      isOptional: !!row.is_optional,
      groceryCategory,
      inStock: stockedIds.has(row.ingredient_id),
      sectionHeading,
    };
    const bucket = bucketIndex(groceryCategory);
    return { line, bucket, originalOrder: index };
  });

  enriched.sort((a, b) => {
    if (a.bucket !== b.bucket) return a.bucket - b.bucket;
    return a.originalOrder - b.originalOrder;
  });

  const grouped: GroupedIngredientBucket[] = [];
  for (const item of enriched) {
    const label = item.line.groceryCategory?.trim() || "Other";
    const last = grouped[grouped.length - 1];
    if (last && last.category.toLowerCase() === label.toLowerCase()) {
      last.lines.push(item.line);
    } else {
      grouped.push({ category: label, lines: [item.line] });
    }
  }
  return grouped;
}
