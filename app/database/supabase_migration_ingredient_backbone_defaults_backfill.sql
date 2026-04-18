-- Stage 2: One-time backfill for the Stage-1 ingredient backbone fields.
--
-- Populates `taxonomy_subcategory`, `storage_hints`, `default_units`,
-- `shelf_life_*_days`, `packaged_common`, and `is_composite` on existing rows
-- based on regex rules applied to the ingredient name. Mirrors the TypeScript
-- helper in `app/recipes-next/src/lib/ingredient-backbone-inference.ts`.
--
-- Safety:
--   * Subcategory / storage / units / shelf-life updates only touch rows where
--     the target column is currently null, so re-runs are no-ops and nothing
--     that was set manually gets overwritten.
--   * Boolean flags only flip false → true where the name clearly indicates it.
--   * No columns are dropped, no rows are deleted.
--
-- How to run (Supabase dashboard):
--   SQL → New query → paste → Run as role `postgres` on the Primary database.
--   Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1) taxonomy_subcategory
-- ---------------------------------------------------------------------------
-- Order matters: more specific rules first. Each statement only fills rows
-- where taxonomy_subcategory is still null.

-- Prepared / processed forms first (so "tomato paste" does not become Nightshades)
update public.ingredients set taxonomy_subcategory = 'Canned Tomatoes'
  where taxonomy_subcategory is null
    and name ~* '\ycanned\s+(tomato|tomatoes|diced tomato|crushed tomato|whole peeled tomato|san marzano)\y|\ytomato\s+(paste|sauce|passata|puree)\y|\ycrushed\s+tomatoes?\y|\ydiced\s+tomatoes?\y';

update public.ingredients set taxonomy_subcategory = 'Canned Legumes'
  where taxonomy_subcategory is null
    and name ~* '\ycanned\s+(bean|beans|chickpea|chickpeas|garbanzo|lentils?|black beans?|pinto beans?|kidney beans?|cannellini|navy beans?|white beans?)\y';

update public.ingredients set taxonomy_subcategory = 'Broths & Stocks'
  where taxonomy_subcategory is null
    and name ~* '\y(broth|stock|bouillon|bone broth)\y';

update public.ingredients set taxonomy_subcategory = 'Nut & Seed Butters'
  where taxonomy_subcategory is null
    and name ~* '\y(peanut|almond|cashew|hazelnut|sunflower|pumpkin seed)\s+butter\y|\ytahini\y|\ynut butter\y|\yseed butter\y|\ycoconut butter\y';

update public.ingredients set taxonomy_subcategory = 'Pickles & Ferments'
  where taxonomy_subcategory is null
    and name ~* '\y(kimchi|sauerkraut|pickle|pickles|pickled|capers|olives|miso|umeboshi|kvass|tsukemono)\y';

-- Vegetables
update public.ingredients set taxonomy_subcategory = 'Alliums'
  where taxonomy_subcategory is null
    and name ~* '\y(onion|shallot|leek|scallion|spring onion|green onion|chive|garlic)\y';

update public.ingredients set taxonomy_subcategory = 'Peppers & Chilies'
  where taxonomy_subcategory is null
    and name ~* '\y(jalape|poblano|serrano|habanero|anaheim|chipotle|ancho|ghost pepper|scotch bonnet|thai chil|chile pepper|chili pepper|fresno)\y';

update public.ingredients set taxonomy_subcategory = 'Nightshades'
  where taxonomy_subcategory is null
    and name ~* '\y(tomato|tomatoes|tomatillo|eggplant|aubergine|bell pepper|sweet pepper|capsicum)\y';

update public.ingredients set taxonomy_subcategory = 'Leafy Greens'
  where taxonomy_subcategory is null
    and name ~* '\y(spinach|kale|chard|collard|arugula|rocket|lettuce|romaine|mesclun|mixed greens|salad mix|baby spinach|baby greens|watercress|endive|radicchio|escarole|dandelion greens)\y';

update public.ingredients set taxonomy_subcategory = 'Brassicas'
  where taxonomy_subcategory is null
    and name ~* '\y(cabbage|broccoli|cauliflower|brussels sprouts?|kohlrabi|bok choy|pak choi|broccolini|romanesco)\y';

