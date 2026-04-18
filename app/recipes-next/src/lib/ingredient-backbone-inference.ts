/**
 * Best-effort inference of "ingredient backbone" metadata from an ingredient's
 * display name (plus, where helpful, its grocery category).
 *
 * These are the same rules expressed in the one-time SQL backfill migration
 * `supabase_migration_ingredient_backbone_defaults_backfill.sql`. They are
 * exposed in TypeScript so the same classifications can be applied at insert
 * time for ingredients created after the backfill runs — the actual wiring
 * into insert paths is intentionally left for a later stage.
 *
 * Design notes:
 *  - First-match-wins, more specific rules first (mirrors the pattern in
 *    `ingredient-grocery-category.ts`).
 *  - None of these functions mutate state or touch the database.
 *  - All output is conservative / informational — shelf-life days are rough
 *    pantry guidance, not food-safety guarantees.
 */

import type {
  IngredientGroceryCategory,
} from "@/lib/ingredient-grocery-category";
import type {
  IngredientStorageHint,
} from "@/types/database";

export const INGREDIENT_TAXONOMY_SUBCATEGORIES = [
  "Alliums",
  "Nightshades",
  "Peppers & Chilies",
  "Leafy Greens",
  "Brassicas",
  "Roots & Tubers",
  "Squash",
  "Stalk Vegetables",
  "Fungi",
  "Citrus",
  "Berries",
  "Stone Fruit",
  "Pome Fruit",
  "Tropical Fruit",
  "Melons",
  "Fresh Herbs",
  "Dried Spices",
  "Seaweeds",
  "Whole Grains",
  "Flours & Starches",
  "Pasta & Noodles",
  "Dried Legumes",
  "Canned Legumes",
  "Nuts",
  "Seeds",
  "Nut & Seed Butters",
  "Oils & Fats",
  "Vinegars",
  "Sweeteners",
  "Baking Essentials",
  "Canned Tomatoes",
  "Broths & Stocks",
  "Condiments & Sauces",
  "Pickles & Ferments",
  "Dairy",
  "Cheese",
  "Eggs",
  "Plant Milks",
  "Soy Proteins",
  "Meat",
  "Poultry",
  "Seafood",
  "Dried Fruit",
  "Beverages",
  "Alcohol",
] as const;

export type IngredientTaxonomySubcategory =
  (typeof INGREDIENT_TAXONOMY_SUBCATEGORIES)[number];

type SubcategoryRule = {
  test: RegExp;
  subcategory: IngredientTaxonomySubcategory;
};

