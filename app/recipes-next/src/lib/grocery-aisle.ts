/**
 * Maps ingredient metadata to common grocery-store aisle section headings.
 * Used for shopping list grouping (Reminders-style sections).
 */

export const GROCERY_AISLE_ORDER = [
  "Produce",
  "Bakery & Cereals",
  "Deli",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Frozen",
  "Snacks & Candy",
  "Beverages",
  "Condiments & Sauces",
  "Spices & Seasonings",
  "Oils & Vinegars",
  "Pantry",
  "International",
  "Household",
  "Other",
] as const;

export type GroceryAisle = (typeof GROCERY_AISLE_ORDER)[number];

export function groceryAisleSortIndex(aisle: string): number {
  const i = GROCERY_AISLE_ORDER.indexOf(aisle as GroceryAisle);
  return i === -1 ? GROCERY_AISLE_ORDER.length : i;
}

function normalizeCategory(raw: string | null | undefined): string {
  return (raw ?? "")
    .trim()
    .replace(/\?+$/g, "")
    .trim()
    .toLowerCase();
}

function mapCategoryString(cat: string): GroceryAisle | null {
  if (!cat) return null;

  if (
    cat === "produce" ||
    cat.includes("fruit") ||
    cat.includes("vegetable") ||
    cat.includes("herb") ||
    cat === "fresh"
  ) {
    return "Produce";
  }
  if (
    cat.includes("bakery") ||
    cat.includes("bread") ||
    cat.includes("cereal") ||
    cat === "breads & cereals"
  ) {
    return "Bakery & Cereals";
  }
  if (cat.includes("deli")) return "Deli";
  if (
    cat.includes("meat") ||
    cat.includes("seafood") ||
    cat.includes("poultry") ||
    cat.includes("fish") ||
    cat.includes("butcher")
  ) {
    return "Meat & Seafood";
  }
  if (
    cat.includes("dairy") ||
    cat.includes("milk") ||
    cat.includes("cheese") ||
    cat.includes("egg") ||
    cat === "fridge" ||
    cat.startsWith("fridge")
  ) {
    return "Dairy & Eggs";
  }
  if (cat.includes("freezer") || cat === "frozen") return "Frozen";
  if (cat.includes("snack") || cat.includes("candy")) return "Snacks & Candy";
  if (
    cat.includes("beverage") ||
    cat.includes("drink") ||
    cat.includes("juice") ||
    cat.includes("soda") ||
    cat.includes("water")
  ) {
    return "Beverages";
  }
  if (
    cat.includes("condiment") ||
    cat.includes("sauce") ||
    cat.includes("dressing") ||
    cat.includes("ketchup") ||
    cat.includes("mustard")
  ) {
    return "Condiments & Sauces";
  }
  if (
    cat.includes("spice") ||
    cat.includes("seasoning") ||
    cat.includes("baking") ||
    cat.includes("extract")
  ) {
    return "Spices & Seasonings";
  }
  if (cat.includes("oil") || cat.includes("vinegar")) return "Oils & Vinegars";
  if (
    cat.includes("pantry") ||
    cat.includes("canned") ||
    cat.includes("dry goods") ||
    cat.includes("pasta") ||
    cat.includes("rice") ||
    cat.includes("bean")
  ) {
    return "Pantry";
  }
  if (cat.includes("international") || cat.includes("ethnic")) {
    return "International";
  }
  if (
    cat.includes("cleaning") ||
    cat.includes("laundry") ||
    cat.includes("household") ||
    cat.includes("paper")
  ) {
    return "Household";
  }
  if (cat === "other") return "Other";

  return null;
}

/** Keyword → aisle; first match wins (order = specificity). */
const NAME_KEYWORDS: { test: RegExp; aisle: GroceryAisle }[] = [
  { test: /\b(lettuce|spinach|kale|arugula|pear|pears|apple|apples|banana|berries|berry|orange|lemon|lime|avocado|tomato|onion|garlic|potato|carrot|celery|cucumber|pepper|broccoli|cauliflower|mushroom|herb|cilantro|parsley|basil|ginger|scallion|green onion)\b/i, aisle: "Produce" },
  { test: /\b(bread|bagel|tortilla|croissant|muffin|cereal|oatmeal|oats|granola)\b/i, aisle: "Bakery & Cereals" },
  { test: /\b(chicken|beef|pork|lamb|turkey|salmon|tuna|shrimp|fish|seafood|steak|ground beef|bacon|sausage)\b/i, aisle: "Meat & Seafood" },
  { test: /\b(butter|milk|cream|cheese|yogurt|sour cream|egg|eggs|mayonnaise)\b/i, aisle: "Dairy & Eggs" },
  { test: /\b(ice cream|frozen)\b/i, aisle: "Frozen" },
  { test: /\b(chips|cracker|pretzel|popcorn|candy|chocolate bar)\b/i, aisle: "Snacks & Candy" },
  { test: /\b(juice|soda|water|coffee|tea|beer|wine)\b/i, aisle: "Beverages" },
  { test: /\b(ketchup|mustard|mayo|relish|salsa|hot sauce|soy sauce|bbq sauce|dressing)\b/i, aisle: "Condiments & Sauces" },
  { test: /\b(olive oil|vegetable oil|canola oil|sesame oil|coconut oil|vinegar)\b/i, aisle: "Oils & Vinegars" },
  { test: /\b(salt|pepper|paprika|cumin|cinnamon|vanilla|nutmeg|oregano|thyme|rosemary|spice|seasoning|extract)\b/i, aisle: "Spices & Seasonings" },
  { test: /\b(flour|sugar|baking powder|baking soda|cornstarch|yeast|cornmeal)\b/i, aisle: "Pantry" },
  { test: /\b(pasta|rice|quinoa|bean|lentil|canned|broth|stock)\b/i, aisle: "Pantry" },
];

/**
 * Pick a grocery aisle section for display, using ingredient category then name.
 */
export function groceryAisleForIngredient(
  category: string | null | undefined,
  ingredientName: string,
): GroceryAisle {
  const catNorm = normalizeCategory(category);
  const fromCat = mapCategoryString(catNorm);
  if (fromCat) return fromCat;

  const name = ingredientName.trim();
  for (const { test, aisle } of NAME_KEYWORDS) {
    if (test.test(name)) return aisle;
  }

  return "Other";
}