update public.ingredients set taxonomy_subcategory = 'Roots & Tubers'
  where taxonomy_subcategory is null
    and name ~* '\y(potato|sweet potato|yam|carrot|beet|beetroot|turnip|parsnip|radish|celeriac|celery root|jicama|daikon|rutabaga|cassava|yuca|taro)\y';

update public.ingredients set taxonomy_subcategory = 'Squash'
  where taxonomy_subcategory is null
    and name ~* '\y(butternut|acorn|kabocha|delicata|hubbard|spaghetti squash|pumpkin|zucchini|courgette|summer squash|winter squash|squash)\y';

update public.ingredients set taxonomy_subcategory = 'Stalk Vegetables'
  where taxonomy_subcategory is null
    and name ~* '\y(celery|fennel|asparagus|artichoke|rhubarb|cardoon)\y';

update public.ingredients set taxonomy_subcategory = 'Fungi'
  where taxonomy_subcategory is null
    and name ~* '\y(mushroom|shiitake|portobello|cremini|button mushrooms|oyster mushrooms|porcini|morel|chanterelle|enoki|maitake)\y';

-- Fruit
update public.ingredients set taxonomy_subcategory = 'Citrus'
  where taxonomy_subcategory is null
    and name ~* '\y(lemon|lime|orange|grapefruit|tangerine|clementine|mandarin|pomelo|yuzu|kumquat|citrus)\y';

update public.ingredients set taxonomy_subcategory = 'Berries'
  where taxonomy_subcategory is null
    and name ~* '\y(strawberr|blueberr|raspberr|blackberr|cranberr|gooseberr|currant|mulberr|elderberr|goji berr|golden berr)\y';

update public.ingredients set taxonomy_subcategory = 'Stone Fruit'
  where taxonomy_subcategory is null
    and name ~* '\y(peach|plum|nectarine|apricot|cherry|cherries)\y';

update public.ingredients set taxonomy_subcategory = 'Pome Fruit'
  where taxonomy_subcategory is null
    and name ~* '\y(apple|pear|quince)\y';

update public.ingredients set taxonomy_subcategory = 'Tropical Fruit'
  where taxonomy_subcategory is null
    and name ~* '\y(mango|pineapple|banana|papaya|kiwi|passion fruit|dragon fruit|guava|coconut|avocado|plantain|lychee|rambutan)\y';

update public.ingredients set taxonomy_subcategory = 'Melons'
  where taxonomy_subcategory is null
    and name ~* '\y(watermelon|cantaloupe|honeydew|melon)\y';

-- Herbs and spices
update public.ingredients set taxonomy_subcategory = 'Fresh Herbs'
  where taxonomy_subcategory is null
    and name ~* '\y(basil|cilantro|coriander leaves|parsley|mint|dill|thyme|rosemary|oregano|sage|tarragon|chervil|marjoram|curry leaves|lemongrass)\y'
    and name !~* '\y(powder|seed|ground|dried)\y';

update public.ingredients set taxonomy_subcategory = 'Dried Spices'
  where taxonomy_subcategory is null
    and name ~* '\y(cinnamon|turmeric|cumin|coriander seed|ground coriander|paprika|cayenne|nutmeg|clove|cloves|cardamom|allspice|star anise|bay leaves|bay leaf|red pepper flakes|chili powder|garlic powder|onion powder|fennel seed|caraway|mustard seed|poppy seed|peppercorn|black pepper|white pepper|ground ginger|ginger powder|garam masala|five spice|sumac|saffron|seasoning|spice mix)\y';

update public.ingredients set taxonomy_subcategory = 'Seaweeds'
  where taxonomy_subcategory is null
    and name ~* '\y(nori|kombu|wakame|dulse|arame|hijiki|kelp|seaweed|agar)\y';

-- Grains / flours / pasta
update public.ingredients set taxonomy_subcategory = 'Flours & Starches'
  where taxonomy_subcategory is null
    and name ~* '\y(rice flour|almond flour|almond meal|coconut flour|spelt flour|rye flour|whole wheat flour|all-purpose flour|bread flour|cake flour|pastry flour|chickpea flour|gram flour|oat flour|buckwheat flour|corn flour|masa harina|semolina|cornmeal|polenta|cornstarch|corn starch|arrowroot|tapioca|kuzu|potato starch|flour)\y';

