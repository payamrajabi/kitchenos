PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS recipe_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  title_primary TEXT,
  title_qualifier TEXT,
  headnote TEXT,
  description TEXT,
  category_id INTEGER,
  image_url TEXT,
  image_focus_y INTEGER,
  notes TEXT,
  notes_type TEXT CHECK (notes_type IS NULL OR notes_type IN ('note','variation','storage','substitution')),
  notes_title TEXT,
  ingredients TEXT,
  instructions TEXT,
  source_url TEXT,
  servings INTEGER,
  yield_label TEXT CHECK (yield_label IS NULL OR yield_label IN ('serves','makes')),
  yield_quantity TEXT,
  yield_unit TEXT,
  yield_display TEXT,
  prep_time_minutes INTEGER,
  cook_time_minutes INTEGER,
  total_time_minutes INTEGER,
  calories INTEGER,
  protein_grams INTEGER,
  fat_grams INTEGER,
  carbs_grams INTEGER,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (category_id) REFERENCES recipe_categories(id)
);

CREATE TABLE IF NOT EXISTS user_recipe_library (
  user_id TEXT NOT NULL,
  recipe_id INTEGER NOT NULL,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, recipe_id),
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recipe_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS recipe_tag_map (
  recipe_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (recipe_id, tag_id),
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES recipe_tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  full_item_name TEXT,
  full_item_name_alt TEXT,
  current_stock TEXT,
  minimum_stock TEXT,
  maximum_stock TEXT,
  category TEXT,
  grocery_category TEXT,
  price REAL,
  preferred_vendor TEXT,
  brand_or_manufacturer TEXT,
  notes TEXT,
  ingredients_text TEXT,
  parent_ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE CASCADE,
  variant_sort_order INTEGER NOT NULL DEFAULT 0,
  food_type TEXT CHECK (food_type IN ('generic', 'branded', 'custom')) DEFAULT 'generic',
  barcode TEXT,
  kcal REAL,
  fat_g REAL,
  protein_g REAL,
  carbs_g REAL,
  nutrition_basis TEXT CHECK (nutrition_basis IN ('per_100g', 'per_unit')),
  canonical_unit_weight_g REAL,
  nutrition_source_name TEXT,
  nutrition_source_record_id TEXT,
  nutrition_source_url TEXT,
  nutrition_confidence REAL CHECK (nutrition_confidence >= 0 AND nutrition_confidence <= 1),
  nutrition_needs_review INTEGER NOT NULL DEFAULT 0,
  nutrition_notes TEXT,
  nutrition_serving_size_g REAL NOT NULL DEFAULT 100 CHECK (nutrition_serving_size_g > 0),
  nutrition_fetched_at TEXT,
  -- Apparent density in grams per millilitre. Powers the "Grams" view on the
  -- recipe ingredients table, which converts volume amounts (tsp/tbsp/cup/ml/etc.)
  -- to grams using this density. Nullable so ingredients that haven't been
  -- measured yet simply fall back to their original unit in that view.
  density_g_per_ml REAL CHECK (density_g_per_ml IS NULL OR density_g_per_ml > 0),
  -- Stage 1 of the ingredient backbone alignment: new fields for canonical
  -- name + variant, culinary subcategory tier, and operational metadata.
  -- All nullable/defaulted so existing rows keep working unchanged.
  variant TEXT,
  taxonomy_subcategory TEXT,
  -- JSON arrays of strings in SQLite (Postgres side uses real text[] arrays).
  default_units TEXT,
  storage_hints TEXT,
  shelf_life_counter_days INTEGER CHECK (shelf_life_counter_days IS NULL OR shelf_life_counter_days >= 0),
  shelf_life_fridge_days INTEGER CHECK (shelf_life_fridge_days IS NULL OR shelf_life_fridge_days >= 0),
  shelf_life_freezer_days INTEGER CHECK (shelf_life_freezer_days IS NULL OR shelf_life_freezer_days >= 0),
  packaged_common INTEGER NOT NULL DEFAULT 0,
  is_composite INTEGER NOT NULL DEFAULT 0,
  backbone_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ingredients_taxonomy_subcategory
  ON ingredients (taxonomy_subcategory);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ingredients_backbone_id
  ON ingredients (backbone_id);

CREATE TABLE IF NOT EXISTS ingredient_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ingredient_aliases_lower
  ON ingredient_aliases (ingredient_id, lower(alias));

CREATE INDEX IF NOT EXISTS idx_ingredient_aliases_lookup
  ON ingredient_aliases (lower(alias));

CREATE TABLE IF NOT EXISTS ingredient_nutrients (
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  nutrient_id INTEGER NOT NULL,
  nutrient_name TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  PRIMARY KEY (ingredient_id, nutrient_id)
);

CREATE TABLE IF NOT EXISTS ingredient_portions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  gram_weight REAL NOT NULL CHECK (gram_weight > 0),
  description TEXT NOT NULL,
  source TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ingredient_portions_ingredient
  ON ingredient_portions (ingredient_id);

CREATE TABLE IF NOT EXISTS equipment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  category TEXT,
  has_item INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shopping_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredient_id INTEGER,
  name TEXT NOT NULL,
  quantity TEXT,
  unit TEXT,
  store TEXT,
  aisle TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  birth_date TEXT,
  weight REAL,
  height TEXT,
  daily_calorie_expenditure REAL,
  calorie_min REAL,
  calorie_max REAL,
  calorie_target REAL,
  protein_min_grams REAL,
  protein_max_grams REAL,
  protein_target_grams REAL,
  fat_min_grams REAL,
  fat_max_grams REAL,
  fat_target_grams REAL,
  carb_min_grams REAL,
  carb_max_grams REAL,
  carb_target_grams REAL,
  dietary_restrictions TEXT,
  allergies TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  recipe_id INTEGER NOT NULL,
  ingredient_id INTEGER NOT NULL,
  amount TEXT,
  unit TEXT,
  preparation TEXT,
  display TEXT,
  PRIMARY KEY (recipe_id, ingredient_id),
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recipe_instruction_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL DEFAULT 1,
  text TEXT NOT NULL,
  timer_seconds_low INTEGER,
  timer_seconds_high INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS recipe_instruction_steps_recipe_step
  ON recipe_instruction_steps (recipe_id, step_number);

CREATE TABLE IF NOT EXISTS inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  storage_location TEXT NOT NULL CHECK (
    storage_location IN (
      'Fridge',
      'Freezer',
      'Shallow Pantry',
      'Deep Pantry',
      'Other'
    )
  ),
  quantity REAL,
  min_quantity REAL,
  max_quantity REAL,
  unit TEXT,
  recipe_unit TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, ingredient_id, storage_location)
);

CREATE TABLE IF NOT EXISTS user_equipment (
  user_id TEXT NOT NULL,
  equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  has_item INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, equipment_id)
);

CREATE TABLE IF NOT EXISTS meal_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT,
  week_start TEXT NOT NULL,
  title TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, week_start)
);

CREATE TABLE IF NOT EXISTS meal_plan_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  plan_date TEXT NOT NULL,
  meal_slot TEXT NOT NULL CHECK (
    meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack', 'other')
  ),
  recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
  label TEXT,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  servings INTEGER NOT NULL DEFAULT 4 CHECK (servings >= 1),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
