# Inventory Unit Cleanup Review

Generated: 2026-04-25T13:18:27.035Z
Model: gpt-5
Allowed units: count, g, kg, oz, lb, ml, l, fl oz, cup, tsp, tbsp, ea, piece, dozen, whole, clove, slice, sprig, pinch, head, bunch, pkg, bag, box, block, tub, container, jar, bottle, can, roll, sleeve

Nothing is approved by default. In the JSON file, set `approved` to `true` for rows you want to include in the SQL migration.

## Summary

- Inventory rows: 273
- Inventory rows needing review: 43
- Product rows: 120
- Product rows needing review: 25

## Inventory Recommendations

| Approved | Review | ID | Ingredient | Stock | Recipe | Confidence | Reason |
| --- | --- | ---: | --- | --- | --- | ---: | --- |
yes | no | 1 | Garlic | head -> head | clove -> clove | 0.95 | Garlic is bought as heads, recipes use cloves, and it keeps best at room temperature.
yes | no | 3 | Onions | count -> ea | ea -> whole | 0.90 | Onions are typically bought individually, used as whole onions in recipes, and stored at room temp.
yes | no | 4 | Shallots | count -> ea | ea -> whole | 0.90 | Shallots are bought by the piece, often called for as whole shallots, and kept in the pantry.
yes | no | 5 | Ginger | piece -> piece | g -> g | 0.86 | Ginger is bought as a piece/knob, recipes often use weight, and it keeps fresh in the fridge.
yes | yes | 6 | Avocado | count -> count | ea -> ea | 0.78 | Avocados are bought individually, recipes call for each/whole, and they typically ripen on the counter.
yes | no | 7 | Banana | count -> bunch | ea -> ea | 0.88 | Bananas are commonly purchased by the bunch, recipes use each banana, and they’re stored at room temperature.
yes | no | 8 | Basil | bunch -> bunch | g -> cup | 0.88 | Fresh basil is sold in bunches; recipes often call for cups of leaves; keep chilled for freshness.
yes | no | 9 | Broccoli | head -> head | g -> cup | 0.86 | Broccoli is bought by the head; recipes typically measure florets in cups; stored in the fridge.
yes | no | 10 | Carrots | count -> bag | g -> cup | 0.80 | Carrots are commonly purchased in bags; recipes use cups when chopped or shredded; keep refrigerated.
yes | no | 11 | Cauliflower | head -> head | g -> cup | 0.90 | Cauliflower is bought as a head, recipes use chopped florets by cups, and it’s kept in the fridge.
yes | no | 12 | Celery | bunch -> bunch | g -> cup | 0.95 | Celery is sold as a bunch, recipes measure it chopped by cups, and it’s stored in the fridge.
yes | no | 13 | Chicken Breasts - boneless skinless | count -> lb | g -> piece | 0.82 | Chicken breasts are typically bought/priced by the pound, recipes often call for a number of breasts, and raw chicken is kept in the fridge.
yes | no | 14 | Goat Cheese | pkg -> pkg | g -> g | 0.86 | Goat cheese is typically bought as a packaged log or tub and measured by weight; keep refrigerated.
yes | yes | 15 | Pepper - green | count -> count | ea -> ea | 0.78 | Fresh green peppers are bought by the piece, used by each in recipes, and kept in the fridge.
yes | no | 16 | Bell Pepper - red | count -> count | ea -> ea | 0.92 | Red bell peppers are typically purchased per pepper, referenced by each in recipes, and stored refrigerated.
yes | no | 17 | Ground Beef | kg -> lb | g -> lb | 0.93 | Ground beef is typically bought and measured by the pound and must be kept refrigerated.
yes | no | 18 | Jalapeños | count -> ea | ea -> ea | 0.86 | Jalapeños are usually purchased loose by the each; recipes call for a number of peppers; store in the fridge.
yes | no | 19 | Kale | bunch -> bunch | cup -> cup | 0.94 | Kale is commonly sold by the bunch; recipes measure it in cups when chopped; leafy greens are refrigerated.
yes | no | 21 | Mushrooms - button | pkg -> pkg | g -> cup | 0.88 | Button mushrooms are sold in small packages; recipes often call for cups (sliced); keep refrigerated.
yes | no | 22 | Pizza Dough | pkg -> pkg | g -> g | 0.80 | Pizza dough is typically a packaged dough ball; recipes specify weight; keep in the fridge when using.
yes | no | 23 | Raspberries | pkg -> container | cup -> cup | 0.92 | Fresh raspberries come in clamshell containers; recipes use cups; store refrigerated.
yes | no | 24 | Red Cabbage - red | head -> head | g -> cup | 0.93 | Typically bought as a head; recipes use cups of shredded cabbage; store refrigerated.
yes | no | 25 | Green Cabbage - green | head -> head | g -> cup | 0.93 | Typically bought as a head; recipes use cups of shredded cabbage; store refrigerated.
yes | no | 26 | Salmon | pkg -> pkg | g -> oz | 0.80 | Often purchased as a package of fillets; recipes call for ounces/pounds; keep chilled.
yes | no | 27 | Spinach | bag -> bag | g -> cup | 0.88 | Spinach is usually bought as a bag and measured by cups in recipes; leafy greens are kept in the fridge.
yes | no | 28 | Strawberries | container -> container | g -> cup | 0.90 | Strawberries are sold in clamshell containers, recipes call for cups, and they’re stored refrigerated.
yes | no | 29 | Thyme | bunch -> bunch | sprig -> sprig | 0.95 | Fresh thyme is stocked as a bunch and used by the sprig; fresh herbs are kept in the fridge.
yes | no | 30 | Tortillas - flour | bag -> bag | count -> count | 0.83 | Usually sold in a bag; recipes specify a number of tortillas; many keep opened tortillas in the fridge.
yes | yes | 31 | Zucchini | count -> count | g -> whole | 0.78 | Bought as whole pieces; recipes often call for whole zucchini; stored in the fridge.
yes | no | 135 | Soy Sauce | bottle -> bottle | ml -> tbsp | 0.95 | Sold in bottles; recipes measure by tablespoons; opened soy sauce is commonly kept in the fridge.
yes | no | 136 | Avocado Oil | bottle -> bottle | tbsp -> tbsp | 0.94 | Shelf-stable cooking oil; bought by the bottle, measured in tbsp, stored in pantry.
yes | no | 137 | Cornstarch | box -> box | tbsp -> tbsp | 0.96 | Dry starch is sold in a box, recipes use tbsp, and it keeps best in the pantry.
yes | no | 138 | Onion Powder | jar -> jar | tsp -> tsp | 0.96 | Spice sold in a jar, measured by tsp, and stored with pantry spices.
yes | no | 139 | Garlic Powder | jar -> jar | tsp -> tsp | 0.95 | Dried spice; typically bought in a jar, measured by teaspoons, stored at room temp.
yes | no | 140 | Salt | container -> container | tsp -> tsp | 0.87 | Salt is shelf-stable; commonly sold in a canister/container and measured by teaspoons.
yes | no | 141 | Black Pepper | jar -> jar | tsp -> tsp | 0.92 | Ground pepper is a dried spice; usually in a jar, measured by teaspoons, kept in pantry.
yes | no | 142 | Baking Powder | container -> container | tsp -> tsp | 0.94 | Baking powder is bought in a container, measured by teaspoons, and kept sealed in the pantry.
yes | no | 143 | Rice Vinegar | bottle -> bottle | tbsp -> tbsp | 0.86 | Rice vinegar is bought in bottles, used by tablespoons, and is shelf-stable at room temp.
yes | no | 144 | Honey | jar -> jar | tbsp -> tbsp | 0.95 | Honey is typically in a jar, measured by tablespoons, and stored at room temp (fridge causes crystallization).
yes | yes | 145 | Sesame Oil | bottle -> bottle | ml -> tsp | 0.78 | Oil is typically bought as a bottle, used by teaspoons, and stored in the pantry; refrigeration is optional.
yes | no | 183 | Water | bottle -> bottle | ml -> cup | 0.90 | Bottled water is stocked as bottles, measured in cups in recipes, and kept at room temp until chilled for serving.
yes | no | 184 | Minced Garlic | jar -> jar | tsp -> tsp | 0.95 | Jarred minced garlic is purchased in jars, measured by teaspoon, and kept refrigerated after opening.
yes | no | 185 | Eggs - large | count -> dozen | count -> ea | 0.95 | Eggs are typically bought by the dozen, recipes use a count of eggs, and they’re kept refrigerated.
yes | no | 186 | Milk | container -> container | ml -> ml | 0.98 | Milk is bought in cartons/jugs (a container), measured by volume, and must be refrigerated.
yes | no | 187 | Flour | bag -> bag | g -> g | 0.96 | Flour is sold in bags, recipes often measure it by grams, and it’s shelf-stable in the pantry.
yes | no | 188 | Vanilla Extract | bottle -> bottle | tsp -> tsp | 0.95 | Usually bought as a small bottle; recipes use teaspoons; shelf-stable in the pantry.
yes | yes | 189 | Egg Yolks | ea -> ea | ea -> ea | 0.72 | Yolks are typically separated and counted each; must be refrigerated.
yes | yes | 190 | Egg Whites | container -> container | ea -> ea | 0.78 | Often purchased as a refrigerated carton/container; recipes usually call for egg whites by count.
yes | no | 191 | Sugar - granulated | bag -> bag | g -> cup | 0.93 | Granulated sugar is sold in bags, measured by cups in recipes, and kept shelf-stable in the pantry.
yes | no | 192 | Lemon Juice | bottle -> bottle | ml -> tbsp | 0.88 | Lemon juice is bought in bottles, recipes call for tablespoons, and it’s kept refrigerated once in use.
yes | no | 193 | Avocado Oil Spray | can -> can | tsp -> tsp | 0.83 | Avocado oil spray comes in a can; recipes approximate by teaspoons; it’s stored at room temperature.
yes | no | 194 | Yogurt | tub -> tub | cup -> cup | 0.96 | Yogurt is bought as a tub, measured in cups, and must be refrigerated.
yes | no | 195 | Blackberries | container -> container | cup -> cup | 0.92 | Fresh blackberries are sold in containers, measured in cups, and kept refrigerated.
yes | yes | 196 | Peaches | piece -> ea | ea -> ea | 0.70 | Peaches are commonly tracked by each; recipes often use whole fruit; typically ripened at room temp.
yes | yes | 197 | Egg Yolks | count -> count | count -> count | 0.76 | Yolks are tracked and used by count and should be kept refrigerated.
yes | no | 198 | Soy Milk | container -> container | ml -> ml | 0.90 | Soy milk is bought in containers and measured by volume; kept in the fridge once in use.
yes | no | 199 | Flour | bag -> bag | g -> g | 0.95 | Flour is sold in bags, measured by weight, and stored as a dry good in the pantry.
yes | no | 200 | Cornstarch | box -> box | tbsp -> tbsp | 0.96 | Typically bought in a box and measured by tablespoons in recipes; shelf-stable.
yes | no | 201 | Baking Powder | can -> can | tsp -> tsp | 0.97 | Commonly sold in small cans; used by teaspoons in baking; pantry item.
yes | no | 202 | Sea Salt | container -> container | tsp -> tsp | 0.88 | Often sold in containers; recipes use teaspoons; shelf-stable.
yes | no | 203 | Vanilla Extract | bottle -> bottle | tsp -> tsp | 0.97 | Vanilla extract is sold in small bottles, measured by teaspoons in recipes, and kept at room temperature.
yes | no | 204 | Avocado Oil Spray | can -> can | tsp -> tsp | 0.86 | Avocado oil spray comes in an aerosol can; recipes approximate usage in teaspoons; store with other cooking oils.
yes | yes | 205 | Water | bottle -> bottle | ml -> cup | 0.72 | When stocked, water is typically in bottles; recipes call for cups; unopened bottles are stored at room temperature.
yes | no | 206 | Egg Whites | container -> container | ea -> ea | 0.87 | Typically bought as a refrigerated container of liquid egg whites; recipes often call for a number of egg whites; keep in the fridge.
yes | no | 207 | Sugar - granulated | bag -> bag | g -> cup | 0.97 | Granulated sugar is sold in bags, measured by cups in recipes, and stored in the pantry.
yes | no | 208 | Lemon Juice | bottle -> bottle | ml -> tbsp | 0.90 | Lemon juice is commonly sold in bottles, measured by tablespoons in recipes, and kept in the fridge once in use.
yes | yes | 209 | Pears | piece -> ea | piece -> ea | 0.78 | Pears are usually bought individually; many recipes call for a number of pears; room temp storage is typical.
yes | no | 210 | Butter | block -> block | tbsp -> tbsp | 0.95 | Butter is sold as blocks/sticks, measured in tbsp in recipes, and kept refrigerated.
yes | no | 213 | Brandy | bottle -> bottle | ml -> ml | 0.92 | Brandy is sold in bottles, measured by volume in recipes, and is shelf-stable.
yes | no | 214 | Unsalted Butter | block -> block | tbsp -> tbsp | 0.92 | Butter is typically bought as blocks and measured by tablespoons; dairy is kept refrigerated.
yes | no | 215 | Salted Butter | block -> block | tbsp -> tbsp | 0.92 | Salted butter is sold as blocks, measured by tablespoons, and stored in the fridge.
yes | no | 218 | Chicken Breasts - boneless skinless | pkg -> pkg | g -> g | 0.88 | Chicken breasts are bought by the package, recipes use weight, and raw poultry is kept refrigerated.
yes | no | 220 | All Purpose White Flour | bag -> bag | g -> cup | 0.95 | Flour is bought in bags, recipes often use cups, and it stores shelf-stable in the pantry.
yes | no | 221 | Cake & Pastry Unbleached White Flour | bag -> bag | g -> cup | 0.95 | Cake/pastry flour is sold in bags, commonly measured in cups, and kept in the pantry.
yes | no | 222 | Lacinato Kale | bunch -> bunch | g -> cup | 0.85 | Kale is typically sold by the bunch, recipes use cups when chopped, and it should be refrigerated.
yes | no | 223 | Curly Kale | bunch -> bunch | g -> cup | 0.90 | Kale is typically sold by the bunch, used chopped by the cup, and kept refrigerated.
yes | no | 225 | Baby Bella Mushrooms | pkg -> pkg | g -> oz | 0.88 | Baby bellas are commonly sold in small packages, called for by ounces in recipes, and stored in the fridge.
yes | no | 226 | Shiitake Mushroom | pkg -> pkg | g -> oz | 0.86 | Fresh shiitakes are sold in packages, recipes often use ounces, and they are refrigerated.
yes | no | 227 | Portabello Mushroom | ea -> ea | g -> g | 0.90 | Portobello caps are often bought by the piece; recipes typically use weight; keep refrigerated.
yes | no | 228 | Oyster Mushrooms | pkg -> pkg | g -> g | 0.88 | Oyster mushrooms are commonly sold in small packages; recipes use weight; store in the fridge.
yes | no | 229 | Trumpet Mushrooms | ea -> pkg | g -> g | 0.84 | Trumpet (king oyster) mushrooms are often sold in shrink-wrapped packs; recipes use weight; refrigerate.
yes | no | 231 | Free Range Large Brown Eggs | dozen -> dozen | count -> count | 0.96 | Eggs are bought by the dozen, counted in recipes, and kept refrigerated.
yes | no | 233 | Soy Milk | container -> container | ml -> cup | 0.84 | Soy milk is sold in containers, measured by cups in recipes, and kept in the fridge once opened.
yes | no | 234 | Low Sodium Tamari | bottle -> bottle | ml -> tbsp | 0.90 | Tamari comes in bottles, recipes use tablespoons, and it’s refrigerated after opening for quality.
yes | no | 235 | Tamari | bottle -> bottle | ml -> tbsp | 0.90 | Tamari is bought as a bottle; recipes use tablespoons; kept in the fridge after opening.
yes | no | 236 | Tofu - firm | block -> block | g -> g | 0.97 | Firm tofu is sold as blocks, often measured by weight in recipes, and is refrigerated.
yes | yes | 237 | Soft Tofu | box -> tub | g -> g | 0.70 | Soft tofu is typically sold in tubs and kept refrigerated; recipes usually use weight.
yes | no | 240 | Dairy Free Coconut Yogurt | tub -> tub | cup -> cup | 0.96 | Coconut yogurt is sold in tubs, measured by volume in recipes, and kept refrigerated.
yes | no | 241 | Greek Yogurt | tub -> tub | cup -> cup | 0.96 | Greek yogurt is bought as a tub, used by the cup, and stored in the fridge.
yes | no | 242 | Rice - brown | bag -> bag | cup -> cup | 0.95 | Brown rice is typically sold in bags, measured by cups when cooking, and kept in the pantry.
yes | no | 243 | Rice - white | g -> bag | g -> cup | 0.95 | Dry white rice is typically bought in bags, measured in cups for recipes, and stored in the pantry.
yes | no | 244 | Rice - white | g -> bag | g -> cup | 0.95 | Dry white rice is typically bought in bags, measured in cups for recipes, and stored in the pantry.
yes | no | 245 | Short-Grain White Rice | g -> bag | g -> cup | 0.94 | Short-grain white rice is commonly sold in bags, measured in cups when cooking, and kept in the pantry.
yes | no | 246 | Sugar - granulated | bag -> bag | g -> cup | 0.95 | Granulated sugar is sold in bags, recipes usually call for cups, and it’s shelf-stable in the pantry.
yes | no | 247 | Brown Sugar | bag -> bag | g -> cup | 0.92 | Brown sugar is typically bought in a bag, measured by cups in recipes, and kept in the pantry.
yes | no | 248 | Hazelnuts | bag -> bag | g -> cup | 0.85 | Hazelnuts are commonly sold in bags; recipes often use cups; pantry storage is typical short-term.
yes | no | 249 | Almonds | bag -> bag | g -> cup | 0.86 | Usually bought in bags; recipes often use cups; shelf-stable at room temp.
yes | no | 250 | Black Vinegar | bottle -> bottle | ml -> tbsp | 0.95 | Sold in bottles; used by spoonfuls; vinegar is shelf-stable.
yes | yes | 251 | Cold Water | bottle -> bottle | ml -> cup | 0.58 | If purchased, kept as bottles at room temp; recipes call for cups of water.
yes | yes | 252 | Hot Water | bottle -> bottle | ml -> cup | 0.55 | Bottled water is stocked as bottles; recipes call for cups of hot water; shelf-stable at room temp.
yes | no | 253 | Rice Noodles | pkg -> pkg | g -> g | 0.93 | Dried rice noodles are bought in packages, measured by weight, and stored in the pantry.
yes | no | 254 | Watercress | bunch -> bunch | g -> bunch | 0.84 | Watercress is sold and often called for as a bunch; it’s a delicate green kept refrigerated.
yes | no | 255 | Chili Flakes | jar -> jar | tsp -> tsp | 0.96 | Dried spice typically sold in a jar, measured by teaspoons, shelf‑stable in the pantry.
yes | yes | 256 | Unsalted Shrimp Stock | container -> box | ml -> cup | 0.70 | Stock is commonly in a box/carton or can; recipes use cups; once opened it’s kept in the fridge.
yes | no | 257 | White Miso Paste | tub -> tub | tbsp -> tbsp | 0.93 | Miso paste is sold in tubs, used by tablespoon, and stored refrigerated.
yes | no | 258 | Green Onions | bunch -> bunch | ea -> ea | 0.94 | Green onions are sold by the bunch, recipes often call for a number of stalks, and they keep best refrigerated.
yes | no | 259 | Chili Oil | bottle -> bottle | tsp -> tsp | 0.88 | Chili oil is typically in bottles, measured by teaspoons, and is shelf-stable.
yes | no | 260 | Furikake | bottle -> bottle | tsp -> tsp | 0.90 | Furikake comes in small bottles/shakers, used by teaspoons, and stores with dry spices.
yes | no | 261 | Olive Oil - extra virgin | bottle -> bottle | tbsp -> tbsp | 0.97 | Extra-virgin olive oil is bought in bottles, measured by tablespoons in recipes, and kept in the pantry.
yes | no | 262 | Olive Oil - extra virgin | bottle -> bottle | tbsp -> tbsp | 0.97 | Extra-virgin olive oil is bought in bottles, measured by tablespoons in recipes, and kept in the pantry.
yes | no | 263 | Pasta | box -> box | g -> g | 0.93 | Dried pasta is commonly sold by the box, measured by weight in recipes, and stored in the pantry.
yes | no | 264 | Spaghetti | pkg -> box | g -> g | 0.86 | Dried spaghetti is typically bought as a box, measured by weight in recipes, and stored in the pantry.
yes | no | 265 | Fusilli | pkg -> box | g -> g | 0.80 | Fusilli is usually sold as a box, measured by grams in recipes, and kept shelf-stable in the pantry.
yes | no | 266 | Macaroni | pkg -> box | g -> g | 0.86 | Macaroni is commonly stocked as a box, measured by weight in recipes, and stored in the pantry.
yes | no | 267 | Conchiglie | pkg -> box | g -> g | 0.93 | Dry pasta is typically sold in boxes, measured by weight, and kept in the pantry.
yes | yes | 268 | Gnocchi | pkg -> pkg | g -> g | 0.78 | Shelf-stable gnocchi is usually a vacuum-sealed package, measured by weight, stored in the pantry; fresh versions go in the fridge.
yes | no | 269 | Farfalle | pkg -> box | g -> g | 0.93 | Dry pasta is typically sold in boxes, measured by weight, and kept in the pantry.
yes | no | 270 | Rigatoni | pkg -> box | g -> g | 0.85 | Dried pasta is usually sold in boxes, measured by weight in recipes, and kept in the pantry.
yes | no | 271 | Penne | pkg -> box | g -> g | 0.88 | Penne is commonly bought as a box, measured by grams, and stored in the pantry.
yes | no | 272 | Oat Milk | container -> container | ml -> cup | 0.90 | Oat milk is bought in a carton/container, measured by volume, and kept refrigerated when in use.
yes | no | 273 | Coconut Milk | can -> can | ml -> ml | 0.95 | Typically bought as cans, measured by volume in recipes, and kept in the pantry unopened.
yes | no | 274 | Onions - red | ea -> ea | g -> ea | 0.84 | Red onions are bought loose by the each, recipes often say '1 red onion', and they store at room temperature.
yes | no | 275 | White Onions | ea -> ea | g -> ea | 0.84 | White onions are typically purchased by the each, recipes often use whole counts, and they store at room temperature.
yes | no | 276 | Onions - yellow | count -> ea | whole -> whole | 0.94 | Yellow onions are bought loose by the each, recipes say “1 onion,” and they keep at room temp.
yes | no | 277 | Red Lentils | bag -> bag | cup -> cup | 0.96 | Dried red lentils are sold in bags, measured by cups when cooking, and are shelf-stable.
yes | no | 299 | Sea Salt | container -> container | tsp -> tsp | 0.90 | Sea salt is typically sold in a container, used by teaspoons, and stored in the pantry.
yes | no | 300 | Himalayan Salt | container -> jar | tsp -> tsp | 0.80 | Himalayan salt is often sold in a jar/grinder; recipes use teaspoons; it’s a shelf-stable spice.
yes | no | 301 | Kosher Salt | box -> box | tsp -> tsp | 0.97 | Kosher salt is typically sold in a box; recipes measure it by teaspoons; store in pantry.
yes | no | 302 | Lasagne | pkg -> box | g -> g | 0.90 | Dry lasagna noodles are sold in boxes; recipes often call for pasta by weight; keep dry pasta in the pantry.
yes | no | 303 | Italian Sausage | pkg -> pkg | g -> lb | 0.88 | Italian sausage is typically bought in 1 lb packages, used by weight in recipes, and kept refrigerated when in use.
yes | yes | 304 | Tomatoes | ea -> ea | g -> cup | 0.70 | Whole tomatoes are commonly counted when stocking, measured chopped by the cup in recipes, and kept at room temperature for best flavor.
yes | no | 305 | Pasta - paste | can -> can | tbsp -> tbsp | 0.90 | Tomato paste is usually in cans, recipes call for tablespoons, and opened paste is kept in the fridge.
yes | no | 306 | Ricotta | tub -> tub | g -> cup | 0.95 | Ricotta is typically sold in tubs, measured by cups in recipes, and kept refrigerated.
yes | no | 307 | Parmesan | container -> container | g -> cup | 0.86 | Parmesan is often bought pre-grated in a container; recipes call for cups of grated cheese; store in the fridge after opening.
yes | no | 308 | Parsley Flakes | jar -> jar | tsp -> tsp | 0.98 | Dried parsley flakes are sold in jars, measured by teaspoons, and kept in the pantry.
yes | yes | 309 | Mozzarella | block -> block | g -> cup | 0.78 | Mozzarella is commonly bought as a block and used in recipes by cup when shredded; keep refrigerated.
yes | no | 310 | Fish Sauce | bottle -> bottle | ml -> tbsp | 0.90 | Fish sauce is sold in bottles, measured by spoonfuls, and is shelf-stable in the pantry.
yes | no | 311 | Red Curry Paste | jar -> jar | tbsp -> tbsp | 0.92 | Curry paste is sold in jars, measured by tablespoons, and kept in the fridge after opening.
yes | no | 312 | Turmeric | jar -> jar | tsp -> tsp | 0.96 | Dried spice typically bought in a jar, measured by teaspoons, and kept in the pantry.
yes | no | 313 | Ground Ginger | jar -> jar | tsp -> tsp | 0.96 | Ground spice is usually in a jar, used by teaspoons, and stored in the pantry.
yes | no | 314 | Lime | count -> count | whole -> whole | 0.84 | Limes are commonly bought by the piece or in bags, recipes often call for a whole lime, and they keep at room temperature.
yes | no | 315 | Shrimp | bag -> bag | g -> lb | 0.88 | Shrimp is typically bought frozen in bags, measured by weight in recipes, and stored in the freezer.
yes | no | 316 | Pepper | jar -> jar | tsp -> tsp | 0.96 | Ground/whole pepper is sold in jars, measured by teaspoons in recipes, and is shelf-stable.
yes | no | 317 | Bell Pepper | ea -> ea | ea -> ea | 0.93 | Bell peppers are bought by the each, often used by count in recipes, and kept in the fridge for freshness.
yes | no | 318 | Cashews | bag -> bag | g -> cup | 0.82 | Nuts are typically bought in bags, measured by cups in recipes, and kept pantry-stable.
yes | no | 319 | Habaneros | ea -> ea | ea -> ea | 0.90 | Fresh chilies are bought loose by the each, recipes call for whole peppers, and they keep best refrigerated.
yes | no | 320 | Chili Powder | jar -> jar | tsp -> tsp | 0.96 | Chili powder is a dried spice sold in jars, used by teaspoons, and kept in the pantry.
yes | no | 321 | Crushed Tomatoes | can -> can | ml -> cup | 0.93 | Crushed tomatoes are typically bought as cans, measured by cups in recipes, and stored unopened in the pantry.
yes | no | 322 | Kidney Beans | bag -> bag | g -> cup | 0.90 | Dried kidney beans are sold in bags, recipes usually call for cups (dry or cooked), and they’re pantry-stable.
yes | no | 323 | Red Wine | bottle -> bottle | ml -> cup | 0.84 | Red wine is bought by the bottle, recipes commonly use cups, and it’s typically stored at room temperature.
yes | no | 324 | Mezcal | bottle -> bottle | oz -> oz | 0.96 | Mezcal is bought as a bottle, measured in oz for cocktails, and is shelf-stable at room temp.
yes | no | 325 | Triple Sec | bottle -> bottle | oz -> oz | 0.94 | Triple sec is typically purchased as a bottle, measured in oz in recipes, and stored at room temp.
yes | no | 326 | Lime Juice | bottle -> bottle | ml -> ml | 0.82 | Lime juice is usually in a bottle, measured by volume, and kept refrigerated once opened or if fresh.
yes | yes | 327 | Sugar Syrup | bottle -> bottle | ml -> tbsp | 0.70 | Sugar syrups are typically sold in bottles, measured by spoons or cups, and are shelf-stable when commercially packaged.
yes | no | 328 | Olive Brine | jar -> jar | ml -> ml | 0.82 | Olive brine usually comes from a jar of olives, recipes use volume, and opened jars are kept refrigerated.
yes | no | 329 | Ice Cubes | piece -> bag | piece -> piece | 0.85 | Ice for purchase is a bag of cubes, recipes often call for cubes by piece, and it must be frozen.
yes | no | 330 | Dates - medjool | box -> box | piece -> piece | 0.90 | Medjool dates are typically sold in a box; recipes often call for a count of dates; dried fruit is shelf-stable in the pantry.
yes | no | 331 | Coconut Oil | jar -> jar | tbsp -> tbsp | 0.95 | Coconut oil is commonly purchased in jars; recipes measure it by tablespoons; it’s shelf-stable at room temperature.
yes | yes | 332 | Flax Seeds | bag -> bag | tbsp -> tbsp | 0.78 | Flax seeds are usually sold in bags; recipes use tablespoons; whole seeds keep well in the pantry (though some refrigerate for longer freshness).
yes | no | 333 | Chia Seeds | bag -> bag | tbsp -> tbsp | 0.96 | Usually sold in bags; recipes use tablespoons; dry seeds are shelf-stable.
yes | no | 334 | Smoked Paprika | jar -> jar | tsp -> tsp | 0.98 | Spices are typically in small jars; recipes measure in teaspoons; store with spices in pantry.
yes | no | 335 | Balsamic Vinegar | bottle -> bottle | tbsp -> tbsp | 0.96 | Vinegar is bought in bottles; recipes call for tablespoons; it’s shelf-stable at room temperature.
yes | no | 336 | Walnuts | bag -> bag | g -> cup | 0.86 | Walnuts are typically sold in bags; recipes often call for cups; commonly kept in the pantry when in use.
yes | no | 337 | Icing Sugar | bag -> bag | g -> cup | 0.90 | Icing sugar is usually packaged in bags; baking recipes use cups; keep dry in the pantry.
yes | no | 338 | Sugar - granulated | bag -> bag | g -> cup | 0.95 | Granulated sugar is sold in bags; recipes measure it by cups; stored in the pantry.
yes | no | 339 | Potatoes | ea -> bag | g -> lb | 0.82 | Potatoes are typically bought in bags and measured by weight in recipes; store in a cool pantry.
yes | yes | 340 | Potatoes - russet | ea -> ea | g -> ea | 0.76 | Russets are often purchased loose by the each and many recipes call for a specific number; pantry storage.
yes | no | 341 | Red Potatoes | bag -> bag | g -> lb | 0.84 | Red potatoes commonly come in bags and are used by the pound; keep in a cool, dark pantry.
yes | no | 342 | Yellow Potatoes | bag -> bag | g -> g | 0.86 | Potatoes are commonly bought in bags, recipes use weight, and they store best in a cool pantry.
yes | no | 343 | Fingerling Potatoes | bag -> bag | g -> g | 0.80 | Fingerlings are often sold in small bags, recipes use weight, and they keep at room temperature.
yes | no | 344 | Fine Salt | container -> container | tsp -> tsp | 0.96 | Fine salt is sold in a container, measured by teaspoons, and is shelf-stable in the pantry.
yes | yes | 345 | Sesame Seeds | bag -> jar | tbsp -> tbsp | 0.78 | Typically sold as a small spice jar; recipes use tablespoons; shelf-stable in the pantry.
yes | no | 346 | Maple Syrup | bottle -> bottle | tbsp -> tbsp | 0.94 | Commonly bought as a bottle; recipes measure by tablespoons; refrigerate after opening.
yes | no | 347 | Baking Soda | box -> box | tsp -> tsp | 0.96 | Usually sold in a box; measured by teaspoons in baking; shelf-stable pantry item.
yes | yes | 348 | Fresh Clean Snow | container -> container | cup -> cup | 0.55 | Snow is gathered in a container, measured in cups for recipes, and must be kept frozen to stay usable.
yes | no | 349 | Cinnamon | jar -> jar | tsp -> tsp | 0.98 | Ground cinnamon is sold in jars, used by teaspoons, and stored in a cool, dry pantry.
yes | yes | 350 | Lemon Zest | container -> ea | tsp -> tsp | 0.64 | Lemon zest is typically taken from whole lemons (each), measured in teaspoons, and kept chilled if prepped or the lemons are refrigerated.
yes | no | 351 | Crushed Roasted Nuts | bag -> bag | g -> cup | 0.80 | Crushed nuts are usually bought in bags, measured by volume in recipes, and kept shelf-stable in the pantry.
yes | yes | 352 | Apple | ea -> ea | ea -> ea | 0.74 | Apples are commonly counted by each for shopping and recipes, and are fine at room temperature.
yes | yes | 353 | Cocoa Nibs | bag -> bag | g -> tbsp | 0.79 | Cocoa nibs are typically sold in bags, measured by tablespoons in recipes, and stored in the pantry.
yes | no | 354 | Peanut Butter | jar -> jar | tbsp -> tbsp | 0.95 | Usually bought as a jar, measured by tbsp, typically stored in the pantry.
yes | yes | 355 | Flaxseed Meal | bag -> bag | tbsp -> tbsp | 0.72 | Sold in bags, used by tbsp; ground flax is commonly refrigerated to prevent rancidity.
yes | no | 356 | Almond Milk | container -> container | ml -> cup | 0.88 | Bought in cartons/containers, recipes use cups; kept in the fridge when in use.
yes | no | 357 | Lamb Stew Meat | pkg -> lb | g -> lb | 0.86 | Fresh stew meat is bought by the pound, recipes often call for pounds, and it’s kept in the fridge when in use.
yes | no | 358 | Beef Bone Broth | container -> box | ml -> cup | 0.84 | Bone broth is commonly sold in aseptic boxes, measured by cups in recipes, and refrigerated after opening.
yes | no | 359 | Bay Leaf | jar -> jar | whole -> whole | 0.95 | Dried bay leaves are stocked in spice jars, used as whole leaves, and stored at room temperature.
yes | no | 360 | Spinach - baby | bag -> bag | g -> cup | 0.88 | Baby spinach is typically sold in bags/clamshells, measured by cups in recipes, and kept refrigerated.
yes | no | 361 | Vanilla Bean | piece -> piece | piece -> piece | 0.93 | Vanilla beans are bought and used whole by the piece and keep best sealed at room temperature.
yes | yes | 362 | Filtered Water | bottle -> bottle | ml -> cup | 0.78 | Filtered water is commonly stocked as bottles; recipes usually call for cups; room temperature storage is fine.
yes | no | 363 | Coconut Butter | jar -> jar | tbsp -> tbsp | 0.93 | Coconut butter is sold in jars, measured by spoonful in recipes, and is shelf-stable.
yes | no | 364 | Whole-wheat Fettuccini | box -> box | g -> g | 0.95 | Dry pasta is typically bought in boxes, recipes use weight, and it stores in the pantry.
yes | no | 365 | Marinated Goat Cheese | jar -> jar | g -> g | 0.82 | Marinated goat cheese is sold in jars, called by weight, and must be refrigerated.
yes | no | 366 | Rolled Oats - rolled | bag -> bag | cup -> cup | 0.92 | Rolled oats are commonly sold in bags, measured by cups in recipes, and kept in the pantry.
yes | yes | 367 | Wheat Germ | bag -> jar | tbsp -> tbsp | 0.72 | Wheat germ is often sold in jars; recipes use tablespoons; usually refrigerated after opening to prevent rancidity.
yes | yes | 368 | Maca Root Powder | bag -> bag | tsp -> tsp | 0.78 | Maca powder is typically in a pouch/bag, measured by teaspoons, and stored in a cool pantry.
yes | no | 369 | Hemp Seeds | bag -> bag | tbsp -> tbsp | 0.87 | Hemp seeds are sold in bags, recipes measure by tablespoons, and they’re typically kept in the pantry (some refrigerate for longer freshness).
yes | no | 370 | Flax Oil | bottle -> bottle | tbsp -> tbsp | 0.94 | Flax oil is bought as a bottle, measured by tablespoons, and is usually refrigerated to protect its delicate fats.
yes | no | 371 | Brown Rice Vinegar | bottle -> bottle | tbsp -> tbsp | 0.95 | Brown rice vinegar comes in bottles, recipes use tablespoons, and vinegar is shelf-stable in the pantry.
yes | no | 372 | Sesame | bag -> bag | tbsp -> tbsp | 0.86 | Sesame seeds are often bought in bags, measured by spoonfuls in recipes, and kept in the pantry.
yes | no | 373 | Black Sesame Seeds | bag -> bag | tbsp -> tbsp | 0.90 | Black sesame seeds are typically sold in bags, used by the tablespoon, and stored at room temperature.
yes | no | 374 | Soba Noodles | pkg -> pkg | g -> g | 0.93 | Dried soba noodles come in packages, recipes specify grams/ounces, and they store in the pantry.
yes | no | 375 | Napa Cabbage | head -> head | g -> cup | 0.93 | Usually bought as a head, used chopped by the cup, and kept refrigerated.
yes | no | 376 | Edamame | bag -> bag | g -> cup | 0.80 | Commonly sold frozen in bags, measured by cups, and stored in the freezer.
yes | no | 377 | Sun-dried Tomatoes | jar -> jar | g -> cup | 0.86 | Typically oil-packed in a jar, used chopped by the cup, and refrigerated after opening.
yes | no | 378 | Sprouts and Microgreens | container -> container | g -> cup | 0.80 | Sold in clamshell containers, measured by the cup, and kept refrigerated.
yes | no | 379 | Mint | bunch -> bunch | sprig -> sprig | 0.92 | Fresh herb typically bought as a bunch, used by sprig, and stored in the fridge.
yes | yes | 380 | Marinated Tofu Steaks | pkg -> pkg | g -> piece | 0.76 | Pre-marinated tofu steaks are sold as refrigerated packages and recipes count steaks by piece.
yes | no | 383 | Toasted Mixed Nuts | bag -> bag | g -> cup | 0.82 | Nuts are commonly sold in bags, recipes use cups for nuts, and they keep shelf-stable in the pantry.
yes | no | 384 | Crispy Onions | container -> container | cup -> cup | 0.86 | Crispy onions are typically sold in a container, measured by cups as a topping, and stored in the pantry.
yes | yes | 385 | Edible Flowers | container -> container | ea -> ea | 0.72 | Edible flowers are sold in small clamshell containers, often counted by each in recipes, and need refrigeration.
yes | yes | 386 | 3-6-9 Dressing | bottle -> bottle | tbsp -> tbsp | 0.66 | Dressing is sold in bottles, measured by tablespoons, and typically refrigerated after opening.
yes | no | 387 | Cream of Tartar | jar -> jar | tsp -> tsp | 0.96 | Powdered baking acid sold in small jars; recipes use teaspoons; pantry-stable.
yes | no | 388 | Neutral Oil | bottle -> bottle | tbsp -> tbsp | 0.94 | Neutral cooking oils are bought in bottles, measured by tablespoons, and stored at room temperature.
yes | no | 389 | Dark Chocolate Chips | bag -> bag | g -> cup | 0.90 | Chocolate chips are bought in bags, measured by cups in recipes, and stored at room temp.
yes | no | 390 | Blueberries | container -> container | cup -> cup | 0.95 | Fresh blueberries come in clamshell containers, are measured by cups, and kept refrigerated.
yes | no | 391 | Kombu | pkg -> pkg | piece -> piece | 0.90 | Dried kombu is sold in packages, used by the piece, and stored shelf-stable.
yes | no | 392 | Tempeh | pkg -> block | g -> g | 0.90 | Tempeh is sold as blocks and measured by weight; it’s perishable and kept in the fridge.
yes | no | 393 | Frozen Peas | bag -> bag | cup -> cup | 0.98 | Frozen peas are bought in bags, measured by volume, and stored frozen.
yes | no | 394 | Apple Cider Vinegar | bottle -> bottle | tbsp -> tbsp | 0.97 | Vinegar is bought in bottles, used by tablespoons, and is shelf-stable.
yes | no | 395 | Liquid Smoke | bottle -> bottle | tsp -> tsp | 0.94 | Sold in small bottles, used by the teaspoon, and shelf-stable.
yes | no | 396 | Frozen Berries | bag -> bag | cup -> cup | 0.98 | Frozen fruit is bought in bags, measured by cups, and must stay frozen.
yes | no | 398 | Ground Cumin | jar -> jar | tsp -> tsp | 0.96 | Dried spice typically sold in jars, measured by teaspoons, stored in pantry.
yes | no | 399 | Paprika | jar -> jar | tsp -> tsp | 0.97 | Dried spice; typically bought in a jar, measured in teaspoons, and shelf-stable.
yes | no | 400 | Whole Tomatoes | can -> can | g -> can | 0.94 | Canned tomatoes are bought and used by the can; unopened cans are pantry items.
yes | no | 401 | Parsley | bunch -> bunch | tbsp -> tbsp | 0.90 | Fresh herb sold by the bunch, often measured in tablespoons when chopped; kept refrigerated.
yes | no | 402 | Feta | tub -> tub | g -> g | 0.95 | Feta is commonly sold in tubs and measured by weight; keep refrigerated.
yes | yes | 403 | Coconut Whipping Cream | can -> can | ml -> ml | 0.70 | Usually sold in cans, measured by volume; chill/store in the fridge when in use.
yes | no | 404 | Cacao Powder | bag -> bag | tbsp -> tbsp | 0.95 | Cacao powder is sold in bags, recipes use tablespoons, and it’s shelf-stable.
yes | yes | 405 | Brazil Nuts | bag -> bag | g -> cup | 0.78 | Nuts are typically bought in bags, recipes measure them by cups, and they are shelf-stable.
yes | yes | 406 | Pine Nuts | bag -> bag | g -> cup | 0.72 | Pine nuts are sold in small bags, recipes often call for cups, and they’re pantry-stable (fridge extends freshness).
yes | no | 407 | Nutritional Yeast | bag -> bag | tbsp -> tbsp | 0.90 | Nutritional yeast is commonly sold in bags, used by tablespoons in recipes, and kept with dry goods.
yes | no | 408 | Kabocha | whole -> whole | g -> cup | 0.86 | Winter squash is bought whole, recipes use cups of diced squash, and it keeps at room temp.
yes | no | 409 | Cottage Cheese | tub -> tub | cup -> cup | 0.97 | Cottage cheese is sold in tubs, measured by volume, and must be refrigerated.
yes | no | 410 | Tahini | jar -> jar | tbsp -> tbsp | 0.82 | Tahini is typically sold in jars, measured by tablespoons, and is shelf-stable in the pantry.
yes | no | 411 | Turmeric | jar -> jar | tsp -> tsp | 0.96 | Dried spice typically bought in a small jar, measured by teaspoons, kept in the pantry.
yes | no | 412 | Cardamom | jar -> jar | tsp -> tsp | 0.92 | Commonly sold as a jar (pods or ground), used by teaspoons, stored in the pantry.
yes | no | 413 | Black Peppercorns | jar -> jar | tsp -> tsp | 0.94 | Peppercorns are sold in jars, recipes call for teaspoon amounts, and they are pantry-stable.
yes | yes | 414 | Black Tea | box -> box | ml -> bag | 0.70 | Typically bought as a box of tea bags; recipes often call for 1–2 bags; dry tea is kept in the pantry.
yes | no | 415 | Tahini | jar -> jar | tbsp -> tbsp | 0.95 | Tahini is sold in jars, measured by spoonfuls, and is shelf-stable in the pantry.
yes | no | 416 | Mayonnaise | jar -> jar | tbsp -> tbsp | 0.95 | Mayonnaise is sold in jars, measured by spoonfuls, and is kept refrigerated after opening.
yes | no | 417 | White Wine Vinegar | bottle -> bottle | ml -> tbsp | 0.95 | Vinegar is bought in bottles, measured by tablespoons in recipes, and is shelf-stable in the pantry.
yes | no | 418 | Dijon Mustard - dijon | jar -> jar | tsp -> tbsp | 0.86 | Dijon mustard is typically in a jar, used by tablespoons in dressings/sauces, and kept refrigerated after opening.
yes | no | 419 | Grapes | bag -> bag | cup -> cup | 0.90 | Grapes are commonly bought in bags, recipes use cups, and fresh grapes are stored in the fridge.
yes | no | 420 | Pecans | bag -> bag | g -> cup | 0.88 | Pecans are usually sold in bags, measured in cups for recipes, and kept in the pantry for short-term use.
yes | yes | 421 | Toasted Bread | slice -> slice | slice -> slice | 0.54 | Toasted bread is counted by slices and briefly kept at room temperature.
yes | no | 422 | Cod Fillet | piece -> piece | g -> g | 0.93 | Cod fillets are bought as individual pieces or by weight, recipes use grams, and fish must be kept cold.
yes | no | 423 | Lemon | ea -> ea | whole -> whole | 0.90 | Lemons are bought by the each or in bags, recipes use whole lemons, and citrus keeps fine at room temp.
yes | no | 424 | Romaine Lettuce - romaine | head -> head | cup -> cup | 0.96 | Romaine is sold by the head, recipes use cups of chopped leaves, and leafy greens belong in the fridge.
yes | yes | 425 | Silken Tofu | block -> block | g -> g | 0.70 | Tofu is typically a block, recipes call for grams, and tofu is usually refrigerated (some silken packs are shelf-stable).
yes | no | 426 | Vegetable Oil | bottle -> bottle | tbsp -> tbsp | 0.96 | Vegetable oil is bought in bottles, measured by tablespoons in recipes, and kept at room temperature.
yes | no | 427 | Ground Coriander | jar -> jar | tsp -> tsp | 0.95 | Ground spices are typically sold in small jars, used by teaspoons, and stored in the pantry.
yes | yes | 428 | Bagels | count -> bag | ea -> ea | 0.78 | Bagels are commonly sold in bags, used per each, and kept at room temp for short-term use.
yes | no | 429 | Bread - sliced | bag -> bag | slice -> slice | 0.90 | Sliced bread is sold bagged, recipes call for slices, and it’s typically kept at room temperature.
yes | no | 430 | Hummus | tub -> tub | tbsp -> tbsp | 0.97 | Hummus is sold in tubs, measured by tablespoons in recipes, and must be refrigerated.
yes | yes | 431 | Pine Nuts | bag -> bag | g -> cup | 0.72 | Pine nuts are commonly sold in small bags; recipes often measure by cups; usually stored in the pantry (though some refrigerate).
yes | no | 432 | Smoked Salmon | pkg -> pkg | g -> g | 0.82 | Usually bought in sealed packages, recipes use weight, and it’s kept refrigerated when in use.
yes | no | 433 | Cheddar Cheese | block -> block | g -> g | 0.96 | Cheddar is commonly sold as blocks, measured by weight, and stored in the fridge.
yes | no | 434 | Pita Bread | count -> bag | piece -> piece | 0.84 | Pita is typically sold in bags, recipes call for pieces, and it’s kept at room temp while in active use.
yes | no | 435 | Dehydrated Banana Snack | bag -> bag | g -> g | 0.86 | Banana chips are sold in bags, measured by weight in recipes, and are shelf-stable.
yes | no | 436 | Cilantro | bunch -> bunch | cup -> cup | 0.94 | Cilantro is bought by the bunch, used chopped by volume, and kept in the fridge.
yes | no | 437 | Granola | bag -> bag | g -> cup | 0.88 | Granola is typically a bagged pantry cereal and measured by cups in recipes/servings.
yes | yes | 438 | Soy Seasoning | bottle -> bottle | ml -> tbsp | 0.74 | Usually bought as a bottle; recipes use tablespoons; shelf-stable pantry item.
yes | no | 439 | Brussels Sprouts | g -> lb | g -> lb | 0.86 | Commonly purchased and referenced by the pound; fresh sprouts are refrigerated.
yes | no | 440 | Mango | count -> count | ea -> ea | 0.88 | Typically bought as individual fruits; recipes often say '1 mango'; uncut mangoes keep at room temp.
yes | no | 441 | Pineapple | whole -> ea | g -> cup | 0.86 | Usually bought by the each, recipes call for cups of chunks, and whole pineapples sit at room temp until cut.
yes | no | 442 | Cucumber | whole -> ea | g -> cup | 0.84 | Commonly bought each, recipes use cups of sliced cucumber, and they’re typically kept in the fridge.
yes | yes | 443 | Beyond Plant Based Breakfast Sausage | piece -> box | piece -> piece | 0.73 | Sold as a box of patties/links, recipes refer to pieces, and most people store them frozen.
yes | no | 444 | Orange Sweet Potatoes | lb -> lb | g -> g | 0.88 | Sweet potatoes are commonly bought loose by the pound, measured by weight in recipes, and stored at room temp.
yes | yes | 445 | Baby Food Purée | pkg -> pkg | ml -> ml | 0.76 | Baby food is typically sold as single pouches/packages, measured by volume, and is shelf-stable unopened.
yes | no | 446 | Pumpkin Seeds | bag -> bag | - -> cup | 0.89 | Pumpkin seeds are usually bought in bags, measured by cups in recipes, and kept in the pantry.
yes | no | 447 | Dehydrated Mushroom Snack | bag -> bag | - -> g | 0.88 | Sold as snack bags; if used in cooking it's weighed; shelf-stable in the pantry.
yes | no | 448 | Iceberg Lettuce - romaine | head -> head | g -> cup | 0.82 | Romaine is bought by the head; recipes usually call for chopped cups; keep refrigerated.
yes | no | 449 | Pistachios | bag -> bag | g -> cup | 0.87 | Pistachios are typically sold in bags; recipes measure by cups; shelf-stable pantry nut.