update public.ingredients set taxonomy_subcategory = 'Whole Grains'
  where taxonomy_subcategory is null
    and name ~* '\y(rolled oats|steel cut oats|oatmeal|oats|quinoa|millet|teff|buckwheat|barley|farro|spelt berries|wheat berries|bulgur|freekeh|couscous|rye berries|sorghum|amaranth|forbidden black rice|brown rice|white rice|basmati|jasmine rice|sushi rice|wild rice|rice)\y';

update public.ingredients set taxonomy_subcategory = 'Pasta & Noodles'
  where taxonomy_subcategory is null
    and name ~* '\y(pasta|spaghetti|penne|fettuccine|linguine|rigatoni|macaroni|lasagn|ravioli|tortellini|orzo|noodle|noodles|udon|soba|ramen|rice noodle|glass noodle|vermicelli)\y';

-- Legumes / nuts / seeds
update public.ingredients set taxonomy_subcategory = 'Dried Legumes'
  where taxonomy_subcategory is null
    and name ~* '\y(lentils?|split peas?|chickpeas?|garbanzo|black beans?|pinto beans?|kidney beans?|cannellini|navy beans?|white beans?|adzuki|mung beans?|fava beans?|lima beans?|heirloom beans?)\y';

update public.ingredients set taxonomy_subcategory = 'Nuts'
  where taxonomy_subcategory is null
    and name ~* '\y(almonds?|walnuts?|pecans?|cashews?|pistachios?|hazelnuts?|macadamia|brazil nuts?|pine nuts?|peanuts?)\y'
    and name !~* '\ybutter\y';

update public.ingredients set taxonomy_subcategory = 'Seeds'
  where taxonomy_subcategory is null
    and name ~* '\y(chia seeds?|flax seeds?|flaxseed|hemp seeds?|sunflower seeds?|pumpkin seeds?|pepitas?|sesame seeds?)\y';

-- Fats / acids / sweeteners / baking
update public.ingredients set taxonomy_subcategory = 'Oils & Fats'
  where taxonomy_subcategory is null
    and name ~* '\y(olive oil|avocado oil|canola oil|vegetable oil|sunflower oil|sesame oil|grapeseed oil|coconut oil|peanut oil|walnut oil|flax oil|butter|ghee|lard|tallow|shortening|schmaltz)\y';

update public.ingredients set taxonomy_subcategory = 'Vinegars'
  where taxonomy_subcategory is null
    and name ~* '\y(vinegar|mirin)\y';

update public.ingredients set taxonomy_subcategory = 'Sweeteners'
  where taxonomy_subcategory is null
    and name ~* '\y(maple syrup|maple sugar|brown rice syrup|coconut nectar|coconut sugar|yakon syrup|honey|molasses|agave|stevia|jaggery|palm sugar|powdered sugar|confectioners sugar|icing sugar|brown sugar|cane sugar|sugar|medjool dates)\y';

update public.ingredients set taxonomy_subcategory = 'Baking Essentials'
  where taxonomy_subcategory is null
    and name ~* '\y(baking powder|baking soda|yeast|vanilla extract|vanilla bean|vanilla|cocoa|cacao|chocolate chips?)\y';

-- Condiments and dairy
update public.ingredients set taxonomy_subcategory = 'Condiments & Sauces'
  where taxonomy_subcategory is null
    and name ~* '\y(ketchup|mustard|mayonnaise|mayo|worcestershire|soy sauce|tamari|fish sauce|hot sauce|sriracha|harissa|salsa|pesto|chutney|relish|jam|jelly|preserve|marmalade|hoisin|oyster sauce|bbq sauce|barbecue sauce|apple butter|curry paste|sambal|gochujang|ponzu)\y';

update public.ingredients set taxonomy_subcategory = 'Plant Milks'
  where taxonomy_subcategory is null
    and name ~* '\y(almond milk|oat milk|soy milk|rice milk|cashew milk|hemp milk|pea milk|coconut milk beverage)\y';