const SUBCATEGORY_RULES: SubcategoryRule[] = [
  // --- More specific "processed form" rules come first so "tomato paste"
  //     does not get classified as "Nightshades" just because it contains
  //     the word tomato. Same for canned beans vs dry beans.
  { test: /\bcanned\s+(tomato|tomatoes|diced tomato|crushed tomato|whole peeled tomato|san marzano)\b|\btomato\s+(paste|sauce|passata|puree)\b|\bcrushed\s+tomatoes?\b|\bdiced\s+tomatoes?\b/i, subcategory: "Canned Tomatoes" },
  { test: /\bcanned\s+(bean|beans|chickpea|chickpeas|garbanzo|lentils?|black beans?|pinto beans?|kidney beans?|cannellini|navy beans?|white beans?)\b/i, subcategory: "Canned Legumes" },
  { test: /\b(broth|stock|bouillon|bone broth)\b/i, subcategory: "Broths & Stocks" },
  { test: /\b(peanut|almond|cashew|hazelnut|sunflower|pumpkin seed)\s+butter\b|\btahini\b|\bnut butter\b|\bseed butter\b|\bcoconut butter\b/i, subcategory: "Nut & Seed Butters" },
  { test: /\b(kimchi|sauerkraut|pickle|pickles|pickled|capers|olives|miso(?!\s+soup)|umeboshi|kvass|tsukemono)\b/i, subcategory: "Pickles & Ferments" },

  // --- Produce: vegetables
  { test: /\b(onion|shallot|leek|scallion|spring onion|green onion|chive|garlic)\b/i, subcategory: "Alliums" },
  { test: /\b(jalape|poblano|serrano|habanero|anaheim|chipotle|ancho|ghost pepper|scotch bonnet|thai chil|chile pepper|chili pepper|fresno)\b/i, subcategory: "Peppers & Chilies" },
  { test: /\b(tomato|tomatoes|tomatillo|eggplant|aubergine|bell pepper|sweet pepper|capsicum)\b/i, subcategory: "Nightshades" },
  { test: /\b(spinach|kale|chard|collard|arugula|rocket|lettuce|romaine|mesclun|mixed greens|salad mix|baby spinach|baby greens|watercress|endive|radicchio|escarole|dandelion greens)\b/i, subcategory: "Leafy Greens" },
  { test: /\b(cabbage|broccoli|cauliflower|brussels sprouts?|kohlrabi|bok choy|pak choi|broccolini|romanesco)\b/i, subcategory: "Brassicas" },
  { test: /\b(potato|sweet potato|yam|carrot|beet|beetroot|turnip|parsnip|radish|celeriac|celery root|jicama|daikon|rutabaga|cassava|yuca|taro)\b/i, subcategory: "Roots & Tubers" },
  { test: /\b(butternut|acorn|kabocha|delicata|hubbard|spaghetti squash|pumpkin|zucchini|courgette|summer squash|winter squash|squash)\b/i, subcategory: "Squash" },
  { test: /\b(celery|fennel|asparagus|artichoke|rhubarb|cardoon)\b/i, subcategory: "Stalk Vegetables" },
  { test: /\b(mushroom|shiitake|portobello|cremini|button mushrooms|oyster mushrooms|porcini|morel|chanterelle|enoki|maitake)\b/i, subcategory: "Fungi" },

  // --- Produce: fruit
  { test: /\b(lemon|lime|orange|grapefruit|tangerine|clementine|mandarin|pomelo|yuzu|kumquat|citrus)\b/i, subcategory: "Citrus" },
  { test: /\b(strawberr|blueberr|raspberr|blackberr|cranberr|gooseberr|currant|mulberr|elderberr|goji berr|golden berr)\b/i, subcategory: "Berries" },
  { test: /\b(peach|plum|nectarine|apricot|cherry|cherries)\b/i, subcategory: "Stone Fruit" },
  { test: /\b(apple|pear|quince)\b/i, subcategory: "Pome Fruit" },
  { test: /\b(mango|pineapple|banana|papaya|kiwi|passion fruit|dragon fruit|guava|coconut|avocado|plantain|lychee|rambutan)\b/i, subcategory: "Tropical Fruit" },
  { test: /\b(watermelon|cantaloupe|honeydew|melon)\b/i, subcategory: "Melons" },

  // --- Herbs and spices
  { test: /\b(basil|cilantro|coriander leaves|parsley|mint|dill|thyme|rosemary|oregano|sage|tarragon|chervil|marjoram|curry leaves|lemongrass)\b(?!\s+(powder|seed|ground|dried))/i, subcategory: "Fresh Herbs" },
  { test: /\b(cinnamon|turmeric|cumin|coriander seed|ground coriander|paprika|cayenne|nutmeg|clove|cloves|cardamom|allspice|star anise|bay leaves|bay leaf|red pepper flakes|chili powder|garlic powder|onion powder|fennel seed|caraway|mustard seed|poppy seed|peppercorn|black pepper|white pepper|ground ginger|ginger powder|garam masala|five spice|za'?atar|sumac|saffron|seasoning|spice mix)\b/i, subcategory: "Dried Spices" },
  { test: /\b(nori|kombu|wakame|dulse|arame|hijiki|kelp|seaweed|agar)\b/i, subcategory: "Seaweeds" },

  // --- Grains / flours / pasta
  { test: /\b(rice flour|almond flour|almond meal|coconut flour|spelt flour|rye flour|whole wheat flour|all-purpose flour|bread flour|cake flour|pastry flour|chickpea flour|gram flour|oat flour|buckwheat flour|corn flour|masa harina|semolina|cornmeal|polenta|cornstarch|corn starch|arrowroot|tapioca|kuzu|potato starch|flour)\b/i, subcategory: "Flours & Starches" },
  { test: /\b(rolled oats|steel cut oats|oatmeal|oats|quinoa|millet|teff|buckwheat|barley|farro|spelt berries|wheat berries|bulgur|freekeh|couscous|rye berries|sorghum|amaranth|forbidden black rice|brown rice|white rice|basmati|jasmine rice|sushi rice|wild rice|rice)\b/i, subcategory: "Whole Grains" },
  { test: /\b(pasta|spaghetti|penne|fettuccine|linguine|rigatoni|macaroni|lasagn|ravioli|tortellini|orzo|noodle|noodles|udon|soba|ramen|rice noodle|glass noodle|vermicelli)\b/i, subcategory: "Pasta & Noodles" },

  // --- Legumes / nuts / seeds (dry whole commodity)
  { test: /\b(lentils?|split peas?|chickpeas?|garbanzo|black beans?|pinto beans?|kidney beans?|cannellini|navy beans?|white beans?|adzuki|mung beans?|fava beans?|lima beans?|heirloom beans?)\b/i, subcategory: "Dried Legumes" },
  { test: /\b(almonds?|walnuts?|pecans?|cashews?|pistachios?|hazelnuts?|macadamia|brazil nuts?|pine nuts?|peanuts?)\b(?!\s+butter)/i, subcategory: "Nuts" },
  { test: /\b(chia seeds?|flax seeds?|flaxseed|hemp seeds?|sunflower seeds?|pumpkin seeds?|pepitas?|sesame seeds?)\b/i, subcategory: "Seeds" },

  // --- Fats / acids / sweeteners / baking
  { test: /\b(olive oil|avocado oil|canola oil|vegetable oil|sunflower oil|sesame oil|grapeseed oil|coconut oil|peanut oil|walnut oil|flax oil|butter|ghee|lard|tallow|shortening|schmaltz)\b/i, subcategory: "Oils & Fats" },
  { test: /\b(vinegar|mirin)\b/i, subcategory: "Vinegars" },
  { test: /\b(maple syrup|maple sugar|brown rice syrup|coconut nectar|coconut sugar|yakon syrup|honey|molasses|agave|stevia|jaggery|palm sugar|powdered sugar|confectioners sugar|icing sugar|brown sugar|cane sugar|sugar|medjool dates)\b/i, subcategory: "Sweeteners" },
  { test: /\b(baking powder|baking soda|yeast|vanilla extract|vanilla bean|vanilla|cocoa|cacao|chocolate chips?)\b/i, subcategory: "Baking Essentials" },

  // --- Condiments and dairy
  { test: /\b(ketchup|mustard|mayonnaise|mayo|worcestershire|soy sauce|tamari|fish sauce|hot sauce|sriracha|harissa|salsa|pesto|chutney|relish|jam|jelly|preserve|marmalade|hoisin|oyster sauce|bbq sauce|barbecue sauce|apple butter|curry paste|sambal|gochujang|ponzu)\b/i, subcategory: "Condiments & Sauces" },
  { test: /\b(almond milk|oat milk|soy milk|rice milk|cashew milk|hemp milk|pea milk|coconut milk beverage)\b/i, subcategory: "Plant Milks" },
  { test: /\b(milk|cream|yogurt|kefir|buttermilk|half and half|sour cream)\b/i, subcategory: "Dairy" },
  { test: /\b(cheese|mozzarella|cheddar|parmesan|feta|goat cheese|ricotta|cottage cheese|gruyere|brie|camembert|pecorino|manchego|paneer|halloumi|blue cheese|gorgonzola|swiss cheese)\b/i, subcategory: "Cheese" },
  { test: /\beggs?\b/i, subcategory: "Eggs" },
  { test: /\b(tofu|tempeh|edamame|seitan|soy curl)\b/i, subcategory: "Soy Proteins" },

  // --- Proteins
  { test: /\b(chicken|turkey|duck|quail|cornish hen|poultry)\b/i, subcategory: "Poultry" },
  { test: /\b(salmon|tuna|cod|halibut|trout|mackerel|sardine|anchovy|shrimp|prawn|lobster|crab|scallop|mussel|clam|oyster|octopus|squid|calamari|tilapia|snapper|sea bass|seafood)\b|\bfish\b(?!\s+sauce)/i, subcategory: "Seafood" },
  { test: /\b(beef|pork|lamb|veal|goat meat|bacon|sausage|ham|prosciutto|pancetta|chorizo|ground beef|ground pork|ground turkey|steak|ribs|cutlet|tenderloin|filet|fillet)\b/i, subcategory: "Meat" },

  // --- Dried fruit
  { test: /\b(raisin|prune|date|dried fig|dried apricot|dried cranberr|dried mulberr|golden raisin|dried mango)\b/i, subcategory: "Dried Fruit" },

  // --- Beverages / alcohol
  { test: /\b(wine|beer|whiskey|whisky|vodka|gin|rum|tequila|mezcal|sake|liqueur|cider|brandy|champagne|prosecco|spirits?)\b/i, subcategory: "Alcohol" },
  { test: /\b(juice|soda|pop|cola|tonic|seltzer|kombucha|sparkling water|tea|coffee|espresso|hot chocolate|water)\b/i, subcategory: "Beverages" },
];

/** Returns the best-guess subcategory for the given ingredient name, or null. */
export function inferTaxonomySubcategoryFromName(
  name: string,
): IngredientTaxonomySubcategory | null {
  const n = (name ?? "").trim();
  if (!n) return null;
  for (const { test, subcategory } of SUBCATEGORY_RULES) {
    if (test.test(n)) return subcategory;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Storage hints
// ---------------------------------------------------------------------------
// The big insight: storage is a mixture of subcategory and name hints. A raw
// tomato keeps on the counter or in the fridge; a can of tomatoes lives in
// the pantry. Fresh meat is fridge-or-freezer; cured bacon is the same.
// We encode per-subcategory defaults, then let a small name-level override
// (e.g. "frozen …", "canned …", "dried …") take precedence.

const STORAGE_BY_SUBCATEGORY: Partial<
  Record<IngredientTaxonomySubcategory, IngredientStorageHint[]>
> = {
  Alliums: ["pantry"],
  Nightshades: ["counter", "fridge"],
  "Peppers & Chilies": ["fridge"],
  "Leafy Greens": ["fridge"],
  Brassicas: ["fridge"],
  "Roots & Tubers": ["pantry"],
  Squash: ["pantry"],
  "Stalk Vegetables": ["fridge"],
  Fungi: ["fridge"],
  Citrus: ["counter", "fridge"],
  Berries: ["fridge"],
  "Stone Fruit": ["counter", "fridge"],
  "Pome Fruit": ["counter", "fridge"],
  "Tropical Fruit": ["counter", "fridge"],
  Melons: ["counter", "fridge"],
  "Fresh Herbs": ["fridge"],
  "Dried Spices": ["pantry"],
  Seaweeds: ["pantry"],
  "Whole Grains": ["pantry"],
  "Flours & Starches": ["pantry"],
  "Pasta & Noodles": ["pantry"],
  "Dried Legumes": ["pantry"],
  "Canned Legumes": ["pantry"],
  Nuts: ["pantry", "freezer"],
  Seeds: ["pantry", "freezer"],
  "Nut & Seed Butters": ["pantry", "fridge"],
  "Oils & Fats": ["pantry"],
  Vinegars: ["pantry"],
  Sweeteners: ["pantry"],
  "Baking Essentials": ["pantry"],
  "Canned Tomatoes": ["pantry"],
  "Broths & Stocks": ["pantry", "fridge"],
  "Condiments & Sauces": ["pantry", "fridge"],
  "Pickles & Ferments": ["fridge"],
  Dairy: ["fridge"],
  Cheese: ["fridge"],
  Eggs: ["fridge"],
  "Plant Milks": ["pantry", "fridge"],
  "Soy Proteins": ["fridge"],
  Meat: ["fridge", "freezer"],
  Poultry: ["fridge", "freezer"],
  Seafood: ["fridge", "freezer"],
  "Dried Fruit": ["pantry"],
  Beverages: ["pantry", "fridge"],
  Alcohol: ["pantry"],
};

/** Name-level overrides that win over subcategory defaults. */
function nameOverrideStorage(name: string): IngredientStorageHint[] | null {
  const n = name.toLowerCase();
  if (/\bfrozen\b/.test(n)) return ["freezer"];
  if (/\bdried\b/.test(n) && !/\bsun[- ]?dried\s+tomato\b/.test(n)) {
    return ["pantry"];
  }
  if (/\bcanned\b|\bjarred\b|\bbottled\b/.test(n)) return ["pantry"];
  return null;
}

export function inferStorageHintsFromName(
  name: string,
  subcategory?: IngredientTaxonomySubcategory | null,
): IngredientStorageHint[] | null {
  const n = (name ?? "").trim();
  if (!n) return null;
  const override = nameOverrideStorage(n);
  if (override) return override;
  if (subcategory) return STORAGE_BY_SUBCATEGORY[subcategory] ?? null;
  const inferred = inferTaxonomySubcategoryFromName(n);
  return inferred ? STORAGE_BY_SUBCATEGORY[inferred] ?? null : null;
}

// ---------------------------------------------------------------------------
// packaged_common — does this usually come in a barcoded package?
// ---------------------------------------------------------------------------

const PACKAGED_COMMON_RULES: RegExp[] = [
  /\bcanned\b|\bbottled\b|\bjarred\b|\bboxed\b|\bbagged\b|\bsachet\b|\bcarton\b|\bjug\b|\btube\b|\bpouch\b/i,
  /\bfrozen\b/i,
  /\b(pasta|spaghetti|penne|noodles?|rice|cereal|granola|muesli|crackers?|chips|cookies?|tortillas?|english muffins?)\b/i,
  /\b(yogurt|milk|cream|cheese|butter|ghee|sour cream|kefir|buttermilk|eggs?)\b/i,
  /\b(tofu|tempeh|seitan)\b/i,
  /\b(nut butter|peanut butter|almond butter|tahini|cashew butter|hazelnut butter|coconut butter|apple butter)\b/i,
  /\b(broth|stock|bouillon)\b/i,
  /\b(ketchup|mustard|mayo|mayonnaise|soy sauce|tamari|fish sauce|hot sauce|sriracha|harissa|salsa|pesto|chutney|relish|jam|jelly|preserve|marmalade|hoisin|oyster sauce|curry paste|sambal|gochujang|ponzu|vinegar)\b/i,
  /\b(flour|sugar|baking powder|baking soda|yeast|cornmeal|cornstarch|oats?|quinoa|millet|teff|buckwheat|barley|farro|spelt|amaranth|couscous|bulgur|freekeh)\b/i,
  /\b(almond milk|oat milk|soy milk|rice milk|cashew milk|hemp milk|coconut milk)\b/i,
  /\b(juice|soda|pop|cola|tonic|seltzer|kombucha|sparkling water|tea bags?|coffee|espresso|water)\b/i,
  /\b(wine|beer|whisky|whiskey|vodka|gin|rum|tequila|mezcal|sake|liqueur|cider|brandy)\b/i,
];

export function inferPackagedCommonFromName(name: string): boolean {
  const n = (name ?? "").trim();
  if (!n) return false;
  return PACKAGED_COMMON_RULES.some((r) => r.test(n));
}

// ---------------------------------------------------------------------------
// is_composite — prepared multi-ingredient input rather than a commodity
// ---------------------------------------------------------------------------

const IS_COMPOSITE_RULES: RegExp[] = [
  /\b(broth|stock|bouillon|bone broth)\b/i,
  /\b(mayo|mayonnaise|ketchup|mustard|worcestershire|soy sauce|tamari|fish sauce|hot sauce|sriracha|harissa|salsa|pesto|chutney|relish|jam|jelly|preserve|marmalade|hoisin|oyster sauce|bbq sauce|barbecue sauce|apple butter|curry paste|sambal|gochujang|ponzu|pasta sauce|tomato sauce|marinara|alfredo|dressing|vinaigrette)\b/i,
  /\b(miso|tempeh|tofu|seitan|kimchi|sauerkraut|umeboshi paste)\b/i,
  /\b(plant milk|almond milk|oat milk|soy milk|rice milk|cashew milk|hemp milk|pea milk)\b/i,
  /\bhummus\b|\bbaba ?ganoush\b/i,
];

export function inferIsCompositeFromName(name: string): boolean {
  const n = (name ?? "").trim();
  if (!n) return false;
  return IS_COMPOSITE_RULES.some((r) => r.test(n));
}

// ---------------------------------------------------------------------------
// default_units per subcategory
// ---------------------------------------------------------------------------

const DEFAULT_UNITS_BY_SUBCATEGORY: Partial<
  Record<IngredientTaxonomySubcategory, string[]>
> = {
  Alliums: ["g", "oz", "lb", "each"],
  Nightshades: ["g", "oz", "lb", "each"],
  "Peppers & Chilies": ["g", "oz", "each"],
  "Leafy Greens": ["g", "oz", "cup", "bunch"],
  Brassicas: ["g", "oz", "lb", "each"],
  "Roots & Tubers": ["g", "oz", "lb", "each"],
  Squash: ["g", "oz", "lb", "each"],
  "Stalk Vegetables": ["g", "oz", "bunch", "each"],
  Fungi: ["g", "oz", "cup"],
  Citrus: ["g", "oz", "each"],
  Berries: ["g", "oz", "cup"],
  "Stone Fruit": ["g", "oz", "each"],
  "Pome Fruit": ["g", "oz", "each"],
  "Tropical Fruit": ["g", "oz", "each"],
  Melons: ["g", "oz", "lb", "each"],
  "Fresh Herbs": ["g", "oz", "bunch", "cup", "tbsp"],
  "Dried Spices": ["g", "tsp", "tbsp"],
  Seaweeds: ["g", "oz", "sheet"],
  "Whole Grains": ["g", "oz", "cup", "lb"],
  "Flours & Starches": ["g", "oz", "cup", "lb"],
  "Pasta & Noodles": ["g", "oz", "lb"],
  "Dried Legumes": ["g", "oz", "cup", "lb"],
  "Canned Legumes": ["can", "g", "oz", "cup"],
  Nuts: ["g", "oz", "cup"],
  Seeds: ["g", "oz", "tbsp", "cup"],
  "Nut & Seed Butters": ["g", "oz", "tbsp", "cup"],
  "Oils & Fats": ["ml", "tsp", "tbsp", "cup"],
  Vinegars: ["ml", "tsp", "tbsp", "cup"],
  Sweeteners: ["g", "oz", "tsp", "tbsp", "cup"],
  "Baking Essentials": ["g", "tsp", "tbsp"],
  "Canned Tomatoes": ["can", "g", "oz", "cup"],
  "Broths & Stocks": ["ml", "cup", "carton"],
  "Condiments & Sauces": ["ml", "tsp", "tbsp", "cup"],
  "Pickles & Ferments": ["g", "oz", "cup"],
  Dairy: ["ml", "cup"],
  Cheese: ["g", "oz", "cup"],
  Eggs: ["each", "dozen"],
  "Plant Milks": ["ml", "cup", "carton"],
  "Soy Proteins": ["g", "oz", "block"],
  Meat: ["g", "oz", "lb"],
  Poultry: ["g", "oz", "lb"],
  Seafood: ["g", "oz", "lb"],
  "Dried Fruit": ["g", "oz", "cup"],
  Beverages: ["ml", "cup", "can", "bottle"],
  Alcohol: ["ml", "oz", "bottle"],
};

export function inferDefaultUnits(
  subcategory: IngredientTaxonomySubcategory | null,
): string[] | null {
  if (!subcategory) return null;
  return DEFAULT_UNITS_BY_SUBCATEGORY[subcategory] ?? null;
}

// ---------------------------------------------------------------------------
// Shelf-life defaults (rough; conservative)
// ---------------------------------------------------------------------------

export type ShelfLifeDefaults = {
  counter: number | null;
  fridge: number | null;
  freezer: number | null;
};

const SHELF_LIFE_BY_SUBCATEGORY: Partial<
  Record<IngredientTaxonomySubcategory, ShelfLifeDefaults>
> = {
  Alliums: { counter: null, fridge: null, freezer: null }, // handled by name (onion vs garlic vs scallion)
  Nightshades: { counter: 5, fridge: 7, freezer: null },
  "Peppers & Chilies": { counter: null, fridge: 10, freezer: 180 },
  "Leafy Greens": { counter: null, fridge: 5, freezer: 180 },
  Brassicas: { counter: null, fridge: 30, freezer: 180 },
  "Roots & Tubers": { counter: 60, fridge: 30, freezer: null },
  Squash: { counter: 60, fridge: null, freezer: 180 },
  "Stalk Vegetables": { counter: null, fridge: 10, freezer: null },
  Fungi: { counter: null, fridge: 7, freezer: null },
  Citrus: { counter: 7, fridge: 30, freezer: null },
  Berries: { counter: null, fridge: 5, freezer: 365 },
  "Stone Fruit": { counter: 3, fridge: 7, freezer: 365 },
  "Pome Fruit": { counter: 7, fridge: 30, freezer: 365 },
  "Tropical Fruit": { counter: 5, fridge: 5, freezer: 365 },
  Melons: { counter: 7, fridge: 14, freezer: 180 },
  "Fresh Herbs": { counter: null, fridge: 5, freezer: 90 },
  "Dried Spices": { counter: null, fridge: null, freezer: null }, // pantry handled below
  Seaweeds: { counter: null, fridge: null, freezer: null },
  "Whole Grains": { counter: null, fridge: null, freezer: null },
  "Flours & Starches": { counter: null, fridge: null, freezer: null },
  "Pasta & Noodles": { counter: null, fridge: null, freezer: null },
  "Dried Legumes": { counter: null, fridge: null, freezer: null },
  "Canned Legumes": { counter: null, fridge: null, freezer: null },
  Nuts: { counter: null, fridge: 180, freezer: 365 },
  Seeds: { counter: null, fridge: 180, freezer: 365 },
  "Nut & Seed Butters": { counter: null, fridge: 90, freezer: null },
  "Oils & Fats": { counter: null, fridge: null, freezer: null },
  Vinegars: { counter: null, fridge: null, freezer: null },
  Sweeteners: { counter: null, fridge: null, freezer: null },
  "Baking Essentials": { counter: null, fridge: null, freezer: null },
  "Canned Tomatoes": { counter: null, fridge: 5, freezer: null },
  "Broths & Stocks": { counter: null, fridge: 5, freezer: 90 },
  "Condiments & Sauces": { counter: null, fridge: 90, freezer: null },
  "Pickles & Ferments": { counter: null, fridge: 60, freezer: null },
  Dairy: { counter: null, fridge: 7, freezer: 30 },
  Cheese: { counter: null, fridge: 30, freezer: 180 },
  Eggs: { counter: null, fridge: 35, freezer: null },
  "Plant Milks": { counter: null, fridge: 7, freezer: null },
  "Soy Proteins": { counter: null, fridge: 7, freezer: 90 },
  Meat: { counter: null, fridge: 3, freezer: 180 },
  Poultry: { counter: null, fridge: 2, freezer: 270 },
  Seafood: { counter: null, fridge: 2, freezer: 180 },
  "Dried Fruit": { counter: null, fridge: null, freezer: null },
  Beverages: { counter: null, fridge: null, freezer: null },
  Alcohol: { counter: null, fridge: null, freezer: null },
};

// Pantry-keepers (spices, dried goods, canned, sweeteners) don't get counter
// or fridge numbers — they live in the pantry for a long time. We don't yet
// model pantry days separately; shelf-life days are informational across the
// three storage_hints columns we do have.

/**
 * Returns rough shelf-life defaults for a given subcategory, or nulls across
 * the board when we don't have useful guidance. The SQL backfill uses the
 * same mapping.
 */
export function inferShelfLifeDefaults(
  subcategory: IngredientTaxonomySubcategory | null,
): ShelfLifeDefaults {
  const fallback: ShelfLifeDefaults = {
    counter: null,
    fridge: null,
    freezer: null,
  };
  if (!subcategory) return fallback;
  return SHELF_LIFE_BY_SUBCATEGORY[subcategory] ?? fallback;
}

// ---------------------------------------------------------------------------
// Combined helper
// ---------------------------------------------------------------------------

export type IngredientBackboneDefaults = {
  taxonomy_subcategory: IngredientTaxonomySubcategory | null;
  storage_hints: IngredientStorageHint[] | null;
  packaged_common: boolean;
  is_composite: boolean;
  default_units: string[] | null;
  shelf_life_counter_days: number | null;
  shelf_life_fridge_days: number | null;
  shelf_life_freezer_days: number | null;
};

/**
 * All-in-one helper: from an ingredient's display name (and optionally its
 * grocery category) derive the full set of backbone defaults that will be
 * written to the database.
 */
export function inferBackboneDefaultsFromName(
  name: string,
  _groceryCategory?: IngredientGroceryCategory | null,
): IngredientBackboneDefaults {
  const subcategory = inferTaxonomySubcategoryFromName(name);
  const storageHints = inferStorageHintsFromName(name, subcategory);
  const packagedCommon = inferPackagedCommonFromName(name);
  const isComposite = inferIsCompositeFromName(name);
  const defaultUnits = inferDefaultUnits(subcategory);
  const shelfLife = inferShelfLifeDefaults(subcategory);
  return {
    taxonomy_subcategory: subcategory,
    storage_hints: storageHints,
    packaged_common: packagedCommon,
    is_composite: isComposite,
    default_units: defaultUnits,
    shelf_life_counter_days: shelfLife.counter,
    shelf_life_fridge_days: shelfLife.fridge,
    shelf_life_freezer_days: shelfLife.freezer,
  };
}
