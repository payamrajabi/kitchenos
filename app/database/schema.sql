PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS recipe_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category_id INTEGER,
  image_url TEXT,
  image_focus_y INTEGER,
  notes TEXT,
  ingredients TEXT,
  instructions TEXT,
  source_url TEXT,
  servings INTEGER,
  prep_time_minutes INTEGER,
  cook_time_minutes INTEGER,
  total_time_minutes INTEGER,
  calories INTEGER,
  protein_grams INTEGER,
  fat_grams INTEGER,
  carbs_grams INTEGER,
  is_published_to_community INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  community_source_recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (category_id) REFERENCES recipe_categories(id)
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
  price REAL,
  preferred_vendor TEXT,
  brand_or_manufacturer TEXT,
  notes TEXT,
  ingredients_text TEXT,
  parent_ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE CASCADE,
  variant_sort_order INTEGER NOT NULL DEFAULT 0,
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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
  PRIMARY KEY (recipe_id, ingredient_id),
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE
);

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