update public.ingredients set taxonomy_subcategory = 'Dairy'
  where taxonomy_subcategory is null
    and name ~* '\y(milk|cream|yogurt|kefir|buttermilk|half and half|sour cream)\y';

update public.ingredients set taxonomy_subcategory = 'Cheese'
  where taxonomy_subcategory is null
    and name ~* '\y(cheese|mozzarella|cheddar|parmesan|feta|goat cheese|ricotta|cottage cheese|gruyere|brie|camembert|pecorino|manchego|paneer|halloumi|blue cheese|gorgonzola|swiss cheese)\y';

update public.ingredients set taxonomy_subcategory = 'Eggs'
  where taxonomy_subcategory is null
    and name ~* '\yeggs?\y';

update public.ingredients set taxonomy_subcategory = 'Soy Proteins'
  where taxonomy_subcategory is null
    and name ~* '\y(tofu|tempeh|edamame|seitan|soy curl)\y';

-- Proteins
update public.ingredients set taxonomy_subcategory = 'Poultry'
  where taxonomy_subcategory is null
    and name ~* '\y(chicken|turkey|duck|quail|cornish hen|poultry)\y';

update public.ingredients set taxonomy_subcategory = 'Seafood'
  where taxonomy_subcategory is null
    and (
      name ~* '\y(salmon|tuna|cod|halibut|trout|mackerel|sardine|anchovy|shrimp|prawn|lobster|crab|scallop|mussel|clam|oyster|octopus|squid|calamari|tilapia|snapper|sea bass|seafood)\y'
      or (name ~* '\yfish\y' and name !~* '\yfish sauce\y')
    );

update public.ingredients set taxonomy_subcategory = 'Meat'
  where taxonomy_subcategory is null
    and name ~* '\y(beef|pork|lamb|veal|goat meat|bacon|sausage|ham|prosciutto|pancetta|chorizo|ground beef|ground pork|ground turkey|steak|ribs|cutlet|tenderloin|filet|fillet)\y';

update public.ingredients set taxonomy_subcategory = 'Dried Fruit'
  where taxonomy_subcategory is null
    and name ~* '\y(raisin|prune|date|dried fig|dried apricot|dried cranberr|dried mulberr|golden raisin|dried mango)\y';

-- Beverages / alcohol
update public.ingredients set taxonomy_subcategory = 'Alcohol'
  where taxonomy_subcategory is null
    and name ~* '\y(wine|beer|whiskey|whisky|vodka|gin|rum|tequila|mezcal|sake|liqueur|cider|brandy|champagne|prosecco|spirits?)\y';

update public.ingredients set taxonomy_subcategory = 'Beverages'
  where taxonomy_subcategory is null
    and name ~* '\y(juice|soda|pop|cola|tonic|seltzer|kombucha|sparkling water|tea|coffee|espresso|hot chocolate|water)\y';

-- ---------------------------------------------------------------------------
-- 2) storage_hints
-- ---------------------------------------------------------------------------
-- Name-level overrides first — frozen wins over subcategory, etc.

update public.ingredients set storage_hints = array['freezer']
  where storage_hints is null
    and name ~* '\yfrozen\y';

update public.ingredients set storage_hints = array['pantry']
  where storage_hints is null
    and name ~* '\y(canned|jarred|bottled)\y';

update public.ingredients set storage_hints = array['pantry']
  where storage_hints is null
    and name ~* '\ydried\y'
    and name !~* '\ysun[- ]?dried\s+tomato\y';

-- Subcategory-driven defaults for everything else.
update public.ingredients set storage_hints = array['pantry']
  where storage_hints is null
    and taxonomy_subcategory in (
      'Alliums','Roots & Tubers','Squash','Dried Spices','Seaweeds',
      'Whole Grains','Flours & Starches','Pasta & Noodles','Dried Legumes',
      'Canned Legumes','Oils & Fats','Vinegars','Sweeteners',
      'Baking Essentials','Canned Tomatoes','Dried Fruit','Alcohol'
    );

update public.ingredients set storage_hints = array['counter','fridge']
  where storage_hints is null
    and taxonomy_subcategory in (
      'Nightshades','Citrus','Stone Fruit','Pome Fruit','Tropical Fruit','Melons'
    );

