# Inventory Unit Cleanup Review

Generated: 2026-04-25T01:16:02.705Z
Model: gpt-5
Allowed units: count, g, kg, oz, lb, ml, l, fl oz, cup, tsp, tbsp, ea, piece, dozen, whole, clove, slice, sprig, pinch, head, bunch, pkg, bag, box, block, tub, container, jar, bottle, can, roll, sleeve

Nothing is approved by default. In the JSON file, set `approved` to `true` for rows you want to include in the SQL migration.

## Summary

- Inventory rows: 269
- Inventory rows needing review: 59
- Product rows: 116
- Product rows needing review: 28

## Inventory Recommendations

| Approved | Review | ID | Ingredient | Stock | Recipe | Confidence | Reason |
| --- | --- | ---: | --- | --- | --- | ---: | --- |
yes | no | 1 | Garlic | head -> head | - -> clove | 0.97 | Garlic is stored by heads and recipes call for cloves.
yes | no | 3 | Onions | count -> count | - -> ea | 0.90 | Onions are tracked by count and commonly measured as whole onions in recipes.
yes | no | 4 | Shallots | count -> count | - -> ea | 0.85 | Shallots are stored by count and typically used as whole shallots in recipes.
yes | no | 5 | Ginger | count -> piece | - -> g | 0.80 | Usually kept as whole pieces and measured by weight in recipes.
yes | no | 6 | Avocado | count -> count | - -> ea | 0.93 | Tracked by each; recipes often call for 1 avocado.
yes | no | 7 | Banana | count -> count | - -> ea | 0.93 | Tracked by each; recipes commonly use number of bananas.
yes | no | 8 | Basil | bunch -> bunch | - -> g | 0.86 | Usually stored as a bunch; recipes often call for weight.
yes | no | 9 | Broccoli | head -> head | - -> g | 0.93 | Commonly tracked by head; recipes often use grams.
yes | no | 10 | Carrots | count -> count | - -> g | 0.80 | Loose carrots can be counted; recipes typically use weight.
yes | no | 11 | Cauliflower | head -> head | - -> g | 0.90 | Usually bought as a head and measured by weight in recipes.
yes | no | 12 | Celery | bunch -> bunch | - -> g | 0.85 | Commonly stored as a bunch; recipes often use weight.
yes | no | 13 | Chicken Breasts - boneless skinless | count -> count | - -> g | 0.80 | Stock tracked per breast; recipes frequently call for weight.
yes | yes | 14 | Goat Cheese | pkg -> pkg | - -> g | 0.76 | Cheese is typically stored as a package; recipes usually call for weight.
yes | yes | 15 | Pepper - green | count -> count | - -> ea | 0.70 | Fresh peppers are tracked by count and commonly used by each in recipes.
yes | no | 16 | Red Bell Peppers - red | count -> count | - -> ea | 0.92 | Red bell peppers are commonly counted and used per pepper.
yes | no | 17 | Ground Beef | kg -> kg | - -> g | 0.94 | Meat is tracked by weight; recipes commonly use grams.
yes | no | 18 | Jalapeños | count -> count | - -> ea | 0.90 | Chiles are counted in stock and used by each in recipes.
yes | no | 19 | Kale | head -> bunch | - -> cup | 0.80 | Kale is typically sold as bunches; recipes often call for cups chopped.
yes | no | 21 | Mushrooms - button | g -> pkg | - -> g | 0.82 | Button mushrooms are usually bought in packages and recipes measure by weight.
yes | yes | 22 | Pizza Dough | pkg -> pkg | - -> g | 0.70 | Pizza dough is typically sold as a packaged portion and recipes portion by weight.
yes | yes | 23 | Raspberries | pkg -> pkg | - -> cup | 0.78 | Raspberries are commonly kept as a package and many recipes use cups.
yes | no | 24 | Red Cabbage - red | head -> head | - -> g | 0.90 | Cabbage is stored as whole heads; recipes usually call for weight.
yes | no | 25 | Green Cabbage - green | head -> head | - -> g | 0.90 | Cabbage is stored as whole heads; recipes usually call for weight.
yes | yes | 26 | Salmon | g -> pkg | - -> g | 0.75 | Fresh salmon is commonly stocked as packages; recipes measure by weight.
yes | yes | 27 | Spinach | pkg -> bag | - -> g | 0.72 | Spinach is commonly stored as a bag; recipes often use grams.
yes | no | 28 | Strawberries | pkg -> container | - -> g | 0.80 | Strawberries are typically in a clamshell container; recipes often use grams.
yes | no | 29 | Thyme | pkg -> bunch | - -> sprig | 0.88 | Fresh thyme is sold as a bunch; recipes usually call for sprigs.
yes | no | 30 | Tortillas - flour | bag -> bag | - -> count | 0.86 | Tortillas are stored as a bag and recipes specify a number of tortillas.
yes | yes | 31 | Zucchini | count -> count | - -> g | 0.78 | Typically tracked by whole pieces; recipes commonly use weight.
yes | no | 135 | Soy Sauce | bottle -> bottle | - -> ml | 0.93 | Stored as a bottle and measured by volume in recipes.
yes | no | 136 | Avocado Oil | bottle -> bottle | - -> tbsp | 0.88 | Oil is stored as a bottle; recipes usually call for tablespoons.
yes | no | 137 | Cornstarch | g -> box | - -> tbsp | 0.86 | Cornstarch is typically kept in a box; recipes measure it by tablespoons.
yes | no | 138 | Onion Powder | g -> jar | - -> tsp | 0.93 | Spices like onion powder are stored in jars and measured in teaspoons.
yes | no | 139 | Garlic Powder | jar -> jar | - -> tsp | 0.92 | Powdered spice is kept in a jar and measured by teaspoons in recipes.
yes | no | 140 | Salt | g -> container | - -> tsp | 0.86 | Salt is typically tracked by the container and measured by teaspoons.
yes | no | 141 | Black Pepper | g -> jar | - -> tsp | 0.87 | Black pepper is commonly stored in a jar/grinder and used by teaspoons.
yes | no | 142 | Baking Powder | g -> container | - -> tsp | 0.90 | Commonly kept as a small container and measured in teaspoons in recipes.
yes | no | 143 | Rice Vinegar | ml -> bottle | - -> tbsp | 0.86 | Vinegar is stored in bottles; recipes usually call for tablespoons.
yes | no | 144 | Honey | g -> jar | - -> tbsp | 0.90 | Often stored in a jar; recipes commonly use tablespoons.
yes | no | 145 | Sesame Oil | g -> bottle | - -> ml | 0.93 | Oil is typically stored in bottles and measured by volume in recipes.
yes | yes | 183 | Water | - -> bottle | - -> ml | 0.78 | Packaged water is commonly tracked as bottles; cooking measures by volume.
yes | no | 184 | Minced Garlic | g -> jar | - -> tsp | 0.86 | Minced garlic is usually sold in jars; recipes call for teaspoons.
yes | no | 185 | Eggs - large | count -> count | - -> count | 0.90 | Eggs are typically counted individually for stock and recipes.
yes | no | 186 | Milk | - -> container | - -> ml | 0.95 | Milk is stored in jugs/cartons and measured by volume in recipes.
yes | no | 187 | Flour | bag -> bag | g -> g | 0.96 | Flour is stored in bags and recipes commonly use grams.
yes | no | 188 | Vanilla Extract | - -> bottle | - -> tsp | 0.95 | Commonly stored as a bottle; recipes usually measure in teaspoons.
yes | yes | 189 | Egg Yolks | - -> ea | - -> ea | 0.74 | Egg yolks are typically counted individually in recipes.
yes | no | 190 | Egg Whites | container -> container | - -> ea | 0.80 | Often stocked as liquid in containers; recipes commonly specify egg whites by each.
yes | no | 191 | Sugar - granulated | - -> bag | - -> g | 0.90 | Granulated sugar is usually bought in bags and recipes often measure it by weight.
yes | no | 192 | Lemon Juice | - -> bottle | - -> ml | 0.94 | Lemon juice is typically stored in a bottle and measured by volume in recipes.
yes | yes | 193 | Avocado Oil Spray | - -> can | - -> tsp | 0.70 | Oil spray comes in a can; recipes that quantify oil usually use teaspoons.
yes | no | 194 | Yogurt | - -> tub | - -> cup | 0.88 | Usually bought in tubs and measured by cups in recipes.
yes | no | 195 | Blackberries | - -> container | - -> cup | 0.86 | Commonly sold in clamshell containers and measured by cups.
yes | no | 196 | Peaches | - -> piece | - -> ea | 0.90 | Peaches are counted individually and recipes often use each.
yes | yes | 197 | Egg Yolks | - -> count | - -> count | 0.72 | Egg yolks are typically tracked and used by count.
yes | no | 198 | Soy Milk | - -> container | - -> ml | 0.95 | Soy milk is stored as containers and measured by volume in recipes.
yes | no | 199 | Flour | - -> bag | - -> g | 0.90 | Flour is usually bought in bags and measured by weight in recipes.
yes | no | 200 | Cornstarch | - -> box | - -> tbsp | 0.82 | Commonly sold in a box; recipes often use tablespoons for thickening.
yes | no | 201 | Baking Powder | - -> can | - -> tsp | 0.95 | Typically sold in small cans; recipes measure it by teaspoons.
yes | no | 202 | Sea Salt | - -> container | - -> tsp | 0.86 | Usually stored in a container; recipes commonly use teaspoons.
yes | no | 203 | Vanilla Extract | - -> bottle | - -> tsp | 0.94 | Typically stored as a small bottle; recipes use teaspoons.
yes | yes | 204 | Avocado Oil Spray | - -> can | - -> tsp | 0.68 | Sold as an aerosol can; when measured, oil is expressed in teaspoons.
yes | no | 205 | Water | - -> bottle | - -> ml | 0.82 | Often stored as bottles/jugs; recipes measure water by volume.
yes | yes | 206 | Egg Whites | - -> container | - -> ea | 0.66 | Often stocked as liquid egg whites in a container; recipes commonly call for egg whites by count.
yes | no | 207 | Sugar - granulated | - -> bag | - -> g | 0.93 | Granulated sugar is usually bought in bags and measured by weight in recipes.
yes | no | 208 | Lemon Juice | - -> bottle | - -> ml | 0.90 | Lemon juice is typically sold in bottles and measured by volume in recipes.
yes | yes | 209 | Pears | - -> piece | - -> piece | 0.75 | Whole fruit is counted by pieces; recipes often call for pears by count.
yes | yes | 210 | Butter | - -> block | - -> tbsp | 0.68 | Butter is commonly bought as blocks; recipes frequently use tablespoons.
yes | no | 213 | Brandy | - -> bottle | - -> ml | 0.90 | Spirits are stocked as bottles and measured by volume in recipes.
yes | yes | 214 | Unsalted Butter | - -> block | - -> tbsp | 0.72 | Butter is commonly kept as blocks/sticks; recipes often call for tablespoons.
yes | yes | 215 | Salted Butter | - -> block | - -> tbsp | 0.72 | Typically stocked as blocks/sticks; recipes usually use tablespoons.
yes | no | 218 | Chicken Breasts - boneless skinless | kg -> pkg | - -> g | 0.86 | Households track raw chicken by package; recipes measure by weight.
yes | no | 220 | All Purpose White Flour | - -> bag | - -> g | 0.94 | Flour is typically stored in bags and measured by weight in recipes.
yes | no | 221 | Cake & Pastry Unbleached White Flour | - -> bag | - -> g | 0.94 | Cake/pastry flour is usually sold in bags and measured by grams.
yes | no | 222 | Lacinato Kale | head -> bunch | - -> g | 0.80 | Kale is commonly sold as a bunch; recipes often use weight.
yes | no | 223 | Curly Kale | - -> bunch | - -> g | 0.88 | Curly kale is typically sold as a bunch; recipes often use weight.
yes | no | 225 | Baby Bella Mushrooms | - -> pkg | - -> g | 0.80 | Baby bellas are commonly bought in packages; recipes use weight.
yes | no | 226 | Shiitake Mushroom | oz -> pkg | - -> g | 0.84 | Shiitakes are usually sold in small packages; recipes use weight.
yes | no | 227 | Portabello Mushroom | - -> ea | - -> g | 0.80 | Portabello caps are often tracked by each and measured by weight in recipes.
yes | yes | 228 | Oyster Mushrooms | - -> pkg | - -> g | 0.65 | Oyster mushrooms are commonly bought in small packages and used by weight.
yes | yes | 229 | Trumpet Mushrooms | - -> ea | - -> g | 0.75 | Trumpet mushrooms are large and easy to count individually; recipes use weight.
yes | no | 231 | Free Range Large Brown Eggs | dozen -> dozen | count -> count | 0.96 | Eggs are stocked by the dozen and recipes use a count.
yes | no | 233 | Soy Milk | bottle -> container | - -> ml | 0.88 | Soy milk is stored as containers/cartons and measured by volume.
yes | no | 234 | Low Sodium Tamari | bottle -> bottle | - -> ml | 0.95 | Tamari is kept in bottles and measured in milliliters.
yes | no | 235 | Tamari | - -> bottle | - -> ml | 0.95 | Liquid soy sauce style; commonly sold in bottles and measured by volume.
yes | no | 236 | Tofu - firm | pkg -> block | - -> g | 0.90 | Firm tofu is typically sold as blocks and recipes usually use weight.
yes | yes | 237 | Soft Tofu | - -> box | - -> g | 0.72 | Soft tofu often comes in shelf-stable boxes; measured by weight in recipes.
yes | no | 240 | Dairy Free Coconut Yogurt | g -> tub | - -> cup | 0.84 | Yogurt is usually stocked as tubs and measured in cups in recipes.
yes | no | 241 | Greek Yogurt | - -> tub | - -> cup | 0.90 | Greek yogurt is commonly bought in tubs and used by the cup.
yes | no | 242 | Rice - brown | - -> bag | - -> cup | 0.92 | Brown rice is stored in bags; recipes usually call for cups of dry rice.
yes | no | 243 | Rice - white | g -> g | - -> g | 0.92 | Existing stock is tracked in grams; recipes commonly use weight.
yes | no | 244 | Rice - white | - -> g | - -> g | 0.86 | Using grams keeps rice inventory and recipe measures consistent.
yes | no | 245 | Short-Grain White Rice | - -> g | - -> g | 0.86 | Short-grain rice is often managed and measured by weight.
yes | no | 246 | Sugar - granulated | - -> bag | - -> g | 0.92 | Granulated sugar is typically bought as a bag and recipes commonly measure by weight.
yes | no | 247 | Brown Sugar | - -> bag | - -> g | 0.90 | Brown sugar is usually stocked as a bag; recipes often use grams for precision.
yes | no | 248 | Hazelnuts | - -> bag | - -> g | 0.86 | Hazelnuts are commonly sold in bags; recipes frequently measure nuts by grams.
yes | no | 249 | Almonds | - -> bag | - -> g | 0.90 | Nuts are commonly stored in bags and measured by weight in recipes.
yes | no | 250 | Black Vinegar | - -> bottle | - -> ml | 0.94 | Vinegar is typically sold in bottles and measured by volume.
yes | yes | 251 | Cold Water | - -> bottle | - -> ml | 0.64 | Water for pantry is often in bottles; recipes use volume measures.
yes | yes | 252 | Hot Water | - -> bottle | - -> ml | 0.58 | Water is typically stored as bottles; recipes measure hot water by volume.
yes | no | 253 | Rice Noodles | - -> pkg | - -> g | 0.93 | Rice noodles are sold in packages and measured by weight in recipes.
yes | no | 254 | Watercress | - -> bunch | - -> g | 0.80 | Watercress is commonly sold in bunches; recipes often use grams.
yes | no | 255 | Chili Flakes | - -> jar | - -> tsp | 0.92 | Typically stored in a spice jar and measured by teaspoons.
yes | no | 256 | Unsalted Shrimp Stock | - -> container | - -> ml | 0.80 | Broth/stock is often kept in a container and measured by volume.
yes | no | 257 | White Miso Paste | - -> tub | - -> tbsp | 0.88 | Miso is commonly sold in tubs and used by tablespoons in recipes.
yes | no | 258 | Green Onions | count -> bunch | - -> ea | 0.88 | Usually bought as bunches; recipes often call for a number of stalks.
yes | no | 259 | Chili Oil | - -> bottle | - -> tsp | 0.90 | Typically stored as a bottle and measured by teaspoons in recipes.
yes | yes | 260 | Furikake | - -> bottle | - -> tsp | 0.78 | Commonly sold in a small shaker bottle and sprinkled by teaspoon.
yes | no | 261 | Olive Oil - extra virgin | - -> bottle | - -> tbsp | 0.86 | Olive oil is typically stored as bottles and measured by tablespoons in recipes.
yes | no | 262 | Olive Oil - extra virgin | l -> bottle | - -> tbsp | 0.86 | Stock counted as bottles; recipes commonly use tablespoons.
yes | yes | 263 | Pasta | - -> box | - -> g | 0.78 | Dry pasta is usually kept as boxes and measured by weight in recipes.
yes | no | 264 | Spaghetti | g -> pkg | - -> g | 0.92 | Dry pasta is typically counted by package and measured by grams in recipes.
yes | no | 265 | Fusilli | pkg -> pkg | - -> g | 0.92 | Counting fusilli by package is standard; recipes use grams.
yes | no | 266 | Macaroni | - -> pkg | - -> g | 0.90 | Macaroni is usually stored as packages and measured in grams for cooking.
yes | no | 267 | Conchiglie | - -> box | - -> g | 0.93 | Dried pasta is usually kept as boxes and measured in grams in recipes.
yes | no | 268 | Gnocchi | - -> pkg | - -> g | 0.90 | Shelf-stable gnocchi is typically sold as packages and measured in grams in recipes.
yes | no | 269 | Farfalle | - -> box | - -> g | 0.93 | Dried pasta is usually kept as boxes and measured in grams in recipes.
yes | no | 270 | Rigatoni | - -> box | - -> g | 0.96 | Dry pasta is typically stored by the box and measured by weight in recipes.
yes | no | 271 | Penne | - -> box | - -> g | 0.96 | Dry pasta is typically stored by the box and measured by weight in recipes.
yes | no | 272 | Oat Milk | - -> container | - -> ml | 0.90 | Plant milk is usually kept as a container and measured by volume in recipes.
yes | no | 273 | Coconut Milk | - -> can | - -> ml | 0.80 | Commonly stocked as cans and measured by volume in recipes.
yes | no | 274 | Onions - red | - -> ea | - -> g | 0.90 | Whole onions are counted in stock and measured by weight in recipes.
yes | no | 275 | White Onions | - -> ea | - -> g | 0.90 | Whole onions are counted in stock and measured by weight in recipes.
yes | no | 276 | Onions - yellow | count -> count | - -> whole | 0.88 | Onions are tracked by pieces; recipes often call for a whole onion.
yes | no | 277 | Red Lentils | - -> bag | - -> cup | 0.80 | Dry lentils are usually stored in bags and measured by cups in recipes.
yes | no | 299 | Sea Salt | - -> container | - -> tsp | 0.90 | Sea salt is typically kept in a container and measured by teaspoons.
yes | yes | 300 | Himalayan Salt | - -> container | - -> tsp | 0.78 | Commonly kept in a container; recipes use teaspoons.
yes | no | 301 | Kosher Salt | - -> box | - -> tsp | 0.86 | Often sold in a box; recipes measure salt by teaspoons.
yes | no | 302 | Lasagne | - -> box | - -> g | 0.90 | Lasagne noodles are typically bought in a box and used by weight in recipes.
yes | no | 303 | Italian Sausage | - -> pkg | - -> g | 0.86 | Sausage is stored as packages and measured by weight in recipes.
yes | no | 304 | Tomatoes | - -> ea | - -> g | 0.84 | Fresh tomatoes are counted whole in stock and weighed in recipes.
yes | no | 305 | Pasta - paste | - -> can | - -> tbsp | 0.90 | Tomato paste is stocked as cans and recipes often call for tablespoons.
yes | no | 306 | Ricotta | - -> tub | - -> g | 0.88 | Ricotta is typically sold in tubs and recipes often measure it by weight.
yes | yes | 307 | Parmesan | - -> container | - -> g | 0.75 | Parmesan is commonly kept as grated cheese in a pantry container; recipes often use weight.
yes | no | 308 | Parsley Flakes | - -> jar | - -> tsp | 0.95 | Dried parsley flakes are stored in spice jars and measured by teaspoons.
yes | yes | 309 | Mozzarella | - -> block | - -> g | 0.78 | Mozzarella is commonly stocked as a block; recipes often use weight.
yes | no | 310 | Fish Sauce | - -> bottle | - -> ml | 0.92 | Fish sauce is stored as a bottle and measured by volume.
yes | no | 311 | Red Curry Paste | oz -> jar | - -> tbsp | 0.93 | Red curry paste is usually in a small jar; recipes call for tablespoons.
yes | no | 312 | Turmeric | - -> jar | - -> tsp | 0.95 | Ground spices are typically stored in jars and measured by teaspoons in recipes.
yes | no | 313 | Ground Ginger | - -> jar | - -> tsp | 0.95 | Ground spices are typically stored in jars and measured by teaspoons in recipes.
yes | no | 314 | Lime | count -> count | - -> whole | 0.90 | Limes are tracked by each and most recipes call for a whole lime.
yes | yes | 315 | Shrimp | - -> bag | - -> g | 0.78 | Shrimp is commonly bought frozen in bags and measured by weight in recipes.
yes | no | 316 | Pepper | - -> jar | - -> tsp | 0.94 | Dried pepper/peppercorns are stored in jars; recipes use teaspoons.
yes | no | 317 | Bell Pepper | g -> ea | - -> ea | 0.88 | Bell peppers are typically tracked and used by each pepper.
yes | no | 318 | Cashews | - -> bag | - -> g | 0.88 | Nuts are typically stored in bags and measured by weight in recipes.
yes | no | 319 | Habaneros | - -> ea | - -> ea | 0.90 | Fresh chilies are usually tracked and used by count.
yes | no | 320 | Chili Powder | - -> jar | - -> tsp | 0.95 | Ground spices are stored in jars and measured by teaspoons.
yes | no | 321 | Crushed Tomatoes | - -> can | - -> ml | 0.90 | Typically bought as cans; recipes often use volume for sauces.
yes | no | 322 | Kidney Beans | - -> bag | - -> g | 0.84 | Dried beans are usually stored in bags and measured by weight in recipes.
yes | no | 323 | Red Wine | - -> bottle | - -> ml | 0.95 | Wine is stocked as bottles and measured by volume for cooking.
yes | no | 324 | Mezcal | - -> bottle | - -> oz | 0.93 | Liquor is stored as bottles and cocktail recipes use ounces.
yes | no | 325 | Triple Sec | - -> bottle | - -> oz | 0.93 | Liqueurs are kept as bottles and cocktails measure in ounces.
yes | no | 326 | Lime Juice | - -> bottle | - -> ml | 0.86 | Shelf-stable lime juice is sold in bottles; recipes measure by volume.
yes | no | 327 | Sugar Syrup | - -> bottle | - -> ml | 0.90 | Usually stored in a bottle and measured by volume in recipes.
yes | yes | 328 | Olive Brine | - -> jar | - -> ml | 0.76 | Typically saved in the olive jar and used by volume.
yes | no | 329 | Ice Cubes | - -> piece | - -> piece | 0.93 | Ice is counted and used by individual cubes.
yes | yes | 330 | Dates - medjool | - -> box | - -> piece | 0.74 | Medjool dates are typically sold in boxes and often used by piece in recipes.
yes | no | 331 | Coconut Oil | - -> jar | - -> tbsp | 0.90 | Coconut oil is commonly stored in jars and measured by tablespoons in recipes.
yes | no | 332 | Flax Seeds | - -> bag | - -> tbsp | 0.90 | Flax seeds are usually bought in bags and measured by tablespoons in recipes.
yes | no | 333 | Chia Seeds | - -> bag | - -> tbsp | 0.88 | Typically bought as a bag; recipes use tablespoons.
yes | no | 334 | Smoked Paprika | - -> jar | - -> tsp | 0.95 | Usually stored in a small jar and measured in teaspoons.
yes | no | 335 | Balsamic Vinegar | - -> bottle | - -> tbsp | 0.92 | Kept in a bottle; recipes often call for tablespoons.
yes | no | 336 | Walnuts | - -> bag | - -> g | 0.84 | Walnuts are commonly stored in bags; recipes measure by weight.
yes | no | 337 | Icing Sugar | - -> bag | - -> g | 0.92 | Icing sugar is typically sold in bags and measured by weight in baking.
yes | no | 338 | Sugar - granulated | - -> bag | - -> g | 0.95 | Granulated sugar is usually kept as a bag and measured by weight.
yes | no | 339 | Potatoes | - -> lb | - -> g | 0.84 | Potatoes are typically stocked by the pound and measured by weight in recipes.
yes | no | 340 | Potatoes - russet | - -> ea | - -> ea | 0.80 | Russets are often used whole and counted per potato in recipes.
yes | no | 341 | Red Potatoes | - -> lb | - -> g | 0.86 | Red potatoes are commonly sold/used by weight; grams suit recipes.
yes | no | 342 | Yellow Potatoes | - -> bag | - -> g | 0.82 | Usually bought as a bag; recipes measure potatoes by weight.
yes | no | 343 | Fingerling Potatoes | - -> bag | - -> g | 0.80 | Commonly sold in bags; recipes typically use weight.
yes | no | 344 | Fine Salt | - -> container | - -> tsp | 0.94 | Fine salt is stored in containers; recipes use teaspoons.
yes | no | 345 | Sesame Seeds | - -> bag | - -> tbsp | 0.86 | Commonly sold/stored in bags; recipes often measure by tablespoon.
yes | no | 346 | Maple Syrup | - -> bottle | - -> tbsp | 0.93 | Typically kept as a bottle; recipes usually use tablespoons.
yes | no | 347 | Baking Soda | - -> box | - -> tsp | 0.96 | Usually packaged as a box; baking recipes commonly use teaspoons.
yes | yes | 348 | Fresh Clean Snow | - -> container | - -> cup | 0.45 | Unusual item; likely kept in a container and used by volume.
yes | no | 349 | Cinnamon | g -> jar | - -> tsp | 0.95 | Ground spices are stored as jars and measured by teaspoons.
yes | yes | 350 | Lemon Zest | - -> container | - -> tsp | 0.65 | Zest is typically measured by teaspoons and kept in a small container.
yes | yes | 351 | Crushed Roasted Nuts | - -> bag | - -> g | 0.78 | Usually sold/stored in bags; recipes measure by weight.
yes | no | 352 | Apple | g -> ea | - -> ea | 0.86 | Apples are counted individually and most recipes call for each.
yes | no | 353 | Cocoa Nibs | - -> bag | - -> g | 0.80 | Commonly kept in a bag and measured by weight in baking.
yes | no | 354 | Peanut Butter | - -> jar | - -> tbsp | 0.95 | Typically stored in jars and measured by spoonfuls in recipes.
yes | no | 355 | Flaxseed Meal | - -> bag | - -> tbsp | 0.80 | Often sold as a bag; recipes commonly use tablespoons.
yes | no | 356 | Almond Milk | - -> container | - -> ml | 0.90 | Usually kept as a container/carton and measured by volume.
yes | no | 357 | Lamb Stew Meat | - -> pkg | - -> g | 0.86 | Meat is usually stored as packages and measured by weight in recipes.
yes | no | 358 | Beef Bone Broth | - -> container | - -> ml | 0.92 | Bone broth is typically sold in cartons/containers and used by volume in recipes.
yes | no | 359 | Bay Leaf | - -> jar | - -> whole | 0.80 | Bay leaves are commonly kept in a spice jar and used as whole leaves in recipes.
yes | no | 360 | Spinach - baby | - -> bag | - -> g | 0.82 | Baby spinach is typically bought in bags and recipes often measure it by weight.
yes | yes | 361 | Vanilla Bean | - -> piece | - -> piece | 0.76 | Vanilla beans are counted individually and recipes often call for a whole bean.
yes | yes | 362 | Filtered Water | - -> bottle | - -> ml | 0.64 | Filtered water is commonly stored as bottles; recipes usually measure water by milliliters.
yes | no | 363 | Coconut Butter | - -> jar | - -> tbsp | 0.88 | Coconut butter is typically sold in jars; recipes often call for tablespoons.
yes | no | 364 | Whole-wheat Fettuccini | - -> box | - -> g | 0.96 | Dry pasta is stored by the box and measured by weight in recipes.
yes | no | 365 | Marinated Goat Cheese | - -> jar | - -> g | 0.80 | Marinated goat cheese commonly comes in a jar with oil; recipes usually specify weight.
yes | no | 366 | Rolled Oats - rolled | oz -> bag | - -> cup | 0.90 | Oats are typically kept as bags and measured by cups in recipes.
yes | yes | 367 | Wheat Germ | - -> bag | - -> tbsp | 0.70 | Wheat germ is often sold in small bags and used by tablespoons.
yes | yes | 368 | Maca Root Powder | - -> bag | - -> tsp | 0.72 | Maca powder commonly comes in pouches and is dosed by teaspoons.
yes | yes | 369 | Hemp Seeds | - -> bag | - -> tbsp | 0.78 | Seeds are typically sold in bags and used by spoonful in recipes.
yes | no | 370 | Flax Oil | - -> bottle | - -> tbsp | 0.90 | Oil is stored in bottles and commonly measured by tablespoons.
yes | no | 371 | Brown Rice Vinegar | - -> bottle | - -> tbsp | 0.88 | Vinegar is sold in bottles and usually measured by spoon in recipes.
yes | yes | 372 | Sesame | - -> bag | - -> tbsp | 0.74 | Sesame seeds are typically stored in bags; recipes often use tablespoons.
yes | no | 373 | Black Sesame Seeds | - -> bag | - -> tbsp | 0.80 | Black sesame seeds commonly come in bags and are measured by tablespoons in recipes.
yes | no | 374 | Soba Noodles | - -> pkg | - -> g | 0.90 | Soba noodles are sold in packages; dry noodles are usually measured by weight.
yes | no | 375 | Napa Cabbage | - -> head | - -> g | 0.92 | Cabbage is stored as whole heads and recipes usually use weight.
yes | yes | 376 | Edamame | - -> bag | - -> g | 0.68 | Edamame is commonly bought frozen in bags and measured by weight.
yes | yes | 377 | Sun-dried Tomatoes | - -> jar | - -> g | 0.74 | Sun-dried tomatoes are often oil-packed in jars and used by weight.
yes | yes | 378 | Sprouts and Microgreens | - -> container | - -> g | 0.74 | Typically sold in small clamshell containers; recipes often weigh greens.
yes | no | 379 | Mint | - -> bunch | - -> sprig | 0.90 | Fresh herbs are stocked by the bunch; recipes usually call for sprigs.
yes | yes | 380 | Marinated Tofu Steaks | - -> pkg | - -> g | 0.76 | Marinated tofu steaks are sold in sealed packages; recipes commonly use weight.
yes | yes | 383 | Toasted Mixed Nuts | - -> bag | - -> g | 0.78 | Commonly stored in a bag; recipes often weigh nuts.
yes | yes | 384 | Crispy Onions | - -> container | - -> cup | 0.74 | Usually sold in a small container; recipes use cups for crispy onion toppings.
yes | yes | 385 | Edible Flowers | - -> container | - -> ea | 0.62 | Typically in a small clamshell/container; garnishes are counted per flower.
yes | yes | 386 | 3-6-9 Dressing | - -> bottle | - -> tbsp | 0.64 | Dressing is typically stored in a bottle and measured by tablespoons in recipes.
yes | no | 387 | Cream of Tartar | - -> jar | - -> tsp | 0.95 | Cream of tartar is usually sold in small jars and measured by teaspoons in baking.
yes | no | 388 | Neutral Oil | - -> bottle | - -> tbsp | 0.90 | Neutral oils are commonly kept in bottles and portioned by tablespoons in recipes.
yes | no | 389 | Dark Chocolate Chips | - -> bag | - -> g | 0.86 | Chips are typically stored as bags and recipes often call for grams.
yes | no | 390 | Blueberries | oz -> container | - -> cup | 0.92 | Fresh berries are usually tracked per container and measured by cups in recipes.
yes | yes | 391 | Kombu | - -> pkg | - -> piece | 0.70 | Kombu is sold in packages and commonly used by the piece in recipes.
yes | no | 392 | Tempeh | pkg -> pkg | - -> g | 0.90 | Tempeh is typically bought as packages/blocks and measured by weight in recipes.
yes | no | 393 | Frozen Peas | - -> bag | - -> cup | 0.87 | Frozen peas are usually stored in bags and measured by cups in recipes.
yes | no | 394 | Apple Cider Vinegar | - -> bottle | - -> tbsp | 0.95 | Vinegar is stored as a bottle and commonly measured in tablespoons.
yes | no | 395 | Liquid Smoke | - -> bottle | - -> tsp | 0.90 | Usually sold in small bottles and used by the teaspoon in recipes.
yes | no | 396 | Frozen Berries | - -> bag | - -> cup | 0.86 | Commonly bought as a bag; recipes often measure berries in cups.
yes | no | 398 | Ground Cumin | - -> jar | - -> tsp | 0.95 | Typically kept in a spice jar and measured by teaspoon.
yes | no | 399 | Paprika | - -> jar | - -> tsp | 0.93 | Spices are typically stored in jars and measured by teaspoons in recipes.
yes | no | 400 | Whole Tomatoes | oz -> can | - -> g | 0.87 | Canned tomatoes are stocked by can and recipes commonly measure them by weight.
yes | yes | 401 | Parsley | - -> bunch | - -> tbsp | 0.78 | Fresh parsley is bought as bunches and often measured as tablespoons when chopped.
yes | yes | 402 | Feta | - -> tub | - -> g | 0.72 | Feta is often sold in tubs (in brine) and recipes usually call for weight.
yes | yes | 403 | Coconut Whipping Cream | - -> can | - -> ml | 0.64 | Typically a shelf-stable can; recipes measure by volume.
yes | no | 404 | Cacao Powder | - -> bag | - -> tbsp | 0.82 | Commonly sold in bags and used by spoonfuls in recipes.
yes | no | 405 | Brazil Nuts | - -> bag | - -> g | 0.84 | Nuts are typically stored in bags; recipes often use weight.
yes | no | 406 | Pine Nuts | - -> bag | - -> g | 0.90 | Pine nuts are commonly sold/stored in bags; recipes usually use grams.
yes | no | 407 | Nutritional Yeast | - -> bag | - -> tbsp | 0.88 | Nutritional yeast is often in bags; recipes commonly use tablespoons.
yes | yes | 408 | Kabocha | - -> whole | - -> g | 0.78 | Counted as whole squash; recipes often specify weight.
yes | no | 409 | Cottage Cheese | - -> tub | - -> cup | 0.93 | Typically sold in tubs; recipes commonly measure by cups.
yes | no | 410 | Tahini | - -> jar | - -> tbsp | 0.94 | Usually stored as a jar; recipes use tablespoons.
yes | no | 411 | Turmeric | - -> jar | - -> tsp | 0.90 | Spice usually kept in a small jar and measured by teaspoons.
yes | yes | 412 | Cardamom | - -> jar | - -> tsp | 0.75 | Often stored in a jar; recipes commonly use teaspoons, especially when ground.
yes | no | 413 | Black Peppercorns | - -> jar | - -> tsp | 0.82 | Typically sold/stored in jars; recipes measure peppercorns by teaspoons.
yes | yes | 414 | Black Tea | - -> box | - -> ml | 0.60 | Commonly kept as a box of tea bags; brewed tea is used by volume in recipes.
yes | no | 415 | Tahini | - -> jar | - -> tbsp | 0.95 | Typically sold in jars and measured by tablespoons in recipes.
yes | no | 416 | Mayonnaise | - -> jar | - -> tbsp | 0.92 | Usually stored as a jar and measured by tablespoons in recipes.
yes | no | 417 | White Wine Vinegar | - -> bottle | - -> ml | 0.95 | Vinegar is typically stored in a bottle and measured by volume in recipes.
yes | no | 418 | Dijon Mustard - dijon | - -> jar | - -> tsp | 0.90 | Dijon mustard is commonly kept in a jar and recipes usually call for teaspoons.
yes | yes | 419 | Grapes | g -> bag | - -> cup | 0.70 | Grapes are typically purchased as a bag and used by cups in recipes.
yes | no | 420 | Pecans | - -> bag | - -> g | 0.85 | Nuts are typically stored in bags and measured by weight in recipes.
yes | yes | 421 | Toasted Bread | - -> slice | - -> slice | 0.66 | Toasted bread is handled as individual slices in both storage and recipes.
yes | no | 422 | Cod Fillet | - -> piece | - -> g | 0.88 | Fillets are usually counted as pieces and recipes call for weight.
yes | no | 423 | Lemon | lb -> ea | - -> whole | 0.80 | Lemons are typically counted individually and recipes often call for whole lemons.
yes | no | 424 | Romaine Lettuce - romaine | - -> head | - -> cup | 0.92 | Romaine is commonly bought as heads and measured chopped in cups in recipes.
yes | no | 425 | Silken Tofu | - -> block | - -> g | 0.86 | Silken tofu is sold as blocks; recipes often specify weight.
yes | no | 426 | Vegetable Oil | - -> bottle | - -> tbsp | 0.90 | Oil is usually stored in a bottle and measured by tablespoons in recipes.
yes | no | 427 | Ground Coriander | - -> jar | - -> tsp | 0.94 | Ground spices are typically kept in jars and measured by teaspoons.
yes | no | 428 | Bagels | count -> count | - -> ea | 0.96 | Bagels are tracked individually and used per each in recipes.
yes | yes | 429 | Bread - sliced | count -> bag | - -> slice | 0.78 | Bread is typically stored as a bag/loaf and used by the slice in recipes.
yes | no | 430 | Hummus | g -> tub | - -> tbsp | 0.90 | Hummus is sold in tubs and commonly measured by spoonfuls in recipes.
yes | no | 431 | Pine Nuts | count -> bag | - -> g | 0.86 | Pine nuts are usually kept in small bags; recipes often specify weight.
yes | no | 432 | Smoked Salmon | pkg -> pkg | - -> g | 0.90 | Stocked as a package; recipes typically use weight.
yes | no | 433 | Cheddar Cheese | pkg -> block | - -> g | 0.90 | Cheddar is commonly bought as a block; recipes often measure by weight.
yes | no | 434 | Pita Bread | count -> count | - -> piece | 0.92 | Pitas are counted for stock and used per piece in recipes.
yes | no | 435 | Dehydrated Banana Snack | g -> bag | - -> g | 0.86 | Dried fruit snacks are typically sold in bags and measured by weight in recipes.
yes | yes | 436 | Cilantro | bunch -> bunch | - -> cup | 0.78 | Cilantro is bought by the bunch and most recipes call for chopped amounts in cups.
yes | no | 437 | Granola | g -> bag | - -> g | 0.84 | Granola is usually in a bag and portions are measured by weight.
yes | no | 438 | Soy Seasoning | fl oz -> bottle | - -> ml | 0.86 | Liquid seasoning is stored as a bottle and measured by volume in recipes.
yes | no | 439 | Brussels Sprouts | g -> g | - -> g | 0.90 | Typically tracked and cooked by weight.
yes | no | 440 | Mango | count -> count | - -> ea | 0.93 | Whole fruits are counted; recipes often call for 1 mango.
yes | no | 441 | Pineapple | count -> whole | - -> g | 0.86 | Kept as a whole fruit; recipes commonly measure pineapple by weight.
yes | no | 442 | Cucumber | count -> whole | - -> g | 0.80 | Stored as whole cucumbers; recipes often use weight for sliced/chopped amounts.
yes | no | 443 | Beyond Plant Based Breakfast Sausage | piece -> piece | - -> piece | 0.93 | Pack contains discrete sausages; recipes usually call for a number of pieces.
yes | no | 444 | Orange Sweet Potatoes | lb -> lb | - -> g | 0.84 | Sweet potatoes are typically stocked by the pound and measured by weight in recipes.
yes | yes | 445 | Baby Food Purée | pkg -> pkg | - -> ml | 0.76 | Baby food is stored as packages and used by volume.