## Product Recommendations

| Approved | Review | ID | Ingredient | Product | Size | Price Basis | Confidence | Reason |
| --- | --- | ---: | --- | --- | --- | --- | ---: | --- |
yes | no | 1 | Flour | Anita's Organic Mill All Purpose Flour - Gluten Free | 1 kg -> 1 kg | - -> package | 0.95 | Gluten-free all-purpose flour commonly sold in 1 kg bags; package pricing applies.
yes | no | 2 | Peanut Butter | Earth's Choice Peanut Butter - Crunchy | - -> 500 g | - -> package | 0.90 | Product notes indicate a 500 g package.
yes | no | 3 | Soy Milk | Silk Unsweetened Soy Milk | 64 fl oz -> 64 fl oz | package -> package | 0.92 | Listing shows a 64 fl oz carton; priced per package.
yes | no | 4 | Avocado | Large Hass Avocados | 1 count -> 1 count | unit 1 ea -> unit 1 ea | 0.95 | Loose avocado sold per each; package size is 1 avocado and priced per unit.
yes | no | 5 | Low Sodium Tamari | San-J International 50% Less Sodium Tamari | 296 ml -> 296 ml | package -> package | 0.94 | San-J tamari bottle is typically 10 fl oz ≈ 296 ml.
yes | no | 6 | Tempeh | Green Cuisine Plain Tempeh | 225 g -> 225 g | package -> package | 0.90 | Plain tempeh commonly comes in 225 g packs; matches current data.
yes | no | 7 | Egg Whites | Rabbit River Farms Egg Whites | 473 ml -> 473 ml | package -> package | 0.94 | Label indicates a 473 ml carton; priced per package.
yes | yes | 8 | Tempeh | Green Cuisine Sweet Chili Tempeh | - -> - | package -> package | 0.45 | Package size not specified in the name; cannot infer amount.
yes | no | 9 | Avocado | Organic Large Hass Avocados | 1 count -> 1 count | unit 1 ea -> unit 1 ea | 0.95 | Loose avocado sold per each; package size is 1 avocado and priced per unit.
yes | no | 10 | Smoked Salmon | DOM Reserve Singles Frozen Smoked Salmon | 750 g -> 750 g | package -> package | 0.90 | Listed as frozen singles with a 750 g package size.
yes | yes | 12 | Bread - sliced | Kirkland Signature Organic 21-Grain Bread | - -> - | package -> package | 0.40 | Product name does not specify weight or count; sizes vary by brand.
yes | no | 13 | Soy Milk | Silk Plain Organic Soy Milk | 64 fl oz -> 64 fl oz | package -> package | 0.92 | Listing shows a 64 fl oz carton; priced per package.
yes | no | 14 | Blueberries | Naturipe Farms Organic Blueberries | - -> 6 oz | package -> package | 0.84 | Brand commonly sells fresh organic blueberries in 6 oz clamshells; other rows match 6 oz.
yes | no | 16 | Pistachios | Kirkland Signature Roasted & Salted Shelled Pistachios | 1.5 lb -> 1.5 lb | package -> package | 0.95 | Kirkland bag is labeled 1.5 lb.
yes | no | 17 | Tofu - firm | Soyganic Extra Firm Tofu | 350 g -> 350 g | package -> package | 0.99 | Listed as a 350 g package of extra-firm tofu.
yes | no | 18 | Ground Beef | Kirkland Signature Organic Lean Ground Beef | 4 lb -> 4 lb | package -> package | 0.95 | Product listing indicates a 4 lb package; keeping package as price basis.
yes | no | 19 | Bell Pepper | Simple Truth Organic Organic Mixed Peppers | 2 count -> 2 count | package -> package | 0.88 | Pack contains 2 peppers; typically sold as a package.
yes | no | 20 | Cheddar Cheese | Balderson 2-Year Old Cheddar Cheese | 500 g -> 500 g | package -> package | 0.95 | Common 500 g cheddar block; current size matches typical packaging.
yes | no | 21 | Rolled Oats - rolled | One Degree Gluten-Free Organic Oats | 24 oz -> 24 oz | package -> package | 0.92 | One Degree gluten-free organic oats are typically sold as a 24 oz bag; matches current package size.
yes | yes | 22 | Pasta - paste | Kirkland Signature Organic Tomato Paste | 21 oz -> - | package -> package | 0.40 | The product name doesn’t indicate a clear size; Kirkland tomato paste is sold in various multi-packs, so exact package size isn’t inferable.
yes | no | 23 | Raspberries | Nature’s Touch Frozen Organic Raspberries | 600 g -> 600 g | package -> package | 0.98 | Product name shows a 600 g frozen raspberry package; priced per package.
yes | no | 24 | Dehydrated Mushroom Snack | DJ&A Shiitake Mushroom Crisps | 30 g -> 30 g | package -> package | 0.95 | Product is a 30 g bag of mushroom crisps.
yes | no | 25 | Bagels | Salt Spring Bagels Frozen Organic Everything Bagels | 6 count -> 6 count | package -> package | 0.90 | Frozen variant also typically sold as a 6-count bag; pricing is per package.
yes | no | 28 | Banana | Elan Organic Banana Chips | 135 g -> 135 g | package -> package | 0.95 | Banana chips bag clearly labeled 135 g and sold per package.
yes | yes | 29 | Bread - sliced | Angel Bakeries Whole Wheat Pita Bread | - -> - | package -> package | 0.40 | No size indicated in name; pita packages vary by count and weight.
yes | no | 30 | Cornstarch | Bakers Supply House Organic Corn Starch | 250 g -> 250 g | package -> package | 0.98 | Product specifies a 250 g package; priced per package.
yes | no | 31 | Rice - white | Lundberg Family Farms Organic Basmati White Rice | 907 g -> 907 g | package -> package | 0.97 | Product listing shows a 907 g package, a common 2 lb bag size for basmati rice.
yes | no | 32 | Rice - white | Everland Organic White Basmati Rice | 907 g -> 907 g | package -> package | 0.97 | Product listing shows a 907 g package, a common 2 lb bag size for basmati rice.
yes | no | 33 | Lemon Juice | Santa Cruz 100% Lemon Juice | 16 fl oz -> 16 fl oz | package -> package | 0.97 | Label shows a 16 fl oz bottle; package-level pricing is standard.
yes | yes | 34 | Tomatoes | Sunset Sweet Bites Cherry Tomatoes | 12 oz -> 12 oz | package -> package | 0.72 | Cherry tomatoes commonly come in 10–12 oz clamshells; keeping 12 oz as entered is plausible.
yes | no | 35 | Cilantro | Cal‑Organic Farms Organic Cilantro | 1 bunch -> 1 bunch | unit 1 bunch -> unit 1 bunch | 0.96 | Fresh cilantro is sold and priced per bunch.
yes | yes | 36 | Hummus | Sunflower Kitchen Hummus | - -> - | package -> package | 0.40 | No size in product name; hummus tubs come in multiple sizes.
yes | no | 37 | Blueberries | Wish Farms Organic Blueberries | 6 oz -> 6 oz | package -> package | 0.98 | Listing specifies a 6 oz clamshell.
yes | no | 38 | Olive Oil - extra virgin | Terra Delyssa Organic Extra Virgin Olive Oil | 1 l -> 1 l | package -> package | 0.96 | Listing shows a 1 l bottle; price applies per package.
yes | no | 39 | Free Range Large Brown Eggs | Kirkland Signature Organic Large Free Range Eggs | 24 count -> 24 count | package -> package | 0.95 | Product is a 24-egg (two dozen) package.
yes | no | 40 | Shiitake Mushroom | Far West Mushrooms Organic Shiitake Mushroom | 6 oz -> 6 oz | package -> package | 0.97 | Listing shows a 6 oz package.
yes | no | 41 | Water | Kirkland Signature Organic Coconut Water | 330 ml -> 330 ml | package -> package | 0.92 | Single-serve coconut water commonly comes in 330 ml packages; existing size looks correct.
yes | no | 44 | Avocado | Chosen Foods 100% Pure Avocado Oil Spray | 13.5 fl oz -> 13.5 fl oz | - -> package | 0.90 | Avocado oil spray bottle labeled 13.5 fl oz; sold per bottle.
yes | no | 45 | Cottage Cheese | Island Farms Dairies 2% Cottage Cheese | 500 g -> 500 g | package -> package | 0.97 | Listed as a 500 g tub; priced per package.
yes | no | 46 | Apple | Triple Jim’s Organic Apple Chips | 75 g -> 75 g | package -> package | 0.95 | Label shows a 75 g bag; sold per package.
yes | no | 47 | Bagels | Salt Spring Bagels Organic Everything Bagels | 6 count -> 6 count | package -> package | 0.90 | Product listing indicates a 6-count bag; pricing is per package.
yes | no | 48 | Lime | Robinson Fresh Organic Lime Bag | 2 lb -> 2 lb | package -> package | 0.95 | Product name indicates a bag and listing shows a 2 lb package.
yes | yes | 49 | Potatoes | Organic Sweet Potato Organic Orange Sweet Potato | - -> - | unit 1 ea -> unit 1 ea | 0.70 | Sweet potatoes are commonly sold per each; weight varies so unit pricing fits.
yes | no | 50 | Avocado | Baby Gourmet Organic Puree Mango Avocado & Oats Pouch | 128 ml -> 128 ml | - -> package | 0.86 | Baby food pouches are typically 128 ml and sold per pouch.
yes | yes | 51 | Hummus | Nuba Pomegranate & Sumac Hummus | - -> - | package -> package | 0.40 | No package size listed; hummus is sold in various tub sizes.
yes | no | 52 | Lemon | Whole Foods Market Organic Lemon Bag | 2 lb -> 2 lb | package -> package | 0.95 | Labeled as a 2 lb bag of lemons; price is per package.
yes | no | 53 | Dairy Free Coconut Yogurt | Yoggu! Cultured Coconut Lemon Dairy-Free Yogurt | 450 g -> 450 g | package -> package | 0.92 | Listing indicates a 450 g tub; package pricing applies.
yes | no | 54 | Peanut Butter | Nature’s Nuts Peanut Butter Smooth | 450 g -> 450 g | package -> package | 0.93 | Row already specifies a 450 g package.
yes | no | 55 | Mayonnaise | 365 by Whole Foods Market Organic Mayonnaise | 16 fl oz -> 16 fl oz | package -> package | 0.96 | Already specified as a 16 fl oz jar; mayo jars are priced per package.
yes | no | 58 | Pine Nuts | Kirkland Signature Organic Pine Nuts | 1.5 lb -> 1.5 lb | package -> package | 0.96 | Product listing indicates a 1.5 lb package.
yes | no | 59 | Eggs - large | Kirkland Signature Organic Large Free Range Eggs | 24 count -> 24 count | package -> package | 0.98 | Kirkland large eggs commonly come as a 24-egg pack; current package basis is appropriate.
yes | no | 60 | Shiitake Mushroom | Far West Mushrooms Organic Shiitake Mushrooms | 6 oz -> 6 oz | package -> package | 0.97 | Product name shows a 6 oz pack.
yes | no | 61 | Ground Beef | Kirkland Signature Organic Ground Beef, 85% Lean / 15% Fat, Refrigerated | 4 lb -> 4 lb | package -> package | 0.95 | Product listing indicates a 4 lb package; keeping package as price basis.
yes | no | 62 | Chicken Breasts - boneless skinless | Kirkland Signature Organic Boneless & Skinless Chicken Breasts | 1.88 kg -> 1.88 kg | package -> package | 0.86 | Row already specifies a 1.88 kg package; pricing is per package.
yes | no | 63 | Blueberries | Simply Nature Organic Blueberries | 6 oz -> 6 oz | package -> package | 0.98 | Listing specifies a 6 oz clamshell.
yes | no | 64 | Avocado Oil | Chosen Foods 100% Pure Avocado Oil | 500 ml -> 500 ml | package -> package | 0.98 | Product specifies a 500 ml package; priced per package.
yes | no | 65 | Avocado Oil Spray | Chosen Foods 100% Pure Avocado Oil Spray | 13.5 fl oz -> 13.5 fl oz | - -> package | 0.85 | Product name indicates a 13.5 fl oz spray can; priced per can.
yes | no | 66 | Beyond Plant Based Breakfast Sausage | Beyond Plant Based Breakfast Sausage | 8 piece -> 8 piece | package -> package | 0.92 | Beyond breakfast sausage commonly comes 8 pieces per box; already indicated.
yes | no | 68 | Pita Bread | Angel Bakeries Whole Wheat Pita Bread | 4 count -> 4 count | package -> package | 0.88 | Product name and current size indicate a pack of 4 pitas.
yes | no | 69 | Orange Sweet Potatoes | Organic Sweet Potato Organic Orange Sweet Potato | - -> - | unit 1 ea -> unit 1 ea | 0.82 | Some stores price sweet potatoes per each; no fixed package size.
yes | no | 70 | Dehydrated Banana Snack | Elan Organic Banana Chips | 135 g -> 135 g | package -> package | 0.97 | Product indicates a 135 g bag; sold per package.
yes | no | 71 | Baby Food Purée | Baby Gourmet Organic Puree Mango Avocado & Oats Pouch | 128 ml -> 128 ml | - -> package | 0.92 | Unit size given as 128 ml; pouches are sold per package.
yes | no | 72 | Ground Beef | Kirkland Signature Organic Ground Beef, 85% Lean / 15% Fat | 4 lb -> 4 lb | package -> package | 0.95 | Product listing indicates a 4 lb package; keeping package as price basis.
yes | no | 74 | Vanilla Extract | Simply Organic Vanilla Extract | 4 fl oz -> 4 fl oz | package -> package | 0.95 | Product is a 4 fl oz bottle; priced per package.
yes | no | 75 | Rolled Oats - rolled | 365 Organic Old-Fashioned Rolled Oats | 24 oz -> 24 oz | package -> package | 0.94 | Organic old-fashioned rolled oats commonly come in a 24 oz bag; matches current package size.
yes | no | 76 | Granola | One Degree Organic Pumpkin Seed & Flax Sprouted Oat Granola | 312 g -> 312 g | package -> package | 0.97 | Granola bag lists 312 g; priced per package.
yes | no | 77 | Bell Pepper | Organic Yellow Bell Pepper | 1 count -> 1 count | weight 1 kg -> weight 1 kg | 0.90 | Single pepper sold by weight; per‑kg pricing looks correct.
yes | no | 78 | Whole Tomatoes | 365 Organic Diced Tomatoes | 14.5 oz -> 14.5 oz | package -> package | 0.96 | Standard 14.5 oz can size indicated in the product data.
yes | no | 79 | Red Curry Paste | Thai Kitchen Red Curry Paste | 4 oz -> 4 oz | package -> package | 0.96 | Thai Kitchen Red Curry Paste is typically a 4 oz jar; pricing is per package.
yes | no | 80 | Cinnamon | Splendor Garden Organic Ceylon Ground Cinnamon | 33 g -> 33 g | package -> package | 0.95 | Label indicates a 33 g package of ground cinnamon.
yes | no | 81 | Soy Seasoning | Bragg Liquid Soy Seasoning | 16 fl oz -> 16 fl oz | package -> package | 0.95 | Product name/label indicates a 16 fl oz bottle; package-priced item.
yes | no | 82 | Lime | Lime | 1 count -> 1 count | unit 1 ea -> unit 1 ea | 0.98 | Loose lime sold per each; unit size is one lime with unit pricing.
yes | no | 83 | Blueberries | Driscoll Organic Blueberries | 6 oz -> 6 oz | package -> package | 0.98 | Listing specifies a 6 oz clamshell.
yes | no | 84 | Grapes | Organic Red Seedless Grapes | - -> - | weight 1 kg -> weight 1 kg | 0.85 | Sold by weight; no fixed package size indicated. Preserve the existing per-kg pricing basis.
yes | yes | 85 | Flour | Lita’s Organic White Flour Tortillas | 280 g -> 280 g | package -> package | 0.75 | Listing indicates a 280 g package of tortillas; price per package is standard.
yes | no | 86 | Green Onions | Organic Green Onion | 1 bunch -> 1 bunch | unit 1 ea -> unit 1 ea | 0.95 | Generic organic green onions typically sold per bunch; listing shows unit pricing.
yes | yes | 87 | Brussels Sprouts | Brussels Sprouts | 1.39 kg -> - | weight 1 kg -> weight 1 kg | 0.70 | Variable-weight produce; 1.39 kg suggests a weighed amount; use null size and keep price per kg.
yes | no | 88 | Onions - yellow | Organic Yellow Onion | 1 count -> 1 count | weight 1 kg -> weight 1 kg | 0.86 | Loose onion listed as 1 count; stores often price onions per kg.
yes | no | 89 | Bell Pepper - red | Kroger Organic Red Bell Pepper | 1 ea -> 1 ea | unit 1 ea -> unit 1 ea | 0.95 | Sold per each; package contains one pepper and pricing is per unit.
yes | yes | 90 | Spaghetti | Bioitalia Organic Durum Semolina Spaghettini | 0.33 kg -> - | weight 1 kg -> weight 1 kg | 0.38 | Package size not stated in the name and varies by market; leave size unknown and keep per-kg pricing.
yes | no | 91 | Lacinato Kale | Organic Dino Kale | 1 bunch -> 1 bunch | package -> package | 0.90 | The product indicates a single bunch of kale; priced per package.
yes | no | 92 | Shiitake Mushroom | Organic Shiitake Mushroom | 6 oz -> 6 oz | package -> package | 0.97 | Listing indicates a 6 oz package.
yes | yes | 93 | Fusilli | 365 Organic Fusilli Pasta | - -> - | package -> package | 0.50 | No size in the product name; leave unit size unknown and keep per-package pricing.
yes | no | 94 | Minced Garlic | Spice World Organic Garlic Squeeze | 269 g -> 269 g | package -> package | 0.93 | Spice World Organic Garlic Squeeze is typically 9.5 oz (269 g); current package size is consistent.
yes | yes | 95 | Potatoes | Kettle Foods Pepperoncini Potato Chips | - -> - | package -> package | 0.36 | Chips are a packaged snack with variable sizes; no size indicated.
yes | no | 96 | Banana | Organic Banana | 1 bunch -> 1 bunch | package -> package | 0.88 | Listing indicates a bunch; typically sold per bunch as a package.
yes | no | 97 | Blueberries | Organic Blueberries | 6 oz -> 6 oz | package -> package | 0.98 | Listing specifies a 6 oz clamshell.
yes | yes | 98 | Strawberries | Organic Strawberries | - -> - | package -> package | 0.35 | Product name doesn’t specify size; keep price per package with unknown unit size.
yes | no | 99 | Mango | Organic Red Mango | 1 count -> 1 count | unit 1 ea -> unit 1 ea | 0.95 | Mangoes are sold individually; one fruit per unit; priced per each.
yes | no | 100 | Pineapple | Organic Pineapple | - -> 1 ea | package -> package | 0.88 | A whole pineapple is sold one each.
yes | no | 101 | Dairy Free Coconut Yogurt | Yoggu! Vanilla Dairy-Free Coconut Yogurt | 450 g -> 450 g | package -> package | 0.92 | Listing indicates a 450 g tub; package pricing applies.
yes | yes | 102 | Cashews | Millsie Original Creamy Cultured Cashew Cream Cheeze | - -> - | package -> package | 0.45 | Product name gives no size; keep price basis as package without inferring amount.
yes | no | 103 | Tofu - firm | Soyganic Organic Extra-Firm Tofu | 350 g -> 350 g | package -> package | 0.99 | Listed as a 350 g package of extra-firm tofu.
yes | yes | 104 | Pumpkin Seeds | Elan Organic Raw Pumpkin Seeds | - -> - | package -> package | 0.64 | Package size varies by brand; not specified here; sold per package.
yes | yes | 105 | Cucumber | Organic English Cucumbers | - -> - | package -> package | 0.40 | Pack size (count or weight) isn’t stated in the name.
yes | yes | 106 | Bell Pepper | From Our Farmers Organic Yellow Bell Pepper | 1 count -> 1 count | weight 0.19 kg -> weight 1 kg | 0.72 | A single pepper (1 count). Fresh peppers are commonly priced per kg; set basis to 1 kg instead of 0.19 kg.
yes | no | 107 | Cilantro | Organic Cilantro | 1 bunch -> 1 bunch | unit 1 bunch -> unit 1 bunch | 0.96 | Fresh cilantro is sold and priced per bunch.
yes | yes | 108 | Grapes | Generic Organic Red Seedless Grapes | - -> - | weight 0.81 kg -> weight 0.81 kg | 0.78 | Sold by weight; no fixed package size indicated. Preserve the existing per-kg pricing basis.
yes | no | 109 | Green Onions | Earthbound Farm Organic Green Onion | 1 bunch -> 1 bunch | package -> package | 0.90 | Product indicates a single bunch; price listed per package/bunch.
yes | yes | 110 | Onions - yellow | Cal‑Organic Farms Organic Yellow Onion | 1 count -> 1 count | package -> package | 0.75 | Branded onion likely sold per piece; keep package-based pricing.
yes | no | 111 | Bell Pepper - red | Suji Fresh Organic Red Bell Pepper | 1 count -> 1 count | package -> package | 0.90 | An individual red bell pepper; sold as a single unit/package.
yes | no | 113 | Baking Powder | Bakers Supply House Organic Baking Powder (No Aluminum) | 227 g -> 227 g | package -> package | 0.98 | Listed as a 227 g package of baking powder.
yes | no | 115 | Nutritional Yeast | Bob’s Red Mill Nutritional Yeast (B12) | 5 oz -> 5 oz | package -> package | 0.94 | Product name indicates a 5 oz package.
yes | no | 116 | Apple | Organic Cosmic Crisp Apples | 2 lb -> 2 lb | package -> package | 0.90 | Product indicates a 2 lb bag; priced per package.
yes | no | 117 | Apple | Envy Organic Envy Apples | - -> - | weight 1 kg -> weight 1 kg | 0.86 | Loose apples are sold by weight with no fixed package size.
yes | no | 118 | Banana | Organic Bananas | - -> - | weight 1 kg -> weight 1 kg | 0.90 | Loose bananas are priced by weight; no fixed package size.
yes | no | 121 | Onions - red | Organic Red Onion | - -> - | weight 1 kg -> weight 1 kg | 0.90 | Loose produce sold by weight has no fixed package size; keep price per kg.
yes | no | 122 | Garlic | Christopher Ranch Organic Garlic | 1 head -> 1 head | unit 1 ea -> unit 1 ea | 0.92 | This product is sold as a single head of garlic priced per each.
yes | no | 123 | Green Onions | Marketside Organic Green Onion | 1 bunch -> 1 bunch | unit 1 ea -> unit 1 ea | 0.96 | Organic green onions are sold per bunch; listing shows 1 bunch with unit pricing.
yes | no | 124 | Broccoli | Earthbound Farm Organic Broccoli | 1 head -> 1 head | unit 1 ea -> unit 1 ea | 0.93 | Produce item sold as a single head; per-each pricing is typical.
yes | no | 126 | Beyond Plant Based Breakfast Sausage | Beyond Plant-Based Breakfast Sausage | 8 piece -> 8 piece | package -> package | 0.92 | Beyond breakfast sausage commonly comes 8 pieces per box; already indicated.
yes | yes | 127 | Brussels Sprouts | Organic Brussels Sprouts | - -> - | weight 1 kg -> weight 1 kg | 0.70 | Loose produce sold by weight; no fixed package size; priced per kg.
yes | yes | 128 | Tempeh | Green Cuisine Miso Gravy Tempeh | - -> - | package -> package | 0.45 | Package size not specified in the name; cannot infer amount.
yes | no | 129 | Iceberg Lettuce - romaine | Organic Iceberg Lettuce | - -> 1 count | unit 1 ea -> unit 1 ea | 0.84 | Whole head of lettuce sold per each.
yes | no | 130 | Orange Sweet Potatoes | Organic Orange Sweet Potato | - -> - | unit 1 lb -> unit 1 lb | 0.90 | Loose produce is typically priced per pound; no fixed package size.
yes | yes | 131 | Potatoes | Yellow Potato Bag | - -> - | package -> package | 0.38 | Product name lacks a clear weight; keep package pricing.
yes | yes | 132 | Carrots | Organic Rainbow Carrot Bag | - -> 1 bag | package -> package | 0.62 | Name indicates a bag but no weight is given; assume one bag and keep package pricing.
yes | no | 133 | Celery | Organic Celery Bunch | - -> 1 bunch | package -> package | 0.90 | Product name indicates a single bunch of celery; sold per package/bunch.
yes | no | 134 | Honey | Capilano Labonté MGO 100+ Manuka Honey | 760 g -> 760 g | package -> package | 0.98 | Listed as a 760 g jar of honey.
yes | yes | 135 | Baby Food Purée | Baby Gourmet Mango Avocado & Oats Baby Food | - -> 128 ml | package -> package | 0.78 | Baby Gourmet pouches are typically 128 ml.