update public.ingredients set storage_hints = array['fridge']
  where storage_hints is null
    and taxonomy_subcategory in (
      'Peppers & Chilies','Leafy Greens','Brassicas','Stalk Vegetables','Fungi',
      'Berries','Fresh Herbs','Pickles & Ferments','Dairy','Cheese','Eggs','Soy Proteins'
    );

update public.ingredients set storage_hints = array['fridge','freezer']
  where storage_hints is null
    and taxonomy_subcategory in ('Meat','Poultry','Seafood');

update public.ingredients set storage_hints = array['pantry','fridge']
  where storage_hints is null
    and taxonomy_subcategory in (
      'Broths & Stocks','Condiments & Sauces','Plant Milks','Beverages'
    );

update public.ingredients set storage_hints = array['pantry','freezer']
  where storage_hints is null
    and taxonomy_subcategory in ('Nuts','Seeds');

update public.ingredients set storage_hints = array['pantry','fridge']
  where storage_hints is null
    and taxonomy_subcategory = 'Nut & Seed Butters';

-- ---------------------------------------------------------------------------
-- 3) packaged_common — commonly sold with a barcode
-- ---------------------------------------------------------------------------

update public.ingredients set packaged_common = true
  where packaged_common = false
    and (
      name ~* '\y(canned|bottled|jarred|boxed|bagged|sachet|carton|jug|tube|pouch|frozen)\y'
      or name ~* '\y(pasta|spaghetti|penne|noodles?|cereal|granola|muesli|crackers?|chips|cookies?|tortillas?|english muffins?)\y'
      or name ~* '\y(yogurt|milk|cream|cheese|butter|ghee|sour cream|kefir|buttermilk|eggs?)\y'
      or name ~* '\y(tofu|tempeh|seitan)\y'
      or name ~* '\y(nut butter|peanut butter|almond butter|tahini|cashew butter|hazelnut butter|coconut butter|apple butter)\y'
      or name ~* '\y(broth|stock|bouillon)\y'
      or name ~* '\y(ketchup|mustard|mayo|mayonnaise|soy sauce|tamari|fish sauce|hot sauce|sriracha|harissa|salsa|pesto|chutney|relish|jam|jelly|preserve|marmalade|hoisin|oyster sauce|curry paste|sambal|gochujang|ponzu|vinegar)\y'
      or name ~* '\y(flour|sugar|baking powder|baking soda|yeast|cornmeal|cornstarch|oats?|quinoa|millet|teff|buckwheat|barley|farro|spelt|amaranth|couscous|bulgur|freekeh)\y'
      or name ~* '\y(almond milk|oat milk|soy milk|rice milk|cashew milk|hemp milk|coconut milk)\y'
      or name ~* '\y(juice|soda|pop|cola|tonic|seltzer|kombucha|sparkling water|tea bags?|coffee|espresso)\y'
      or name ~* '\y(wine|beer|whisky|whiskey|vodka|gin|rum|tequila|mezcal|sake|liqueur|cider|brandy)\y'
    );

-- ---------------------------------------------------------------------------
-- 4) is_composite — prepared multi-ingredient input rather than a commodity
-- ---------------------------------------------------------------------------

update public.ingredients set is_composite = true
  where is_composite = false
    and (
      name ~* '\y(broth|stock|bouillon|bone broth)\y'
      or name ~* '\y(mayo|mayonnaise|ketchup|mustard|worcestershire|soy sauce|tamari|fish sauce|hot sauce|sriracha|harissa|salsa|pesto|chutney|relish|jam|jelly|preserve|marmalade|hoisin|oyster sauce|bbq sauce|barbecue sauce|apple butter|curry paste|sambal|gochujang|ponzu|pasta sauce|tomato sauce|marinara|alfredo|dressing|vinaigrette)\y'
      or name ~* '\y(miso|tempeh|tofu|seitan|kimchi|sauerkraut|umeboshi paste)\y'
      or name ~* '\y(plant milk|almond milk|oat milk|soy milk|rice milk|cashew milk|hemp milk|pea milk)\y'
      or name ~* '\y(hummus|baba ?ganoush)\y'
    );