## Product Recommendations

| Approved | Review | ID | Ingredient | Product | Size | Price Basis | Confidence | Reason |
| --- | --- | ---: | --- | --- | --- | --- | ---: | --- |
no | no | 1 | Flour | Anita's Organic Mill All Purpose Flour - Gluten Free | 1 kg -> 1 kg | - -> package | 0.95 | Flour commonly sold as a 1 kg bag.
no | no | 2 | Peanut Butter | Earth's Choice Peanut Butter - Crunchy | - -> 500 g | - -> package | 0.90 | Notes indicate a 500 g package.
no | no | 3 | Soy Milk | Silk Unsweetened Soy Milk | 64 fl oz -> 64 fl oz | package -> package | 0.98 | Silk soy milk commonly comes in 64 fl oz containers; label indicates this size.
yes | yes | 4 | Avocado | Large Hass Avocados | - -> 1 count | - -> unit 1 ea | 0.70 | Typically sold per each; size not otherwise specified.
no | no | 5 | Low Sodium Tamari | San-J International 50% Less Sodium Tamari | 296 ml -> 296 ml | package -> package | 0.96 | Standard San-J bottle size is 296 ml.
no | no | 6 | Tempeh | Green Cuisine Plain Tempeh | 225 g -> 225 g | package -> package | 0.93 | Tempeh blocks are commonly 225 g; value already provided and looks correct.
no | no | 7 | Egg Whites | Rabbit River Farms Egg Whites | 473 ml -> 473 ml | package -> package | 0.95 | Current product size indicates 473 ml.
no | no | 8 | Tempeh | Green Cuisine Sweet Chili Tempeh | - -> - | package -> package | 0.86 | Package size not stated in the product name; keep unit size unspecified.
no | no | 9 | Avocado | Organic Large Hass Avocados | 1 count -> 1 count | unit 1 ea -> unit 1 ea | 0.95 | Single avocado sold per each.
no | no | 10 | Smoked Salmon | DOM Reserve Singles Frozen Smoked Salmon | 750 g -> 750 g | package -> package | 0.90 | Product listing indicates a 750 g package.
yes | yes | 12 | Bread - sliced | Kirkland Signature Organic 21-Grain Bread | 4 count -> - | package -> package | 0.65 | Product name does not state loaf weight or count.
no | no | 13 | Soy Milk | Silk Plain Organic Soy Milk | 64 fl oz -> 64 fl oz | package -> package | 0.98 | Silk soy milk commonly comes in 64 fl oz containers; label indicates this size.
yes | yes | 14 | Blueberries | Naturipe Farms Organic Blueberries | - -> - | package -> package | 0.40 | Product name does not specify size; leaving unit size unknown.
no | no | 17 | Tofu - firm | Soyganic Extra Firm Tofu | 350 g -> 350 g | package -> package | 0.98 | Product listing shows 350 g; standard tofu block size.
no | no | 18 | Ground Beef | Kirkland Signature Organic Lean Ground Beef | 4 lb -> 4 lb | package -> package | 0.88 | Kirkland organic ground beef is typically sold as a 4 lb multi-pack.
no | no | 19 | Bell Pepper | Simple Truth Organic Organic Mixed Peppers | 2 count -> 2 count | package -> package | 0.82 | Pack indicates two mixed peppers; sold per package.
no | no | 20 | Cheddar Cheese | Balderson 2-Year Old Cheddar Cheese | 500 g -> 500 g | package -> package | 0.95 | Cheddar cheese commonly sold as a 500 g block/package.
no | no | 21 | Rolled Oats - rolled | One Degree Gluten-Free Organic Oats | 24 oz -> 24 oz | package -> package | 0.90 | Product is typically sold as a 24 oz bag; keep package-based pricing.
yes | yes | 22 | Pasta - paste | Kirkland Signature Organic Tomato Paste | 21 oz -> 21 oz | package -> package | 0.58 | Using the row’s 21 oz; tomato paste sizes vary and this may be a larger jar.
no | no | 23 | Raspberries | Nature’s Touch Frozen Organic Raspberries | 600 g -> 600 g | package -> package | 0.95 | Listing specifies a 600 g package; keeping package as the price basis.
no | no | 25 | Bagels | Salt Spring Bagels Frozen Organic Everything Bagels | 6 count -> 6 count | package -> package | 0.97 | Frozen bagels also come as a 6-count package; keep price per package.
no | no | 28 | Banana | Elan Organic Banana Chips | 135 g -> 135 g | package -> package | 0.95 | Product specifies a 135 g bag.
yes | yes | 29 | Bread - sliced | Angel Bakeries Whole Wheat Pita Bread | 4 count -> - | package -> package | 0.65 | Product name does not include pack count or weight.
no | no | 30 | Cornstarch | Bakers Supply House Organic Corn Starch | 250 g -> 250 g | package -> package | 0.95 | Product name specifies a 250 g package.
no | no | 31 | Rice - white | Lundberg Family Farms Organic Basmati White Rice | 907 g -> 907 g | package -> package | 0.98 | Current listing indicates a 907 g bag; keep price per package.
no | no | 32 | Rice - white | Everland Organic White Basmati Rice | 907 g -> 907 g | package -> package | 0.98 | Current listing indicates a 907 g bag; keep price per package.
no | no | 33 | Lemon Juice | Santa Cruz 100% Lemon Juice | 16 fl oz -> 16 fl oz | package -> package | 0.96 | Listing shows a 16 fl oz bottle; pricing is per package.
no | no | 34 | Tomatoes | Sunset Sweet Bites Cherry Tomatoes | 12 oz -> 12 oz | package -> package | 0.80 | Cherry tomatoes commonly come in ~10–16 oz clamshells; row indicates 12 oz.
no | no | 35 | Cilantro | Cal‑Organic Farms Organic Cilantro | 1 bunch -> 1 bunch | unit 1 bunch -> unit 1 bunch | 0.90 | Fresh cilantro is sold per bunch.
yes | yes | 36 | Hummus | Sunflower Kitchen Hummus | 280 g -> - | package -> package | 0.75 | Name omits tub size; multiple sizes exist.
no | no | 37 | Blueberries | Wish Farms Organic Blueberries | 6 oz -> 6 oz | package -> package | 0.95 | Consistent 6 oz clamshell packaging for organic blueberries.
no | no | 38 | Olive Oil - extra virgin | Terra Delyssa Organic Extra Virgin Olive Oil | 1 l -> 1 l | package -> package | 0.97 | Product listing shows a 1 L bottle; keep price per package.
no | no | 39 | Free Range Large Brown Eggs | Kirkland Signature Organic Large Free Range Eggs | 24 count -> 24 count | package -> package | 0.95 | Product indicates a 24-egg pack (two dozen).
no | no | 40 | Shiitake Mushroom | Far West Mushrooms Organic Shiitake Mushroom | 6 oz -> 6 oz | package -> package | 0.96 | Name and current data indicate a 6 oz package.
no | no | 41 | Water | Kirkland Signature Organic Coconut Water | 330 ml -> 330 ml | package -> package | 0.93 | Product name indicates a 330 ml package.
no | no | 44 | Avocado | Chosen Foods 100% Pure Avocado Oil Spray | 13.5 fl oz -> 13.5 fl oz | - -> package | 0.84 | Oil spray lists fluid ounces; sold per package.
no | no | 45 | Cottage Cheese | Island Farms Dairies 2% Cottage Cheese | 500 g -> 500 g | package -> package | 0.96 | Product row indicates a 500 g package; keep package price basis.
no | no | 46 | Apple | Triple Jim’s Organic Apple Chips | 75 g -> 75 g | package -> package | 0.95 | Product name indicates a 75 g snack pack priced per package.
no | no | 47 | Bagels | Salt Spring Bagels Organic Everything Bagels | 6 count -> 6 count | package -> package | 0.98 | Bagels are commonly sold as a 6-count package; keep price per package.
yes | yes | 48 | Lime | Robinson Fresh Organic Lime Bag | 2 lb -> 2 lb | weight 1 kg -> package | 0.72 | Product indicates a 2 lb bag of limes; such bags are typically sold per package rather than per kg.
yes | yes | 49 | Potatoes | Organic Sweet Potato Organic Orange Sweet Potato | 1 lb -> - | unit 1 ea -> unit 1 ea | 0.60 | Loose produce item; exact weight varies, so no fixed unit size; per-each pricing is plausible.
no | no | 50 | Avocado | Baby Gourmet Organic Puree Mango Avocado & Oats Pouch | 128 ml -> 128 ml | - -> package | 0.86 | Baby food pouch with fixed volume; priced per package.
yes | yes | 51 | Hummus | Nuba Pomegranate & Sumac Hummus | 280 g -> - | package -> package | 0.75 | Name omits tub size; multiple sizes exist.
no | no | 52 | Lemon | Whole Foods Market Organic Lemon Bag | 2 lb -> 2 lb | package -> package | 0.95 | Product name indicates a 2 lb bag; keep package-based pricing.
no | no | 53 | Dairy Free Coconut Yogurt | Yoggu! Cultured Coconut Lemon Dairy-Free Yogurt | 450 g -> 450 g | package -> package | 0.90 | Listing shows a 450 g tub; keep package-based pricing.
no | no | 54 | Peanut Butter | Nature’s Nuts Peanut Butter Smooth | 450 g -> 450 g | package -> package | 0.95 | Row already specifies a 450 g jar.
no | no | 55 | Mayonnaise | 365 by Whole Foods Market Organic Mayonnaise | 16 fl oz -> 16 fl oz | package -> package | 0.96 | Product record specifies a 16 fl oz package of mayonnaise.
no | no | 58 | Pine Nuts | Kirkland Signature Organic Pine Nuts | 1.5 lb -> 1.5 lb | package -> package | 0.95 | Kirkland pine nuts are sold in a 1.5 lb bag; row already specifies 1.5 lb.
no | no | 59 | Eggs - large | Kirkland Signature Organic Large Free Range Eggs | 24 count -> 24 count | package -> package | 0.98 | Label indicates a 24-count pack of large eggs.
no | no | 60 | Shiitake Mushroom | Far West Mushrooms Organic Shiitake Mushrooms | 6 oz -> 6 oz | package -> package | 0.96 | Name and current data indicate a 6 oz package.
no | no | 61 | Ground Beef | Kirkland Signature Organic Ground Beef, 85% Lean / 15% Fat, Refrigerated | 4 lb -> 4 lb | package -> package | 0.90 | Listing indicates a 4 lb total package.
no | no | 62 | Chicken Breasts - boneless skinless | Kirkland Signature Organic Boneless & Skinless Chicken Breasts | 1.88 kg -> 1.88 kg | package -> package | 0.90 | Row specifies a 1.88 kg package; package-based pricing retained.
no | no | 63 | Blueberries | Simply Nature Organic Blueberries | 6 oz -> 6 oz | package -> package | 0.95 | Standard retail size for organic blueberries is 6 oz; fields look correct.
no | no | 64 | Avocado Oil | Chosen Foods 100% Pure Avocado Oil | 500 ml -> 500 ml | package -> package | 0.97 | Product label indicates a 500 ml bottle.
no | no | 65 | Avocado Oil Spray | Chosen Foods 100% Pure Avocado Oil Spray | 13.5 fl oz -> 13.5 fl oz | - -> package | 0.80 | Listing indicates a 13.5 fl oz spray can; pricing is per package.
no | no | 66 | Beyond Plant Based Breakfast Sausage | Beyond Plant Based Breakfast Sausage | 8 piece -> 8 piece | package -> package | 0.94 | Same product line; 8-piece box is standard.
no | no | 68 | Pita Bread | Angel Bakeries Whole Wheat Pita Bread | 4 count -> 4 count | package -> package | 0.93 | Package states 4 pieces of pita bread.
yes | yes | 69 | Orange Sweet Potatoes | Organic Sweet Potato Organic Orange Sweet Potato | 1 lb -> - | unit 1 ea -> unit 1 ea | 0.62 | Likely priced per each; no reliable net weight indicated.
no | no | 70 | Dehydrated Banana Snack | Elan Organic Banana Chips | 135 g -> 135 g | package -> package | 0.95 | Product label indicates 135 g package.
no | no | 71 | Baby Food Purée | Baby Gourmet Organic Puree Mango Avocado & Oats Pouch | 128 ml -> 128 ml | - -> package | 0.90 | Product name indicates a pouch; 128 ml is a standard pouch size.
no | no | 72 | Ground Beef | Kirkland Signature Organic Ground Beef, 85% Lean / 15% Fat | 4 lb -> 4 lb | package -> package | 0.90 | Listing indicates a 4 lb total package.
no | no | 74 | Vanilla Extract | Simply Organic Vanilla Extract | 4 fl oz -> 4 fl oz | package -> package | 0.96 | Current product size indicates 4 fl oz.
no | no | 75 | Rolled Oats - rolled | 365 Organic Old-Fashioned Rolled Oats | 24 oz -> 24 oz | package -> package | 0.95 | Current data shows a 24 oz package, which matches common rolled oats packaging.
no | no | 76 | Granola | One Degree Organic Pumpkin Seed & Flax Sprouted Oat Granola | 312 g -> 312 g | package -> package | 0.95 | Package indicates 312 g.
no | no | 77 | Bell Pepper | Organic Yellow Bell Pepper | 1 count -> 1 count | weight 1 kg -> weight 1 kg | 0.87 | Single yellow bell pepper; priced by weight per kg.
no | no | 78 | Whole Tomatoes | 365 Organic Diced Tomatoes | 14.5 oz -> 14.5 oz | package -> package | 0.97 | Product name indicates a 14.5 oz can; keep package as price basis.
no | no | 79 | Red Curry Paste | Thai Kitchen Red Curry Paste | 4 oz -> 4 oz | package -> package | 0.98 | Thai Kitchen Red Curry Paste is sold as a 4 oz jar; package pricing applies.
no | no | 80 | Cinnamon | Splendor Garden Organic Ceylon Ground Cinnamon | 33 g -> 33 g | package -> package | 0.90 | Product listing indicates a 33 g package.
no | no | 81 | Soy Seasoning | Bragg Liquid Soy Seasoning | 16 fl oz -> 16 fl oz | package -> package | 0.96 | Labeled as a 16 fl oz bottle.
no | no | 82 | Lime | Lime | 1 count -> 1 count | unit 1 ea -> unit 1 ea | 0.96 | Single lime sold per each; current unit and unit pricing are consistent.
no | no | 83 | Blueberries | Driscoll Organic Blueberries | 6 oz -> 6 oz | package -> package | 0.95 | Branded organic blueberries typically in 6 oz clamshells; fields already set.
yes | yes | 84 | Grapes | Organic Red Seedless Grapes | 1 bag -> - | weight 1 kg -> weight 1 kg | 0.55 | Listed as a bag without a stated size; grapes are sold by weight, so keep weight-based pricing.
yes | yes | 85 | Flour | Lita’s Organic White Flour Tortillas | 280 g -> 280 g | package -> package | 0.75 | Product appears to be a 280 g tortilla package.
no | no | 86 | Green Onions | Organic Green Onion | 1 bunch -> 1 bunch | unit 1 ea -> unit 1 ea | 0.96 | Standard retail is per bunch; current per-unit basis fits.
no | no | 87 | Brussels Sprouts | Brussels Sprouts | 1.39 kg -> - | weight 1 kg -> weight 1 kg | 0.80 | Sold by weight; per-kg pricing; no fixed package size indicated.
no | no | 88 | Onions - yellow | Organic Yellow Onion | 1 count -> 1 count | weight 1 kg -> weight 1 kg | 0.94 | Loose onion sold as a single item, commonly priced per kg.
no | no | 89 | Red Bell Peppers - red | Kroger Organic Red Bell Pepper | 1 ea -> 1 ea | unit 1 ea -> unit 1 ea | 0.95 | Sold as one each; per-unit pricing fits.
no | no | 90 | Spaghetti | Bioitalia Organic Durum Semolina Spaghettini | 0.33 kg -> 330 g | weight 1 kg -> weight 1 kg | 0.90 | Row lists 0.33 kg; standardized to 330 g. Weight-based pricing per kg retained.
yes | yes | 91 | Lacinato Kale | Organic Dino Kale | 1 head -> 1 bunch | package -> package | 0.70 | Dino kale is typically sold by the bunch; package pricing applies.
no | no | 92 | Shiitake Mushroom | Organic Shiitake Mushroom | 6 oz -> 6 oz | package -> package | 0.96 | Name and current data indicate a 6 oz package.
yes | yes | 93 | Fusilli | 365 Organic Fusilli Pasta | 1 pkg -> - | package -> package | 0.65 | Product name gives no size; cannot infer contents. Keep package-based pricing.
no | no | 94 | Minced Garlic | Spice World Organic Garlic Squeeze | 870 g -> 870 g | weight 1 kg -> weight 1 kg | 0.90 | Listed as an 870 g container; per-kg pricing is common for this item.
yes | yes | 95 | Potatoes | Kettle Foods Pepperoncini Potato Chips | - -> - | package -> package | 0.30 | Snack chip bag sizes vary by brand/variant; no size given.
no | no | 96 | Banana | Organic Banana | 1 bunch -> 1 bunch | package -> package | 0.90 | Bunch sold as a single package.
no | no | 97 | Blueberries | Organic Blueberries | 6 oz -> 6 oz | package -> package | 0.95 | Organic blueberries commonly come in 6 oz clamshells; matches current fields.
yes | yes | 98 | Strawberries | Organic Strawberries | 1 pkg -> - | package -> package | 0.70 | No size indicated in the product name; keeping price per package.
no | no | 99 | Mango | Organic Red Mango | 1 count -> 1 count | unit 1 ea -> unit 1 ea | 0.95 | Single mango per unit.
no | no | 100 | Pineapple | Organic Pineapple | - -> 1 count | package -> package | 0.85 | Organic pineapple is typically sold per whole fruit (one each).
no | no | 101 | Dairy Free Coconut Yogurt | Yoggu! Vanilla Dairy-Free Coconut Yogurt | 450 g -> 450 g | package -> package | 0.90 | Listing shows a 450 g tub; keep package-based pricing.
yes | yes | 102 | Cashews | Millsie Original Creamy Cultured Cashew Cream Cheeze | - -> - | package -> package | 0.60 | Product name gives no size; keep package-based pricing.
no | no | 103 | Tofu - firm | Soyganic Organic Extra-Firm Tofu | 350 g -> 350 g | package -> package | 0.98 | Product listing shows 350 g; standard tofu block size.
yes | yes | 105 | Cucumber | Organic English Cucumbers | - -> - | package -> package | 0.45 | Likely a multi-pack of English cucumbers, but count varies by retailer.
no | no | 106 | Bell Pepper | From Our Farmers Organic Yellow Bell Pepper | 1 count -> 1 count | weight 0.19 kg -> weight 0.19 kg | 0.87 | Single yellow bell pepper; sold by variable weight per kg.
no | no | 107 | Cilantro | Organic Cilantro | 1 bunch -> 1 bunch | unit 1 bunch -> unit 1 bunch | 0.90 | Fresh cilantro is sold per bunch.
yes | yes | 108 | Grapes | Generic Organic Red Seedless Grapes | 454 g -> - | weight 0.81 kg -> weight 0.81 kg | 0.60 | Grapes are sold by weight and the name has no fixed package size; keep weight-based pricing.
no | no | 109 | Green Onions | Earthbound Farm Organic Green Onion | 1 bunch -> 1 bunch | package -> package | 0.90 | Sold as a single bunch; keeping current package price basis.
yes | yes | 110 | Onions - yellow | Cal‑Organic Farms Organic Yellow Onion | 1 count -> 1 count | package -> package | 0.70 | Branded single onion; unit size is one count and price is per package/each.
no | no | 111 | Red Bell Peppers - red | Suji Fresh Organic Red Bell Pepper | 1 count -> 1 count | package -> package | 0.90 | Product represents a single pepper; package contains one count.
no | no | 113 | Baking Powder | Bakers Supply House Organic Baking Powder (No Aluminum) | 227 g -> 227 g | package -> package | 0.97 | Product entry indicates a 227 g package; standard for baking powder.
no | no | 115 | Nutritional Yeast | Bob’s Red Mill Nutritional Yeast (B12) | 5 oz -> 5 oz | package -> package | 0.94 | Bob’s Red Mill nutritional yeast is sold in a 5 oz bag; row specifies 5 oz.
yes | yes | 116 | Apple | Organic Cosmic Crisp Apples | 2 lb -> 2 lb | weight 1 kg -> package | 0.72 | 2 lb suggests a pre-bagged package; price should be per package.
yes | yes | 117 | Apple | Envy Organic Envy Apples | 1 kg -> - | weight 1 kg -> weight 1 kg | 0.76 | Likely sold loose by weight; no fixed package size indicated.
no | no | 118 | Banana | Organic Bananas | - -> - | weight 1 kg -> weight 1 kg | 0.92 | Sold by weight; package size varies.
yes | yes | 121 | Onions - red | Organic Red Onion | 1.26 kg -> - | weight 1 kg -> weight 1 kg | 0.70 | Loose onion sold by weight; per-kg pricing is appropriate and a fixed package size is not.
no | no | 122 | Garlic | Christopher Ranch Organic Garlic | 1 head -> 1 head | unit 1 ea -> unit 1 ea | 0.95 | Sold as a single head of garlic; unit pricing per each is appropriate.
no | no | 123 | Green Onions | Marketside Organic Green Onion | 1 bunch -> 1 bunch | unit 1 ea -> unit 1 ea | 0.96 | Green onions are sold per bunch; listing shows per-unit pricing.
no | no | 124 | Broccoli | Earthbound Farm Organic Broccoli | 1 head -> 1 head | unit 1 ea -> unit 1 ea | 0.95 | Sold as a single head; unit pricing per each fits.
no | no | 126 | Beyond Plant Based Breakfast Sausage | Beyond Plant-Based Breakfast Sausage | 8 piece -> 8 piece | package -> package | 0.95 | Beyond breakfast sausage commonly sold as 8 pieces per box; provided size looks correct.
yes | yes | 127 | Brussels Sprouts | Organic Brussels Sprouts | 1.39 kg -> - | weight 1.39 kg -> weight 1 kg | 0.75 | Sold loose by weight; use per-kg pricing; no fixed package size.
no | no | 128 | Tempeh | Green Cuisine Miso Gravy Tempeh | - -> - | package -> package | 0.86 | Package size not stated in the product name; keep unit size unspecified.
yes | yes | 130 | Orange Sweet Potatoes | Organic Orange Sweet Potato | 1 lb -> - | unit 1 lb -> unit 1 lb | 0.72 | Loose produce sold per pound; no fixed package size.
yes | yes | 131 | Potatoes | Yellow Potato Bag | - -> - | package -> package | 0.38 | Name indicates a bag of yellow potatoes, but size is not specified.
yes | yes | 132 | Carrots | Organic Rainbow Carrot Bag | - -> - | package -> package | 0.40 | ‘Bag’ size not stated; keep package pricing without size.
no | no | 133 | Celery | Organic Celery Bunch | - -> 1 bunch | package -> package | 0.95 | Name indicates a single bunch of celery.
no | no | 134 | Honey | Capilano Labonté MGO 100+ Manuka Honey | 760 g -> 760 g | package -> package | 0.95 | Product entry shows a 760 g jar; keep package as price basis.
yes | yes | 135 | Baby Food Purée | Baby Gourmet Mango Avocado & Oats Baby Food | - -> - | package -> package | 0.60 | Baby food item without size in name; keep package pricing and leave size unknown.
