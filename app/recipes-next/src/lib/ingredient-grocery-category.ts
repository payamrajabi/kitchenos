/**
 * Store-aisle style categories for ingredients (inventory + shopping).
 * Distinct from `ingredients.category`, which stores fridge / freezer / pantry hints.
 */

export const INGREDIENT_GROCERY_CATEGORIES = [
  "Produce",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Bakery & Bread",
  "Deli & Prepared Foods",
  "Frozen",
  "Pantry",
  "Snacks",
  "Beverages",
  "Breakfast & Cereal",
] as const;

export type IngredientGroceryCategory =
  (typeof INGREDIENT_GROCERY_CATEGORIES)[number];

const CATEGORY_ORDER = new Map(
  INGREDIENT_GROCERY_CATEGORIES.map((c, i) => [c, i]),
);

export function isIngredientGroceryCategory(
  value: string | null | undefined,
): value is IngredientGroceryCategory {
  return (
    value != null &&
    CATEGORY_ORDER.has(value as IngredientGroceryCategory)
  );
}

/** Sort key for lists (unknown / invalid → end). */
export function groceryCategorySortIndex(
  value: string | null | undefined,
): number {
  if (!value) return INGREDIENT_GROCERY_CATEGORIES.length;
  return CATEGORY_ORDER.get(value as IngredientGroceryCategory) ?? INGREDIENT_GROCERY_CATEGORIES.length;
}

type Rule = { test: RegExp; category: IngredientGroceryCategory };

/** First match wins (more specific rules first). */
const INFER_RULES: Rule[] = [
  { test: /\b(frozen)\b/i, category: "Frozen" },
  { test: /\bice cream\b/i, category: "Frozen" },

  { test: /\b(avocado oil|olive oil|vegetable oil|canola oil|sesame oil|grapeseed oil|grape seed oil|coconut oil|sunflower oil|oil spray|spray oil|cooking oil)\b/i, category: "Pantry" },
  { test: /\b(coconut milk)\b/i, category: "Pantry" },
  { test: /\b(peanut butter|almond butter|nut butter|apple butter|cookie butter)\b/i, category: "Pantry" },

  { test: /\b(almond milk|oat milk|soy milk|rice milk|cashew milk|hemp milk|coconut water)\b/i, category: "Beverages" },
  { test: /\b(beer|wine|brandy|whiskey|whisky|vodka|rum|gin|liqueur|tequila|mezcal|sake|champagne|prosecco|cider|spirits?)\b/i, category: "Beverages" },
  { test: /\b(juice|soda|pop|cola|tonic|seltzer|kombucha|sports drink|energy drink)\b/i, category: "Beverages" },
  { test: /\b(coffee|espresso|latte|cappuccino)\b/i, category: "Beverages" },
  { test: /\btea\b/i, category: "Beverages" },
  { test: /\b(water)\b/i, category: "Beverages" },

  { test: /\b(granola bar|protein bar|chips|cracker|crackers|popcorn|pretzel|candy|chocolate bar|jerky|trail mix)\b/i, category: "Snacks" },

  { test: /\b(cereal|granola|oatmeal|oats\b|pancake|waffle|breakfast bar|maple syrup|pancake mix|waffle mix)\b/i, category: "Breakfast & Cereal" },
  { test: /\bsyrup\b/i, category: "Breakfast & Cereal" },

  { test: /\b(rotisserie|grab-and-go|grab and go|prepared salad|deli salad|deli sandwich)\b/i, category: "Deli & Prepared Foods" },
  { test: /\bdeli\b/i, category: "Deli & Prepared Foods" },

  { test: /\b(bread|bagel|bun|croissant|muffin|tortilla|pita|naan|roll|pastry|donut|doughnut|cupcake|brownie)\b/i, category: "Bakery & Bread" },
  { test: /\b(cookie|cookies|cake)\b/i, category: "Bakery & Bread" },

  { test: /\b(chicken|beef|pork|lamb|turkey|duck|veal|goat|salmon|tuna|cod|halibut|trout|mackerel|sardine|anchovy|fish|seafood|shrimp|prawn|lobster|crab|scallop|mussel|clam|oyster|steak|ground beef|ground pork|ground turkey|bacon|sausage|ribs|cutlet|cutlets|breast|thigh|drumstick|tenderloin|filet|fillet|poultry)\b/i, category: "Meat & Seafood" },

  { test: /\b(milk|cream|yogurt|cheese|butter(?!\s+oil)|sour cream|kefir|half and half|heavy cream|egg\b|eggs|custard|ricotta|mozzarella|cheddar|parmesan|feta|ghee|cottage cheese)\b/i, category: "Dairy & Eggs" },

  { test: /\b(apple|apricot|avocado|banana|berries|berry|cherry|grape|citrus|orange|lemon|lime|melon|peach|pear|plum|pineapple|mango|kiwi|fig|date|papaya|nectarine|blackberry|blueberry|strawberry|strawberries|raspberry|raspberries|cranberry|cranberries)\b/i, category: "Produce" },
  { test: /\b(bell pepper|sweet pepper|green pepper|red pepper|yellow pepper|arugula|beet|broccoli|brussels|cabbage|carrot|cauliflower|celery|cucumber|eggplant|garlic|ginger|green bean|jalape|kale|leek|lettuce|mushroom|onion|parsnip|potato|pumpkin|radish|shallot|spinach|squash|sweet potato|tomato|turnip|zucchini)\b/i, category: "Produce" },
  { test: /\b(basil|cilantro|parsley|rosemary|thyme|oregano|mint|dill|chive|scallion|green onion|spring onion|herb)\b/i, category: "Produce" },
  { test: /\b(salad mix|mixed greens|baby spinach)\b/i, category: "Produce" },

  { test: /\b(flour|sugar|baking powder|baking soda|cornstarch|yeast|cornmeal|starch)\b/i, category: "Pantry" },
  { test: /\b(oil|vinegar|mayo|mayonnaise|mustard|ketchup|relish|salsa|hot sauce|soy sauce|fish sauce|worcestershire|broth|stock|bouillon|tamari)\b/i, category: "Pantry" },
  { test: /\b(peanut butter|almond butter|nut butter|tahini|jam|jelly|preserves|honey)\b/i, category: "Pantry" },
  { test: /\b(pasta|noodle|spaghetti|penne|rice|quinoa|couscous|lentil|chickpea|beans?)\b/i, category: "Pantry" },
  { test: /\b(canned|coconut milk)\b/i, category: "Pantry" },
  { test: /\b(black pepper|white pepper|peppercorn|paprika|cumin|cinnamon|spice mix|seasoning|turmeric|nutmeg|cloves?|oregano)\b/i, category: "Pantry" },
  { test: /\b(kosher salt|sea salt|table salt|salt)\b/i, category: "Pantry" },
];

/**
 * Best-effort category from the ingredient display name (and optional variant names).
 */
export function inferGroceryCategoryFromName(name: string): IngredientGroceryCategory {
  const n = name.trim();
  if (!n) return "Pantry";
  const lower = n.toLowerCase();
  for (const { test, category } of INFER_RULES) {
    if (test.test(lower)) return category;
  }
  return "Pantry";
}