-- ---------------------------------------------------------------------------
-- 5) default_units (text[]) — by subcategory, only where null
-- ---------------------------------------------------------------------------

update public.ingredients set default_units = array['g','oz','lb','each']
  where default_units is null
    and taxonomy_subcategory in ('Alliums','Nightshades','Brassicas','Roots & Tubers','Squash','Melons');

update public.ingredients set default_units = array['g','oz','each']
  where default_units is null
    and taxonomy_subcategory in ('Peppers & Chilies','Citrus','Stone Fruit','Pome Fruit','Tropical Fruit');

update public.ingredients set default_units = array['g','oz','cup','bunch']
  where default_units is null
    and taxonomy_subcategory = 'Leafy Greens';

update public.ingredients set default_units = array['g','oz','bunch','each']
  where default_units is null
    and taxonomy_subcategory = 'Stalk Vegetables';

update public.ingredients set default_units = array['g','oz','cup']
  where default_units is null
    and taxonomy_subcategory in ('Fungi','Berries','Nuts','Dried Fruit','Pickles & Ferments','Cheese');

update public.ingredients set default_units = array['g','oz','bunch','cup','tbsp']
  where default_units is null
    and taxonomy_subcategory = 'Fresh Herbs';

update public.ingredients set default_units = array['g','tsp','tbsp']
  where default_units is null
    and taxonomy_subcategory in ('Dried Spices','Baking Essentials');

update public.ingredients set default_units = array['g','oz','sheet']
  where default_units is null
    and taxonomy_subcategory = 'Seaweeds';

update public.ingredients set default_units = array['g','oz','cup','lb']
  where default_units is null
    and taxonomy_subcategory in ('Whole Grains','Flours & Starches','Dried Legumes');

update public.ingredients set default_units = array['g','oz','lb']
  where default_units is null
    and taxonomy_subcategory in ('Pasta & Noodles','Meat','Poultry','Seafood');

update public.ingredients set default_units = array['can','g','oz','cup']
  where default_units is null
    and taxonomy_subcategory in ('Canned Legumes','Canned Tomatoes');

update public.ingredients set default_units = array['g','oz','tbsp','cup']
  where default_units is null
    and taxonomy_subcategory in ('Seeds','Nut & Seed Butters');

update public.ingredients set default_units = array['ml','tsp','tbsp','cup']
  where default_units is null
    and taxonomy_subcategory in ('Oils & Fats','Vinegars','Condiments & Sauces');

update public.ingredients set default_units = array['g','oz','tsp','tbsp','cup']
  where default_units is null
    and taxonomy_subcategory = 'Sweeteners';

update public.ingredients set default_units = array['ml','cup','carton']
  where default_units is null
    and taxonomy_subcategory in ('Broths & Stocks','Plant Milks');

update public.ingredients set default_units = array['ml','cup']
  where default_units is null
    and taxonomy_subcategory = 'Dairy';

update public.ingredients set default_units = array['each','dozen']
  where default_units is null
    and taxonomy_subcategory = 'Eggs';

update public.ingredients set default_units = array['g','oz','block']
  where default_units is null
    and taxonomy_subcategory = 'Soy Proteins';

update public.ingredients set default_units = array['ml','cup','can','bottle']
  where default_units is null
    and taxonomy_subcategory = 'Beverages';

update public.ingredients set default_units = array['ml','oz','bottle']
  where default_units is null
    and taxonomy_subcategory = 'Alcohol';

-- ---------------------------------------------------------------------------
-- 6) Shelf-life defaults (in days) — conservative, informational only
-- ---------------------------------------------------------------------------

-- Counter days
update public.ingredients set shelf_life_counter_days = 5
  where shelf_life_counter_days is null
    and taxonomy_subcategory = 'Nightshades';
update public.ingredients set shelf_life_counter_days = 60
  where shelf_life_counter_days is null
    and taxonomy_subcategory in ('Roots & Tubers','Squash');
update public.ingredients set shelf_life_counter_days = 7
  where shelf_life_counter_days is null
    and taxonomy_subcategory in ('Citrus','Pome Fruit','Melons');
update public.ingredients set shelf_life_counter_days = 3
  where shelf_life_counter_days is null
    and taxonomy_subcategory = 'Stone Fruit';
update public.ingredients set shelf_life_counter_days = 5
  where shelf_life_counter_days is null
    and taxonomy_subcategory = 'Tropical Fruit';

-- Fridge days
update public.ingredients set shelf_life_fridge_days = 7
  where shelf_life_fridge_days is null
    and taxonomy_subcategory in ('Nightshades','Dairy','Soy Proteins','Plant Milks');
update public.ingredients set shelf_life_fridge_days = 10
  where shelf_life_fridge_days is null
    and taxonomy_subcategory in ('Peppers & Chilies','Stalk Vegetables');
update public.ingredients set shelf_life_fridge_days = 5
  where shelf_life_fridge_days is null
    and taxonomy_subcategory in ('Leafy Greens','Berries','Fresh Herbs','Broths & Stocks','Canned Tomatoes','Tropical Fruit');
update public.ingredients set shelf_life_fridge_days = 30
  where shelf_life_fridge_days is null
    and taxonomy_subcategory in ('Brassicas','Roots & Tubers','Citrus','Pome Fruit','Cheese');
update public.ingredients set shelf_life_fridge_days = 7
  where shelf_life_fridge_days is null
    and taxonomy_subcategory = 'Fungi';
update public.ingredients set shelf_life_fridge_days = 14
  where shelf_life_fridge_days is null
    and taxonomy_subcategory = 'Melons';
update public.ingredients set shelf_life_fridge_days = 7
  where shelf_life_fridge_days is null
    and taxonomy_subcategory = 'Stone Fruit';
update public.ingredients set shelf_life_fridge_days = 60
  where shelf_life_fridge_days is null
    and taxonomy_subcategory = 'Pickles & Ferments';
update public.ingredients set shelf_life_fridge_days = 90
  where shelf_life_fridge_days is null
    and taxonomy_subcategory in ('Condiments & Sauces','Nut & Seed Butters');
update public.ingredients set shelf_life_fridge_days = 180
  where shelf_life_fridge_days is null
    and taxonomy_subcategory in ('Nuts','Seeds');
update public.ingredients set shelf_life_fridge_days = 35
  where shelf_life_fridge_days is null
    and taxonomy_subcategory = 'Eggs';
update public.ingredients set shelf_life_fridge_days = 3
  where shelf_life_fridge_days is null
    and taxonomy_subcategory = 'Meat';
update public.ingredients set shelf_life_fridge_days = 2
  where shelf_life_fridge_days is null
    and taxonomy_subcategory in ('Poultry','Seafood');

-- Freezer days
update public.ingredients set shelf_life_freezer_days = 365
  where shelf_life_freezer_days is null
    and taxonomy_subcategory in ('Berries','Stone Fruit','Pome Fruit','Tropical Fruit','Nuts','Seeds');
update public.ingredients set shelf_life_freezer_days = 180
  where shelf_life_freezer_days is null
    and taxonomy_subcategory in ('Peppers & Chilies','Leafy Greens','Brassicas','Squash','Melons','Meat','Seafood','Cheese','Dairy');
update public.ingredients set shelf_life_freezer_days = 90
  where shelf_life_freezer_days is null
    and taxonomy_subcategory in ('Fresh Herbs','Broths & Stocks','Soy Proteins');
update public.ingredients set shelf_life_freezer_days = 270
  where shelf_life_freezer_days is null
    and taxonomy_subcategory = 'Poultry';
update public.ingredients set shelf_life_freezer_days = 30
  where shelf_life_freezer_days is null
    and taxonomy_subcategory = 'Dairy';

-- ---------------------------------------------------------------------------
-- 7) Stamp updated_at on everything that was actually changed.
-- ---------------------------------------------------------------------------
-- Best-effort: rows whose updated_at is older than now() AND which now have
-- any of the Stage-1 fields populated. Keeps the audit trail honest without
-- scanning the whole table unnecessarily.

update public.ingredients
set updated_at = now()
where (taxonomy_subcategory is not null
       or storage_hints is not null
       or default_units is not null
       or shelf_life_counter_days is not null
       or shelf_life_fridge_days is not null
       or shelf_life_freezer_days is not null
       or packaged_common = true
       or is_composite = true)
  and updated_at < now();
