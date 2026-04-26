# kitchenOS — Product Requirements Document

> **Status:** Living document. This is the source of truth for *what* kitchenOS does and *why*. If the code disagrees with this document, one of them is wrong — figure out which and fix it.

---

## 0. How to use this document

### What it is
This PRD is a complete, plain-English description of kitchenOS as the product exists today. If we deleted every line of code tomorrow, a competent engineering team should be able to rebuild the same product using only this document as a brief.

### Who reads it
- **Designers and PMs**, to reason about new features without opening a code editor.
- **Engineers**, to verify a proposed change doesn’t conflict with an existing promise.
- **Anyone joining the team**, to get oriented.

### How to maintain it
- Whenever a new major feature ships, update the relevant section. If it’s a brand-new area, add a section.
- Whenever a feature is **changed**, update the section in the *same PR* as the code change. Treat this file like prod code: if behavior in the app differs from what the PRD says, the PR is incomplete.
- Whenever you ship something **partial**, add it to **§21 WIP, partial features, and known drift** with a short note about what is and isn’t finished.
- Don’t use this as a tutorial or onboarding guide. It’s a spec. Tutorials live elsewhere.
- The Cursor rule at [`.cursor/rules/prd-sync.mdc`](.cursor/rules/prd-sync.mdc) enforces this in AI-assisted edits — it tells the agent to propose a PRD diff in the same response as any product-impacting code change.

### How it’s organized
- **§1–3** is high-level orientation: what kitchenOS is, who it’s for, and the vocabulary.
- **§4–18** describes each major area of the app, end-to-end.
- **§19–20** covers infrastructure and the database.
- **§21** lists known partials, drift, and gaps — the “honest list.”
- **§22** is a glossary you can skim.

---

## 1. The product, in one paragraph

kitchenOS is a **personal kitchen operating system**. A household uses it to:

1. Keep a living list of every ingredient in their kitchen (the **pantry**).
2. Keep a living recipe book that they own, can edit, and can share.
3. Plan a week of meals across breakfast, snacks, lunch, dinner, and dessert — with optional AI suggestions.
4. Generate a smart shopping list from that plan and either tick items off as bought or send the list to Instacart.
5. Track the macros and calorie targets for each member of the household.
6. Optionally cook hands-free with a voice assistant that walks them through ingredients and steps.

It is opinionated about the data model: ingredients live in **one shared catalog** so when you write “Yellow Onion” in a recipe and tomorrow you write “Onion” in your pantry, the system knows they are the same thing and uses the same nutrition, density, shelf-life, and grocery aisle data for both.

The app runs on **Next.js 16 + React 19** at `app/recipes-next/`, backed by **Supabase Postgres + Auth + Storage**, with an OpenAI-powered intelligence layer for parsing, suggestion, and conversation. There is also a **legacy static UI** at `app/recipes-ui/` and a small **iOS read-only app** at `ios/` that share the same Supabase backend.

---

## 2. Who it’s for

The current target user is a **single household cook who already cares about food**. The product assumes:

- They cook regularly enough that a stale pantry list is annoying, not abstract.
- They have specific nutrition goals for themselves and family members (calories, macros, allergies, restrictions).
- They occasionally import recipes from URLs, friends, or photos — not just type them out.
- They are comfortable using a phone or tablet in the kitchen.
- They are technical enough to set up an account and accept some early-product rough edges (e.g. they might see a “Sign in to view inventory data” screen, or a config banner if env vars are missing).

There is no concept of **multi-household sharing**, no shared shopping lists between accounts, and no role-based admin panel for non-owners. Every household is one Supabase user. Family members exist as data records (see **§13 People**) but they don’t have their own login.

---

## 3. Vocabulary & core concepts

These are the nouns and verbs you should use consistently across product, design, and engineering. If you find yourself using a synonym (e.g. “fridge stock” for “inventory”), align on the canonical term first.

| Term | Meaning |
|---|---|
| **Ingredient** | A canonical food item in the shared catalog. One row per real-world thing (“Yellow Onion”, “All-Purpose Flour”). Has nutrition, density, taxonomy, default units, etc. |
| **Variant** | A child ingredient that hangs off a parent ingredient (e.g. “Yellow Onion” as a variant of “Onion”). Used so recipes and pantry can be more specific without bloating the catalog. |
| **Inventory item** | A physical instance of an ingredient in *your* kitchen. One row per (ingredient, storage location) for a given user. Has a quantity and a stock unit. |
| **Storage location** | Where an inventory item physically lives: Fridge, Freezer, Shallow Pantry, Deep Pantry, Other, or any custom string. |
| **Recipe** | An owned recipe, with structured fields for title, headnote, description, yield, servings, image, ingredients (in optional sections), and instruction steps with timers. |
| **Recipe ingredient** | One line on a recipe, linked by `ingredient_id` to the shared catalog, with amount/unit/preparation. |
| **Library** | The set of recipes a user has saved from the community (other people’s recipes). Distinct from *owning* a recipe. |
| **Meal plan** | A rolling week-based calendar of meals. One plan per user per Monday-anchored week. |
| **Meal plan entry** | A single card on the plan: a slot on a date, optionally tied to a recipe, with planned servings. |
| **Suggestion** | An AI-generated, not-yet-accepted meal plan entry. Has a pool of alternatives the user can cycle through. |
| **Shopping list** | A *computed* list of what to buy for the next 7 days of plan, after subtracting what’s in inventory. Not a stored table you append to. |
| **Receipt import** | A feature where the user pastes the text of a grocery receipt and kitchenOS bumps inventory + product preferences from it. |
| **Person** | A household member with calorie + macro targets. Used by AI suggestions for dietary context. |
| **Owner** | The Supabase user who owns a recipe / inventory row / plan / etc. |
| **Backbone** | A small curated taxonomy of canonical ingredients with default metadata (units, storage hints, density, …). New ingredients inherit defaults from it. |

---

## 4. Surfaces & navigation

### 4.1 Top-level shell
The whole authenticated app lives under `(main)` in the App Router. The shell renders, in order:
- A **theme init script** in `<head>` (so theme is applied before paint).
- **Phosphor icon webfont** (we use both the webfont and the React package).
- A **ConfigBanner** if Supabase env vars are missing or placeholder.
- The **AppToaster** (Sonner, bottom-right, max 4 toasts, 10s default).
- The **StepTimerWatcher** (listens for cooking timer events globally).
- A **TimeZoneSync** (writes the user’s tz to a `user_tz` cookie).
- The **AppHeader** (primary nav).
- A **MainDraftImportsShell** that wraps both the main content and the modal parallel-route slot, so AI recipe drafts persist across navigation.

### 4.2 Primary tabs
The header shows four primary tabs:
- **Plan** → `/plan` (default; `/` redirects here)
- **Recipes** → `/recipes`
- **Inventory** → `/inventory`
- **Shop** → `/shop`

Tapping the active **Plan** tab again fires a `kitchenos:plan-scroll-to-today` event so the plan board scrolls to today.

### 4.3 Account menu
The avatar in the top right opens a dropdown with:
- Theme picker: **System / Light / Dark**
- **Family members** → `/people`
- **Receipt log** → `/receipt-log`
- **Sign out**

If signed out, the header shows **Sign in** / **Sign up** buttons that open `AuthModal`.

### 4.4 Other reachable routes
- **Community list**: `/community`
- **Community recipe**: `/community/[id]` (and intercepted modal `/@modal/(.)community/[id]`)
- **Recipe**: `/recipes/[id]` (and intercepted modal `/@modal/(.)recipes/[id]`)
- **Recipe draft review**: `/recipe-draft` (intentionally **not** under `/recipes/*` so the modal interceptor doesn’t treat “draft” as an `[id]`).
- **Person**: `/people/[id]`
- **Admin**: `/admin/ingredient-autofill`, `/admin/unit-cleanup`, `/admin/color-audit`

### 4.5 Modal vs page convention
Recipe and community recipe details use Next.js **intercepting parallel routes** to render the same content as either:
- A **modal** stacked over whatever tab the user was on (soft navigation), or
- A **full standalone page** (hard load, refresh, deep-link).

The modal uses a native `<dialog>` opened with `showModal()`, which renders in the browser’s **top layer** above everything else. The shared store at `lib/top-layer-host.ts` tracks the open dialog so any popovers / dropdowns / toasts portal *into* it instead of behind it. This is enforced by the workspace rule **`popovers-above-modals.mdc`**: anything that portals must use `useTopLayerPortalContainer()`.

### 4.6 Theming
- Theme preference is stored in `localStorage` under key `kitchenos-theme`.
- Values: `"system" | "light" | "dark"`.
- The `THEME_INIT_SCRIPT` runs before paint, sets `data-theme` and `colorScheme` on `<html>`, and listens to OS theme when preference is `system`.
- Design tokens live in `app/recipes-next/src/app/globals.css`.

---

## 5. Identity, accounts, and access model

### 5.1 Auth provider
Supabase Auth via `@supabase/ssr`. Three clients:
- **Server**: `lib/supabase/server.ts` — wraps Next `cookies()`.
- **Browser**: `lib/supabase/client.ts`.
- **Admin (service role)**: `lib/supabase/admin.ts` — server-only, used for storage uploads and image generation that bypass user RLS.

Session refresh on every request happens in `src/proxy.ts` (this project uses Next 16’s proxy entrypoint instead of a root `middleware.ts`).

### 5.2 Sign-in methods
- **Email + password only** through `AuthModal` (sign-in and sign-up tabs).
- The `/auth/callback` route handles Supabase code exchanges (e.g. email confirmation links). On success it redirects to `?next=` or `/plan`. On failure it sends the user to `/plan?auth=error`.
- **No** magic-link, Google, or other OAuth in the kitchenOS web UI today (the iOS app does have email + Google).

### 5.3 Accounts model
- One Supabase user = one **household**.
- There is no notion of a shared household: two phones using two accounts maintain two separate kitchens.
- “Family members” are **data records**, not logins (see **§13 People**).

### 5.4 Ownership pattern
Most user data tables have an `owner_id` that points to `auth.users`. A trigger called `kitchenos_set_owner_id` runs `BEFORE INSERT` and stamps `owner_id := auth.uid()` if the row doesn’t already have one. Tables under this pattern today: `recipes`, `shopping_items`, `people`, `inventory_items`, `meal_plans`, `meal_plan_slot_dismissals`, `ingredient_products`, `receipt_imports`, `receipt_import_items`.

`user_equipment` uses a slightly different trigger (`kitchenos_user_equipment_set_uid`) that *forces* `user_id := auth.uid()`.

`ingredients` is **shared** — see **§6**.

### 5.5 Row-level security (RLS) — the rules in plain English
- **Recipes, recipe sections, recipe ingredients, instruction steps**: anyone signed in or out can *read* any non-deleted recipe (this is what makes the community work without a publish flag). Writes are restricted to the owner.
- **Inventory, shopping items, people, meal plans, meal plan entries, dismissals, receipt imports, ingredient products, equipment toggles**: only the owner can read or write.
- **Ingredients catalog**: shared. Anyone signed in can read or write any ingredient row. (This is intentional — see **§6.1**.)
- **Recipe images bucket** (`recipe-images`): public read, authenticated insert/update/delete.

### 5.6 Anonymous experience
A signed-out visitor can:
- Browse `/community` and read individual community recipes.
- Read recipe ingredients and steps.
- **Not** access `/plan`, `/inventory`, `/shop`, `/people`, `/recipe-draft`, `/receipt-log`, or `/admin/*`. (Most of those redirect or show a “Sign in to view…” empty state.)

### 5.7 Legacy data claim
There’s a one-time SQL script (`supabase_claim_legacy_data_for_user.sql`) that lets us assign all `owner_id IS NULL` rows to a specific user (resolved by hardcoded email). It’s for migrating pre-v2 data and is **not** part of the runtime app.

---

## 6. Ingredients (the central catalog)

### 6.1 The big idea
The `ingredients` table is the **single shared catalog** of food items. It is not per-user. When you create “Yellow Onion” in your pantry, every other user gets to use the same row, with the same density, nutrition, grocery aisle, etc. This is by design: it makes the data model coherent (recipe + pantry + shopping list all reference the same `ingredient_id`) and lets us amortize expensive metadata (USDA lookups, density measurements, taxonomy) across the user base.

The migration that made ingredients shared is `supabase_migration_shared_ingredient_catalogue.sql` — it dropped `owner_id` from `ingredients` and replaced per-owner uniqueness with a global case-insensitive unique index on `lower(name)`.

User-specific data about ingredients lives in *other tables*:
- `inventory_items` (what *I* have on hand)
- `ingredient_products` (which brands *I* prefer — note: this table is owner-scoped)
- recipes I write
- shopping lists computed for me

### 6.2 What an ingredient looks like
Each ingredient row carries (this is the canonical list — every field has a job):

**Identity**
- `name` — the human label, AP-style title case (see **§6.5**), unique on `lower(name)`.
- `full_item_name`, `full_item_name_alt` — historical alternate names.
- `barcode` — UPC/EAN/GTIN for branded items.
- `food_type` — `generic | branded | custom`.

**Variants**
- `parent_ingredient_id`, `variant_sort_order`, `variant` — for child variants under a parent (e.g. specific cuts under a generic).

**Categorization** (four parallel taxonomies, all serving different purposes):
- `category` — legacy storage hint (fridge / freezer / pantry-ish strings). Used as a fallback when there’s no inventory row.
- `grocery_category` — store aisle (`Produce`, `Pantry`, `Dairy`, …). Drives sorting on the shopping list.
- `taxonomy_subcategory` — culinary subcategory (`Alliums`, `Whole Grains`, `Oils & Fats`, …). Drives section headers in the inventory category view.
- `backbone_id` — stable slug that points to a row in `ingredient_backbone_catalogue` (the master taxonomy).

**Defaults / hints**
- `default_units` — sensible units for this ingredient as an array (e.g. `["g","oz","lb","each"]`).
- `storage_hints` — subset of `counter | pantry | fridge | freezer`.
- `shelf_life_counter_days`, `shelf_life_fridge_days`, `shelf_life_freezer_days` — informational.
- `packaged_common` — true when commonly sold in barcoded packaged form.
- `is_composite` — true for prepared multi-ingredient inputs (broth, mayo, salsa, tofu, etc.).

**Math support**
- `density_g_per_ml` — density for converting volume amounts (tsp/tbsp/cup/ml/…) into grams.
- `canonical_unit_weight_g` — grams per “each” for count-based units.

**Nutrition** (per 100 g unless `nutrition_basis = per_unit`)
- `kcal`, `protein_g`, `fat_g`, `carbs_g`, `nutrition_basis`, `nutrition_serving_size_g`.
- `nutrition_source_name`, `nutrition_source_record_id`, `nutrition_source_url`.
- `nutrition_confidence` (0–1), `nutrition_needs_review`, `nutrition_notes`, `nutrition_fetched_at`.

**Legacy / branded**
- `current_stock`, `minimum_stock`, `maximum_stock` — legacy text fields kept for back-compat. New code reads from `inventory_items.quantity` and only falls back to these if no inventory row exists.
- `preferred_vendor`, `brand_or_manufacturer`, `notes`, `ingredients_text`, `price`.

### 6.3 Adjacent tables

- **`ingredient_aliases`** — synonyms (`"coriander leaves" → Cilantro`). Each alias has a `source` (`user`, `import`, `backbone`, `openfoodfacts`, `legacy`). Used by receipt matching and merge.
- **`ingredient_nutrients`** — USDA-style micronutrient breakdown (fiber, iron, vitamins…), keyed by `(ingredient_id, nutrient_id)`.
- **`ingredient_portions`** — named portions with gram weights (`"1 large"` → 150 g).
- **`ingredient_products`** — owner-scoped ranked list of preferred branded products per ingredient. Each row has price, price basis (`package | weight | unit`), pack size, brand, barcode, and notes. Lower `rank` = higher preference. Drives Instacart line items.
- **`ingredient_backbone_catalogue`** — the curated master taxonomy. Each row has a `backbone_id`, canonical name, a normalized `match_key`, default units, storage hints, shelf life, density, and aliases.

### 6.4 The “backbone” concept
The backbone catalogue is a curated set of canonical kitchen ingredients with sensible defaults. It exists because:
- New ingredients should inherit reasonable defaults instead of starting empty.
- LLM-driven ingredient creation can hallucinate; deterministic taxonomy mapping is cheaper and more correct for common items.

When a new ingredient is created (manually, from a recipe import, or from a receipt), the system:
1. Normalizes the proposed name (lowercase, strip prefixes like “organic”, ASCII-fold, singularize, sort tokens).
2. Looks up that key in the backbone catalogue, first by exact `match_key`, then by alias array containment.
3. If found, copies the catalogue’s defaults onto the new ingredient (units, taxonomy, density, storage hints, shelf life, etc.), and sets `backbone_id`.
4. If not found, falls back to regex-based inference (`buildBackboneInsertFieldsFromName`) to guess subcategory, units, storage hints, shelf life, and flags from the name alone.
5. Always runs `inferGroceryCategoryFromName` so every new ingredient lands in a grocery section.

### 6.5 Naming rule: AP-style title case
Every new or renamed ingredient name passes through `toTitleCaseAP()` before being persisted. The rules:
- The first word is always capitalized.
- Short words (`a, an, the, and, but, or, nor, for, yet, so, of, in, to, on, at, by, with, from, as, per, vs`) are lowercased when not the first word.
- Other words are capitalized.

This is enforced in code (creation flows, manual rename, recipe import apply, receipt apply) and as a workspace rule (`.cursor/rules/ingredient-title-case.mdc`).

### 6.6 Ingredient resolution (free text → ingredient row)
When a recipe is imported or a receipt is parsed, the system has free text like `"½ cup chopped yellow onion"` and needs to map it to a real `ingredient_id`. The pipeline:

1. **Deterministic match**: normalize the recipe’s ingredient name and look it up in an index built from the existing catalog (name + aliases). Tokens of length ≥5 can match alone; otherwise the system tries the largest token window first.
2. **Catalogue bridge**: for unmatched names, look up the backbone catalogue and try to find an existing ingredient that already corresponds to that catalogue identity (by `backbone_id`, normalized name, or normalized alias).
3. **LLM resolution**: if still unmatched, an OpenAI call decides one of: `use_existing`, `create_variant_under_existing`, `create_sibling_variant`, `create_standalone`. Confidence < 0.7 means the user is asked to confirm.
4. **Apply plan**: for create paths, run `createIngredientRow` (which applies title case, backbone defaults, grocery inference) and ensure an inventory row exists in a sensible default storage location.

If `OPENAI_API_KEY` is missing, step 3 is skipped and unresolved names fall through to `create_standalone` with a cleaned display name.

### 6.7 Density and gram conversion
- **Mass units** (`g, kg, oz, lb`) convert directly with `GRAMS_PER_MASS_UNIT`.
- **Volume units** (`tsp, tbsp, cup, fl oz, ml, l`) convert through `density_g_per_ml` using US kitchen ml-per-unit constants. If density is null, the conversion isn’t possible and the UI falls back to the original unit.
- **Count units** (`each`, etc.) multiply the count by `canonical_unit_weight_g`.
- **“Vague” count units** (`pinch`, `dash`, `to taste`) cannot be converted to grams.

### 6.8 Nutrition pipeline
When an ingredient needs nutrition (creation, manual rename, or explicit refresh):
1. **LLM assist** refines the search query (handles synonyms and ambiguity).
2. **Branded** ingredients query USDA Branded; **generic** ingredients query Canadian CNF first, then USDA Foundation, picking the best canonical match.
3. The matched record’s **detail pull** populates per-100g macros, micronutrients (`ingredient_nutrients`), and named portions (`ingredient_portions`).
4. If the stock unit is count-based, the system picks an edible gram weight from the portion list and writes it to `canonical_unit_weight_g`.
5. If no official match is found, the system can fall back to an **LLM estimate** with `nutrition_source_name = "LLM estimate"`, low confidence, `needs_review = true`.

The pipeline preserves user-set values: `canonical_unit_weight_g` already set by the catalogue or user is **not** overwritten by an estimate.

### 6.9 Variants and merging
- **Variants** hang off a parent via `parent_ingredient_id`. They inherit category and backbone metadata from the parent on creation.
- **Move as variant of**: makes ingredient X a child of Y.
- **Move out of parent**: promotes X back to root.
- **Merge**: rewrites all foreign keys (recipe ingredients, inventory rows, aliases, etc.) from X onto Y. The merge UI picks which ingredient’s metadata to keep, field by field. Handles inventory duplicates by location.

### 6.10 One-off cleanup migrations
There are several SQL migrations with hardcoded IDs that performed *one-time* cleanups on the production data:
- `supabase_migration_collapse_citrus_wedges.sql` — folded "Lime Wedges" / "Lemon Wedges" into the parent ingredients with `preparation = "wedges"`.
- `supabase_migration_strip_organic_from_ingredients.sql` — removed the word “organic” from many text fields and inventory notes.
- `supabase_migration_soft_duplicate_cleanup.sql` — merged Hemp Hearts into Hemp Seeds, re-parented many form variants under canonical parents.

These are **not** part of the rebuild path. They’re historical fixes documented for the audit trail.

---

## 7. Inventory (pantry on hand)

### 7.1 What inventory is
Inventory is **what the user physically has** in their kitchen right now. Each row is `(owner, ingredient, storage_location)` with a quantity and a stock unit. This is distinct from the ingredient catalog (which describes the food item itself) and from preferred products (which describes which brands the user likes to buy).

The unique constraint `UNIQUE (owner_id, ingredient_id, storage_location)` means **the same ingredient can have multiple rows** if it lives in multiple physical places (e.g. butter in the fridge *and* the freezer).

### 7.2 Storage locations
The default set is: **Fridge**, **Freezer**, **Shallow Pantry**, **Deep Pantry**, **Other**. After `supabase_migration_inventory_simplify.sql`, the database CHECK constraint was removed, so users can also persist **custom** location strings up to 64 characters (e.g. `"Cold Room"`, `"Garage Fridge"`).

The filter bar shows the five built-ins. The detail sheet allows custom values. The **table view’s** inline storage dropdown currently only shows four (Fridge, Freezer, Shallow Pantry, Deep Pantry) — see **§21.2** for this drift.

### 7.3 Pages and views
Inventory is one route: `/inventory`. It loads the entire ingredients catalog and the user’s inventory rows in parallel, ensures every ingredient has a `grocery_category` (calling `ensureIngredientGroceryCategoriesInDb` to backfill if needed), and renders one of two views:

- **Category view (`list`)**: ingredients grouped by `taxonomy_subcategory` headers, with variants nested under their parent.
- **Table view (`table`)**: a flat sortable table of root ingredients with inline-editable cells for subcategory, grocery category, storage location, stock unit, and recipe unit.

A toggle in the header switches between them. The view mode is **client state only** — it’s not persisted in the URL or in user prefs. Same for the storage filter.

### 7.4 The inventory FAB
A floating action button in the bottom-right opens an inline panel where the user types a single ingredient name, hits Enter, and the system:
1. Checks if that name already exists (case-insensitive).
2. If yes, ensures an inventory row exists in a default storage location.
3. If no, creates a new ingredient (title-cased), applying backbone defaults / regex inference, then ensures an inventory row.

There is **also** a Receipt FAB on the inventory page — see **§12**.

### 7.5 The detail sheet
Tapping an ingredient name opens a side sheet (an `<aside>` with a backdrop, *not* a `showModal` dialog). It loads the ingredient’s nutrients, portions, and preferred products from Supabase and lets the user edit:
- **Inventory quantity**, stock unit, recipe unit, storage location.
- **Subcategory** (taxonomy).
- **Notes**.
- **Preferred products** — full CRUD on `ingredient_products`, with price + price basis + pack size.
- **Macros per 100 g** — read-only, with a “Recalculate” button that forces a nutrition refresh.
- **Micronutrients** and **portions**.
- **Delete** (confirms first if the ingredient is used in any recipe).

Fields **not** exposed in the sheet today: `default_units`, `storage_hints`, density, shelf life, `packaged_common`, `is_composite`, `backbone_id`. Those are touched via merge, admin tools, or backend inference.

### 7.6 Quantity editing
Several editing modes all converge on the same server action `updateInventoryQuantityFieldAction`:
- **Plus / minus buttons** in the qty control: debounced 500 ms, optimistic update, flush on mouse leave or blur.
- **Inline qty field**: blur-commits the integer value.
- **Keyboard while a row is selected** in the category view:
  - `+ / =` increments, `- / _` decrements.
  - Digits 0–9 fill a 4-digit buffer that commits after 600 ms of inactivity.
  - **Backspace** edits the buffer, **Enter** flushes, **Escape** clears selection.
  - Arrow keys move spatially between rows.

The category view also visually highlights rows that were *just applied* from a receipt for ~a few seconds, using `useRecentAppliedSet`.

### 7.7 Units
- **Stock unit** = how the user measures the on-hand amount (e.g. each, package, g).
- **Recipe unit** = how the ingredient appears in recipe lines (e.g. cup, oz). When empty, the system suggests one via `defaultRecipeUnitForStockUnit`.
- **Default units** (on the ingredient catalog) is a *third* concept that drives backbone backfill and admin tooling but isn’t wired into the live recipe unit dropdown today (the dropdown shows the global canonical unit list).

### 7.8 Inventory and the rest of the app
- **Recipe ingredients** check whether each ingredient is in stock (via `inventory_items` for the user). Out-of-stock rows get a “Mark stocked” action.
- **Shopping list** subtracts inventory from the planned recipes (see **§10**).
- **Receipts** apply quantity deltas to inventory and optionally upsert preferred products with price.

### 7.9 No min/max thresholds today
`inventory_simplify` removed `min_quantity` / `max_quantity` from `inventory_items`. The legacy `minimum_stock` / `maximum_stock` columns still exist on `ingredients` but are **not** used to drive low-stock alerts in the current UI. There is no “low stock” view or notification.

### 7.10 Bulk operations and admin tools (cross-link)
Inventory shares several admin / bulk flows with the ingredient catalog:
- **Organize menu** (per-ingredient): Move as variant, Move out of parent, Merge.
- **Backbone catalogue panel** (`/admin/ingredient-autofill`): seed the backbone, apply catalogue defaults to existing ingredients, suggest taxonomy for unmatched ingredients via LLM.
- **Backbone backfill panel**: regex-based fill of empty backbone fields (no overwrites of user data).
- **Unit cleanup review** (`/admin/unit-cleanup`): a temporary tool that shows an LLM-generated review of unit normalizations and lets the user save / generate SQL.

---

## 8. Recipes

### 8.1 Anatomy of a recipe
A recipe has three layers:

1. **The recipe row itself** (`recipes`):
   - **Title**: stored both as a flat `name` and a structured `(title_primary, title_qualifier)` pair (e.g. `title_primary = "Roasted Chicken"`, `title_qualifier = "with Lemon and Herbs"`). They are kept in sync.
   - **Headnote**: a 60–180 word editorial intro that appears before the metadata.
   - **Description**: a short summary capped at 250 characters; supports markdown links and bare URLs.
   - **Notes block**: typed (`note | variation | storage | substitution`), with an optional title.
   - **Yield**: a verb (`yield_label = serves | makes`), a quantity (string, supports ranges like `"6 to 8"`), and an optional unit. A pre-built `yield_display` like `"Serves 6 to 8"` is preferred when present.
   - **Servings**: an integer, the canonical base for scaling math.
   - **Times**: prep / cook / total in minutes.
   - **Macros**: calories, protein, fat, carbs (per the whole recipe).
   - **Image**: `image_url` (primary) plus `image_urls` (history of other URLs), and `image_focus_y` (0–100, the vertical focal point for square cover crops).
   - **Meal types**: an array of zero or more of `Breakfast, Snack, Lunch, Dinner, Dessert, Drink, Component`.
   - **`deleted_at`**: soft-delete tombstone (used by community/library to show a “removed by author” state to people who saved it).
   - **`owner_id`**: the user who owns this recipe.
   - **`source_url`**: the URL it was imported from, if any.

2. **Ingredients with optional sections**:
   - `recipe_ingredient_sections` provides headings like `"For the Dressing"` with `sort_order`.
   - `recipe_ingredients` lines link by `ingredient_id` to the shared catalog and carry `amount`, `unit`, `preparation` (e.g. `"finely chopped"`), `display` (a verbatim source line for typographic fidelity), `is_optional`, and a `line_sort_order` within their section.
   - The first time the user adds a section, the system creates a default "Ingredients" section and migrates any orphan lines into it.

3. **Instruction steps** (`recipe_instruction_steps`):
   - One row per step, with `step_number` (1-based), an optional short `heading` (≤60 chars), the `text` body, and an optional timer range (`timer_seconds_low`, `timer_seconds_high`).
   - The flat `recipes.instructions` text column is kept in sync (a numbered export of the steps) for back-compat and the legacy UI.

### 8.2 Routes and rendering
- **`/recipes`** (list): all visible non-deleted recipes (RLS allows read of any non-deleted recipe). The page splits these into **own + library** (`ownRecipes`) vs **all** (`allRecipes`) and the client toggle flips between them.
- **`/recipes/[id]`** (full page): owner-only — must be the owner and not deleted, otherwise redirects to `/community/[id]`.
- **`/@modal/(.)recipes/[id]`** (modal): same payload, rendered inside `RecipeDetailDialog`. On error it falls back to the full page.
- **`/community`** (list): all non-deleted recipes that are **not yours**, with a heart toggle that adds/removes from your library.
- **`/community/[id]` / `/@modal/(.)community/[id]`**: read-only recipe view with `CommunitySaveActions` (heart / duplicate). If you’re the owner, redirects to `/recipes/[id]`. If the recipe is deleted but in your library, you see a `RecipeTombstone`.
- **`/recipe-draft`**: the AI import draft review screen.

### 8.3 Listing and filtering
The recipes index has:
- A **Community / All** toggle (client-side; flips between `ownRecipes` and `allRecipes`).
- A single-select **meal type filter** that animates: when active, the strip collapses into the active pill plus an X to clear.
- A **grid / table** view toggle.
- A **RecipeAddFab** that opens the import flow (URL / paste / images / manual).
- The legacy “draft” cards: any in-flight or recently-finished AI imports show as draft chips at the top.

### 8.4 Recipe detail (the editor surface)
The recipe detail surface is a single component (`RecipeDetailEditor`) used in three modes:
- **View**: default. Servings stepper, scaled amounts, voice mode FAB.
- **Edit**: flips `RecipeEditModeProvider`. Inputs replace text, the servings stepper hides, scaled amounts show original (scale = 1). Voice mode is hidden in edit and during remix.
- **Community view-only**: same component with `viewOnly`, used on `/community/[id]`.

The editor includes:
- A **cover image** with upload, a vertical drag handle to set `image_focus_y`, and a **Generate image** button.
- **Title editor** (`title_primary` + optional `title_qualifier`).
- **Headnote** rich text editor.
- **Description** rich text editor (capped at 250 chars).
- **Yield**, **servings**, **times**, **macros** fields.
- **Meal types** multi-select.
- **Ingredients editor** with sections, drag-and-drop reorder (within and across sections), optional toggle, preparation note, and an `IngredientSearchControl` for picking or creating ingredients.
- **Instructions editor** with a per-step kebab menu (split at cursor, delete, move), drag reorder, heading + text, and a timer field.
- A **Notes block** (typed: note / variation / storage / substitution).
- An **overlay chrome** with a kebab that exposes Edit / Delete / **Remix** / Source URL.

### 8.5 Servings scaling
- The **stored** `servings` value never changes when the user steps the count.
- A `viewServings` (1–99) sits on the client; the **scale** = `viewServings / baseServings` when both are valid, else 1.
- A `RecipeServingsScaleProvider` exposes the scale to ingredient rows.
- `displayAmountForUnit` multiplies numeric amounts by the scale and formats them (fractions for cup/tsp/tbsp, ranges preserved).
- Non-numeric amounts (e.g. `"a pinch"`) pass through unchanged.
- In **edit** mode, the scale is forced to 1 to avoid confusion when typing.

### 8.6 Grams view
The ingredients list has a toggle: **Original** (the recipe’s units) vs **Grams** (every line converted to grams using the ingredient’s `density_g_per_ml` and `canonical_unit_weight_g`). Lines that can’t be converted (no density, vague units) fall back to their original unit. This is purely a display toggle — nothing is written to the database.

### 8.7 Creating a recipe
There are five entry points into recipe creation/import:

1. **Manual**: `RecipeAddFab` → manual button → creates `{ name: "New recipe" }` and redirects to its detail page.
2. **From URL**: paste a URL. The system fetches it, runs the recipe parser, and starts a **draft import** (in browser session storage) that the user reviews on `/recipe-draft`.
3. **From pasted text**: paste raw text, same draft pipeline.
4. **From images**: upload one or more photos of a recipe (printed cookbook page, etc.). Same draft pipeline.
5. **Refine / remix**: from the kebab on a recipe, “Remix” passes the existing recipe’s context to the parser and produces an *update* to the same recipe (or a new one).

The draft pipeline:
- Builds a `DraftRecipeData` (no DB writes) with the parsed structure and a resolution plan for each ingredient.
- The user reviews on `/recipe-draft`, where they can remap ingredients (search existing or create new) and confirm.
- On confirm: writes the recipe + sections + ingredient lines + instruction steps. For URL imports, attempts to attach a scraped source image; otherwise queues an AI image generation. New recipes redirect to `/recipes/{id}?gen=1` so the editor can show a placeholder while the image is generated.

### 8.8 Recipe images
Two paths to a cover image:
- **User upload**: the editor uploads to the `recipe-images` bucket (public read, authenticated write) and writes the URL to `image_url` (and pushes to `image_urls`).
- **AI generation**: a server flow that:
  1. Builds a “Creative Director” prompt from the recipe’s context (default model is `RECIPE_IMAGE_DIRECTOR_MODEL`, currently `gpt-5`).
  2. Calls `gpt-image-1` to generate the image.
  3. Runs a **vision QC** check on the result.
  4. Uploads to the bucket and patches the recipe.
- After generation, `image_focus_y` defaults to 50 (centered). The user can drag a vertical slider to change it.

### 8.9 Library, ownership, and tombstones
- Owning a recipe means you have an `owner_id` on it. You can edit or soft-delete.
- Saving a community recipe writes a `(user_id, recipe_id)` row in `user_recipe_library`. You don’t get your own copy — you get a pointer to the live recipe.
- **Duplicating** a community recipe creates a real copy you own. Ingredients are re-resolved against your catalog (since the ingredient catalog is shared, this is mostly a no-op, but it ensures coherence).
- If the original author deletes the recipe, anyone who saved it sees a `RecipeTombstone` on `/community/[id]` with a “Remove from library” button. Anyone who duplicated has their own copy and is unaffected.

### 8.10 Remix
Remix is a special import flow that uses the *existing* recipe as context for the parser. It’s how you say “take this recipe but make it spicier / vegan / scaled to 12 servings”. It can create a new recipe or update the existing one, depending on flow.

### 8.11 Send to Instacart
The recipe detail does **not** have a per-recipe Instacart button. The Instacart flow is on the **shopping list** (see **§11**).

### 8.12 Voice mode (cross-link)
A voice cooking mode is available from the recipe detail when configured. See **§15**.

---

## 9. Meal Plan

### 9.1 What it is
A rolling, week-based calendar of meals. The unit of value is the **meal plan entry**: a card in a slot on a date.

The plan view itself is a **horizontally scrolling board**: rows are slot types, columns are days. The user can scroll forward and back through dates without changing pages.

### 9.2 Window
- The board renders **14 days back** to **21 days forward** from today (in the user’s tz).
- Rows are seven UI slots: **Breakfast, Snack (AM), Lunch, Snack (PM), Dinner, Dessert**, plus an implicit “other.”
- The horizontal scroll position resets to today on mount, and on tab-re-tap, via a `kitchenos:plan-scroll-to-today` event.

### 9.3 Slot encoding
The DB only knows five slot values: `breakfast | lunch | dinner | snack | other`. The UI encodes the seven visual slots through `(meal_slot, sort_order)`:
- `snack_am` → `meal_slot = "snack"`, `sort_order` base 100
- `snack_pm` → `meal_slot = "snack"`, `sort_order` base 300
- `dessert` → `meal_slot = "other"`, `sort_order` base 500

The `classifyStoredMealEntry` helper does the reverse mapping when reading rows back.

### 9.4 Plan entry shape
Each entry row carries:
- `meal_plan_id` → a per-(owner, week_start) `meal_plans` row (Monday-anchored).
- `plan_date`, `meal_slot`, `sort_order`.
- `recipe_id` (optional — entries can be label-only, or ingredient-only as a quick add).
- `label`, `notes`.
- **`servings`** — defaults to 4, range 1–99.
- **`is_suggestion`** — true for AI-generated entries that haven’t been accepted.
- **`suggestion_pool`** — a JSON array of alternative candidates the user can cycle through.

### 9.5 Adding meals
Tapping an empty slot opens a composer with a `SearchableSelect` that lists:
- **Recipes** (tier 1: tagged for this slot; tier 2: any). Stored as `r:123`.
- **Ingredients** (tier 2). Stored as `i:456`. Picking an ingredient creates a label-only entry — no recipe.

Picking a candidate calls `addMealPlanEntryAction`, which finds or creates the week’s `meal_plans` row, computes the next `sort_order` in the slot, and inserts a row with `servings = 4`, `is_suggestion = false`, then clears any matching dismissal record.

### 9.6 Drag and drop
Cards can be dragged across slots and days using **native HTML5** drag/drop (not `@dnd-kit` here, even though the library is used elsewhere):
- Dropping on an **empty cell** calls `moveMealPlanEntryAction`.
- Dropping on **another card** calls `swapMealPlanEntriesAction` (swaps places).

In both cases, both rows are promoted from `is_suggestion = true` to false on move.

### 9.7 Servings on a card
Each card has a small servings stepper. It debounces via `useDebouncedCommit` and calls `updateMealPlanEntryServingsAction`. **Decrementing past 1 deletes the entry** (no separate trash button needed, though one is shown when servings = 1).

### 9.8 AI suggestions
The plan is partly proactive — kitchenOS tries to fill gaps in the next 7 days with suggested meals based on:
- Your **library** of recipes (own + saved community).
- A short **inventory summary** (top 120 ingredients).
- The **people** in your household and their dietary restrictions / allergies (only those fields, **not** macro targets).
- A list of **rules** in `MEAL_SUGGESTION_RULES` (currently: meal type matches slot, no repeat within 4 days).

#### 9.8.1 The suggestion chain
The chain logic (`ensureSuggestionChainAction`):
1. Looks at the next 7 days.
2. Finds **gaps** — slots that are not yet filled and aren’t blocked by a dismissal — that come *after* a committed (non-suggestion) meal in the same slot.
3. Calls the `openai-kitchen` Supabase edge function in `weekly_suggestions` mode with up to **8 candidates per gap**.
4. Picks the first acceptable candidate per gap (must reference a real visible recipe), inserts it as a new `meal_plan_entries` row with `is_suggestion = true` and the rest of the candidates packed into `suggestion_pool` as JSON.
5. The first time the user opens `/plan` after load, this runs once via a client effect.

#### 9.8.2 Cycling
Each suggestion card has a cycle button (left/right arrow). Clicking it:
- If the pool has alternatives, **pops** the next one (optimistic UI), and in the background calls `cycleMealPlanSuggestionAction`. If the pool is now ≤ 2 deep, also calls `refillSuggestionPoolAction`.
- If the pool is empty, shows a spinner and runs the LLM for that single slot.

#### 9.8.3 Accepting
Clicking the card or the “accept” affordance promotes the suggestion: `is_suggestion = false`, `suggestion_pool = null`. The chain may then suggest the *next* day’s slot.

#### 9.8.4 Dismissing
The trash button on a suggestion deletes the row **and** writes a `meal_plan_slot_dismissals` row keyed by `(owner_id, plan_date, meal_slot, sort_order)`. The chain won’t re-suggest the same slot until that dismissal is cleared (which happens automatically when the user drops a real meal into the slot).

### 9.9 Past styling
Slots before their cutoff hour for that date in the user’s tz get a dimmed style (e.g. dinner becomes “past” after 8 PM). This is purely visual.

### 9.10 Things that exist as code but aren’t mounted
- **`PlanToolbar`** — has an “AI suggest week” button that uses the legacy whole-week destructive suggestion endpoint. Not rendered in the live `/plan` page.
- **`PlanWeekNav`** — week-range and day-range nav with `?w=` / `?d=` URL params. Not rendered in the live page (the live board is one continuous horizontal scroll instead).

These are documented in storybook only.

---

## 10. Shopping List

### 10.1 What it is
The shopping list is a **computed view**: it is derived live from the user’s meal plan, not stored as rows the user appends to. Every time you load `/shop`, the server re-derives it from your plan and inventory.

### 10.2 How it’s computed (`getShoppingListAction`)
1. Find every `meal_plan_entries` row in the next 7 days that has a non-null `recipe_id` (this **includes AI suggestions** — the list doesn’t filter by `is_suggestion`).
2. Load each recipe’s ingredients, skipping `is_optional`.
3. For each line, compute a **planned amount** = the recipe’s amount × `(planned_servings / base_servings)`, where `planned_servings = entry.servings ?? 4` and `base_servings = recipe.servings ?? 4`.
4. Aggregate by `(ingredient_id, unit)` — same ingredient + same unit gets summed.
5. Subtract the user’s **inventory** for that ingredient + unit (if units match). If the ingredient has multiple inventory rows, sum them across locations.
6. Merge per ingredient via `mergeShoppingListItemsByIngredient` so the UI shows **one row per ingredient**, even if multiple recipes asked for it in different units. When units differ, the row shows multiple `checkOffLines` so the user can tick each one off independently.
7. Sort by grocery aisle (`groceryAisleForIngredient` — a slightly different mapping than `grocery_category`, tuned for shopping flow).

### 10.3 The UI
- Sections grouped by aisle / grocery category.
- Each row has an ingredient name, a quantity to buy, and a checkbox.
- Checking a row calls `checkOffShoppingItemAction`, which adds the bought quantity to inventory (and may run multiple line check-offs for multi-unit rows).
- After 1 hour, checked rows auto-dismiss from the screen.
- Keyboard spatial nav, similar to inventory.

### 10.4 The `shopping_items` table is a red herring
There is a `shopping_items` table in the database with owner-scoped RLS and a v2 trigger, but the **/shop UI does not read or write it**. It only appears in some merge / cleanup paths. Anyone designing a manual "shopping list" UI in the future should decide whether to use that table or extend the computed model.

### 10.5 No manual add
The current shop page has no “add a custom item” affordance. Everything comes from the plan. (See **§21** for this gap.)

---

## 11. Instacart handoff

### 11.1 What it does
The shop page has a **Send to Instacart** button. When clicked:
1. The server re-runs `getShoppingListAction` to get the current computed list.
2. For each ingredient in the list, it loads `ingredient_products` (top-ranked first) and grabs the first row with a barcode.
3. It maps each list line to an Instacart line item with a name, display text, measurement, and (when found) UPC list.
4. It calls Instacart’s `products_link` API and gets back a public Instacart shopping list URL.
5. The browser opens that URL in a new tab. If popups are blocked, a toast falls back.

### 11.2 Configuration
- Server-only env: `INSTACART_API_KEY` is required. Without it, the action returns `InstacartNotConfiguredError` and the button surfaces a friendly message.
- `INSTACART_API_BASE_URL` is optional; defaults to `https://connect.instacart.com`. A dev URL exists for testing.
- The created link has `link_type: "shopping_list"` and a 14-day expiry. The landing page configures a `partner_linkback_url` back to the user’s `/shop`.

### 11.3 Unit mapping
Some kitchenOS units don’t map cleanly to Instacart, so `mapUnitToInstacart` collapses count-style units to `each` and rounds quantities up (`each` quantities are ceilinged; other units round to ≥ 0.01).

---

## 12. Receipts (in progress)

### 12.1 Why it exists
A grocery receipt is an authoritative snapshot of what just entered the kitchen. Receipt import is the easiest possible way to keep inventory in sync without typing each item.

> **Status**: This feature is partially shipped. Some files are uncommitted at the time of writing. See **§21** for the delta.

### 12.2 What is and isn’t supported today
- **Supported**: paste the **text** of a receipt into a textarea. The system parses it (LLM), matches lines to existing inventory, lets the user review and adjust, and applies inventory deltas + price/product info.
- **Not supported today**: photo OCR, camera capture, file/CSV upload. Despite some UI copy, the FAB only shows a textarea. Receipt photo storage is **not** a thing — only the pasted text is persisted.
- **Models in use**: `gpt-4o-mini` for an optional cleanup pass on messy pastes; `gpt-4o` for the structured parse; `gpt-4o` with the web-search tool for optional product enrichment. None are vision models.

### 12.3 The data model
Two tables:

- **`receipt_imports`** — one row per import session. Has `raw_text`, `item_count`, `applied_count` (lines that became `applied` or `created`), `excluded_count` (lines with an `excluded_reason`), and timestamps.
- **`receipt_import_items`** — one row per parsed line. Has the `raw_line`, a `status` (`applied | created | ignored | excluded`), an `excluded_reason`, the chosen `ingredient_id`/`ingredient_name`, the `product_name` and `product_brand`, the inventory `quantity_delta` and `unit`, the package size (`unit_size_amount`/`unit_size_unit`), price + price basis fields, the original purchase quantity/unit, an LLM-set `confidence` (`high | medium | low`), and a list of `review_flags`.

Both have RLS and trigger-based `owner_id` stamping.

### 12.4 The flow

1. **Open**: the **ReceiptImportFab** lives on `/inventory` (and only there). It’s a pill-and-FAB combo: when there are pending parses or a review queue, the pill shows status (e.g. “3 to review”). The FAB itself opens a native dialog.
2. **Paste**: the user pastes receipt text and clicks Import. The dialog closes.
3. **Background parse**:
   - **Cleanup** (optional, gpt-4o-mini): if the paste looks unstructured (e.g. messy Instacart format), an LLM tidies it. Skipped if the text already looks structured.
   - **Parse** (gpt-4o, JSON output, ~75s timeout): chunked at 15 non-empty lines per batch, up to 6 chunks, results merged. Asks the model to skip non-food lines, handle dedupe, set `excludedReason` for non-food/tax/total lines, populate price + price basis, set confidence per line.
   - **Hallucination strip**: if the model returned an `ingredient_id` not in the user’s inventory context, that id is nulled and confidence downgraded.
   - **Deterministic match**: for unmatched lines, run a token-window match against `(ingredient name, alias)` index built from the live inventory and aliases.
   - **Web enrichment** (optional, gpt-4o + web_search): for up to 20 rows that look like packaged products, fetches brand and pack size. Only rewrites `productName` if new detail words appear.
   - **Review flags**: builds a per-row list (`buildReviewFlags`) that calls out missing match, low confidence, missing quantity, unit mismatch with inventory, sanity issues, missing pack size for mass+volume lines, weight pricing without basis, etc. Excluded lines get no flags.
4. **Queue**: rows arrive in a client-side queue (`lib/receipt-import/queue.ts`) that persists to localStorage. Sections:
   - **Parsing** (in-flight batches with retry/dismiss).
   - **Review** (non-high-confidence or flagged rows).
   - **Confirmed** (high confidence, no flags).
   - **Excluded** (auto-excluded by the LLM with a reason; can be re-included).
5. **Adjust**: each row can be edited inline — change brand / product / pack size / quantity / stock unit / price basis. Or “Map to” lets the user re-pick or create the matched ingredient. Or X excludes it (with the reason set to "manual"). Or the user can ignore it entirely.
6. **Apply**: the user clicks Apply (N). The server action `applyReceiptReviewAction`:
   - For each `assign` decision: increments inventory quantity (creates the row in a default storage location if needed), upserts a preferred product (with rank 0 — top of list — and shifts existing ranks).
   - For each `create` decision: creates a new ingredient (title-cased, with backbone defaults) and then runs the same assign logic.
   - For each `ignore` decision: nothing.
   - Logs the import: inserts one `receipt_imports` row and N `receipt_import_items` rows (best-effort — log failures don’t block the apply).
   - Toasts and refreshes.

### 12.5 The receipt log
`/receipt-log` shows past imports as cards (newest first), each with a wide table of items: status, raw line, ingredient, brand, product, purchased qty, pack size, added to stock, price, confidence, notes (excluded reason + review flags). It does **not** show the parent `raw_text`, and there is no undo / re-apply / drill-down today.

---

## 13. People (family members + nutrition targets)

### 13.1 What this is
Each Supabase user can record one or more **people** (themselves, family members) with biometrics and nutrition targets. People are *not* additional logins — they’re structured records tied to the household.

### 13.2 Data shape
Each person has:
- **Profile**: `name`, `birth_date`, `weight` (lbs by convention, not enforced), `height` (free text like `"5 ft 7 in"`), `daily_calorie_expenditure` (TDEE, manually entered).
- **Calorie targets**: `calorie_min`, `calorie_max`, `calorie_target`.
- **Protein targets**: `protein_min_grams`, `protein_max_grams`, `protein_target_grams`.
- **Fat targets**: `fat_min_grams`, `fat_max_grams`, `fat_target_grams`.
- **Carb targets**: `carb_min_grams`, `carb_max_grams`, `carb_target_grams`.
- **Lists**: `dietary_restrictions`, `allergies` (jsonb arrays).

> **Note**: Fat and carb targets have a complicated migration history — see **§21**. The app code still expects fat/carb target columns to exist. There’s schema drift to clean up here.

### 13.3 The pages
- **`/people`** — a grid of `PersonMacroPieCard`s, each linking to a person’s detail page. The card shows an interactive **macro pie** colored magenta/yellow/cyan for protein/fat/carbs.
- **`/people/[id]`** — a detail form with all biometric fields, the macro pie, and four nutrient sliders (calories, protein, fat, carbs).

### 13.4 The interactive macro pie
The pie is *interactive*:
- **Drag the outer edge**: resizes the pie, which corresponds to changing the calorie target. Macro grams scale proportionally to keep the same split.
- **Drag the protein/fat boundary** or the **fat/carb boundary**: changes the share of each macro in the pie while keeping the total calories from the start of the drag fixed.
- On pointer up, commits via `updatePersonMacrosAction`.

The pie diameter maps to a calorie target between 800 and 4500 kcal.

### 13.5 The nutrient sliders
Four sliders: **Calories** (1000–3000, step 10), **Protein** (50–250 g, step 1), **Fat** (0–200 g, step 1), **Carbs** (0–500 g, step 5). Each has a **lock** button.

The sliders are linked through Atwater factors (4 kcal/g protein and carbs, 9 kcal/g fat):
- Moving a macro automatically updates calories.
- Moving calories scales macros proportionally (default mix 30% protein / 35% carbs / 35% fat kcal if no prior targets).
- Locks fix the chosen targets while others absorb changes.

Each slider also has optional **min** and **max** band thumbs. Clicking the track to the left of the target sets `*_min`; to the right sets `*_max`. Double-click or drag-out clears the band.

### 13.6 How people connect to meal planning
Today the meal plan AI uses **only** `name`, `dietary_restrictions`, and `allergies` — *not* the calorie/macro targets — when generating suggestions. Recipes do not currently get scored against per-person macro targets. (See **§21** — this is a known gap that the system is data-ready for.)

### 13.7 Equipment
- The `equipment` catalog (~95 seeded kitchen tools across categories) and a per-user `user_equipment` toggle table both exist in the database.
- The **legacy** `recipes-ui` has UI for marking "I own this." The Next app does not have a settings page for equipment.
- Equipment is not used in meal suggestions, recipe filtering, or anywhere else in the Next app today.

---

## 14. Community & sharing

### 14.1 The model
There is no separate “publish” step. Once you create a recipe, **other signed-in users can read it** through `/community` (RLS allows authenticated select on any non-deleted recipe). When you’re signed *out*, the same is true thanks to `supabase_migration_public_recipe_read.sql`.

### 14.2 Library vs duplicate
- **Library**: clicking the heart on a community recipe inserts a `(user_id, recipe_id)` row in `user_recipe_library`. You see the recipe in *your* recipes list and reach it via `/recipes/[id]`. If the author edits it, you see the edits live. If they delete it, you see a tombstone with a "Remove from library" button.
- **Duplicate**: explicitly copies the recipe (with a new `owner_id = you`), re-resolves all its ingredients against your catalog, and redirects you to your new copy.

The `addRecipeToLibraryAction` rejects:
- Saving your own recipe to your library.
- Saving a deleted recipe.
- Duplicate library rows (idempotent — no error).

### 14.3 The kebab menu
On a community recipe, the kebab menu offers:
- **Save / Remove from my recipes** (library toggle).
- **Duplicate** (creates an owned copy and redirects).
- The author’s **Source URL** (if any).

### 14.4 The community list
`/community` shows all non-deleted recipes that don’t belong to you, in `created_at` order. Heart buttons stop click propagation so the card doesn’t navigate when you save / unsave.

### 14.5 Empty state
"No recipes in the community yet — add one and it shows up here automatically."

---

## 15. Voice cooking mode

### 15.1 What it is
A hands-free guided cook for a specific recipe. The user taps a Phosphor `Waveform` FAB on the recipe detail (when configured), and an ElevenLabs Conversational AI session opens. The agent walks the cook through ingredients first, then steps, pausing for "got it" / "next" / questions. Currently spoken ingredients and steps are highlighted and auto-scrolled into view.

Bottom-center FABs control mute and end-session. Voice mode is hidden in **edit** and **remix** modes (talking to a recipe doesn’t make sense while authoring it).

### 15.2 Configuration
Three env vars must all be set:
- `ELEVENLABS_API_KEY` (server-only).
- `ELEVENLABS_AGENT_ID` (server-only) — the dashboard agent must have the five client tools wired (see below).
- `NEXT_PUBLIC_VOICE_MODE_ENABLED = "true"` — client gate so users don’t see a broken FAB before the agent is configured.

Optional: `ELEVENLABS_VOICE_ID` and `NEXT_PUBLIC_ELEVENLABS_VOICE_ID` to override the agent’s default voice.

### 15.3 How a session starts
1. The user taps the FAB.
2. Browser calls `getSignedConversationUrlAction()`, which mints a short-lived signed URL against the agent.
3. The browser opens the SDK WebSocket and passes a session-level **system prompt** built by `buildVoiceSystemPrompt()`.

The prompt contains:
- The recipe in **smart-grouped order** (`groupIngredientsForVoice`: pantry → fridge → produce → protein).
- The current servings scale.
- What’s in stock.
- Detailed flow rules for when to call each client tool, when to advance, when to pause.

### 15.4 Client tools the agent calls
Five tools, all defined in `lib/voice/agent-config.ts` with names + parameter schemas that **must match** the dashboard exactly:
- **`set_focus`**: highlight an ingredient or step on screen.
- **`set_phase`**: move between `idle`, `gathering`, `cooking`, `wrapping_up`.
- **`start_step_timer`**: kick off the existing per-step kitchen timer for a step.
- **`end_voice_mode`**: end the session.
- **`note_user_action`**: log a side note (out of stock, substitution, skipped step).

When a step timer goes off, the SDK is fed a `[timer]` contextual update so the agent can announce it naturally without playing a sound.

### 15.5 Cost & limits
- Conversational AI is metered per minute. Roughly $13 of credits per 45-minute cook on the Creator tier.
- A usage cap should be set in the ElevenLabs dashboard before exposing this beyond the team.

### 15.6 Things voice mode doesn’t do
- No transcript persistence — sessions are ephemeral.
- No ad-hoc kitchen timers (only timers attached to specific recipe steps). “Set a 5 minute timer” without a step is on the wishlist.
- No barge-in nuance beyond what the SDK does natively.

---

## 16. AI features — index

A condensed list of every place we call an LLM, and what for.

| Surface | Model(s) | Where | Purpose |
|---|---|---|---|
| Recipe import | OpenAI structured prompt | `lib/recipe-import/parse-recipe.ts` | Parse a URL / text / image into a structured recipe (title, headnote, sections, lines, steps, times, etc.). |
| Recipe ingredient resolution | OpenAI (configurable) | `lib/ingredient-resolution/llm-resolve.ts` | When deterministic matching fails, decide use-existing / variant / standalone create with a confidence score. |
| Recipe image generation | `gpt-5` for prompt, `gpt-image-1` for pixels | `lib/recipe-image-generation/*` | Generate a cover image from the recipe context, then run a vision QC pass. |
| Meal plan suggestions (rolling chain) | `gpt-4o-mini` (default) | Supabase edge function `openai-kitchen` (`weekly_suggestions`) | Suggest meals for next 7 days given library, plan, people, inventory, and rules. |
| Meal plan whole-week (legacy) | `gpt-4o-mini` (default) | Same edge function (`meal_plan`) | Destructively replace a week’s entries with an AI-generated plan. UI not currently mounted. |
| Receipt cleanup | `gpt-4o-mini` | `lib/receipt-import/clean-receipt.ts` | Tidy unstructured receipt pastes. Skipped if input already looks structured. |
| Receipt parse | `gpt-4o` | `lib/receipt-import/parse-receipt.ts` | Convert receipt text into structured line items with confidence and review flags. |
| Receipt enrichment | `gpt-4o` + web_search tool | `lib/receipt-import/enrich-with-web-search.ts` | Fill in brand and pack size for packaged products. Capped at 20 rows. |
| Ingredient nutrition assist | OpenAI | `lib/nutrition/llm-ingredient-assist.ts` | Refine the search query before USDA / CNF. |
| Ingredient nutrition estimate | OpenAI | `lib/nutrition/llm-nutrition-estimate.ts` | Last-resort per-100g estimate when no official match. Marked low confidence and `needs_review`. |
| Voice cook | ElevenLabs Conversational AI | `recipe-voice-mode.tsx` + `lib/voice/*` | Real-time spoken cooking guidance with five client tools. |
| Backbone taxonomy suggestion | OpenAI | Admin panel only | Suggest taxonomy subcategories for ingredients that didn’t hit the catalogue. |
| Inventory unit cleanup recommendations | OpenAI | Script only (`scripts/recommend-inventory-units.ts`) | Bulk LLM review of inventory units to generate cleanup SQL. |

If `OPENAI_API_KEY` is missing, every flow above degrades gracefully:
- Recipe import: ingredient resolution falls back to standalone creation with cleaned names.
- Receipt: cleanup skipped; if the parse fails, the user gets an error.
- Nutrition: official-only matching, no estimate.
- Backbone admin: panels show errors.

---

## 17. Admin & internal tools

These are gated behind the URL only — there is no role-based access. Anything an authenticated user with the URL can hit, they can use. Treat these as power-user / operator tools, not customer features.

### 17.1 `/admin/ingredient-autofill`
- Requires sign-in.
- Hosts two panels:
  - **IngredientBackboneCataloguePanel**: seed the backbone catalogue from the in-repo seed, apply catalogue defaults to existing ingredients (dry-run / commit), look up specific names.
  - **IngredientBackboneBackfillPanel**: regex-based fill of empty backbone fields, suggest taxonomy for unmatched ingredients via LLM, accept suggestions.

### 17.2 `/admin/unit-cleanup`
- No auth check at the page level.
- Loads the latest review JSON from `app/recipes-next/scripts/output/`.
- Lets the user filter, mark approved, save, and generate SQL into `app/database/supabase_migration_inventory_unit_cleanup.sql`.
- Marked **temporary tool** in the page copy.

### 17.3 `/admin/color-audit`
- No auth check at the page level.
- Renders a server-side scan of color usage across the codebase, with proposals.

### 17.4 `drift_check.mjs`
- Node script in `app/database/`. Compares columns implied by the `supabase_migration_*.sql` files against a live `db-columns.json` exported from `information_schema`. Used to detect schema drift.

---

## 18. UX foundations (design system, primitives, theming)

### 18.1 Visual identity
- **Font**: Geist Sans, loaded via the `geist` package.
- **Icons**: Phosphor — both as a webfont (`@phosphor-icons/web@2.1.2`) and as a React package (`@phosphor-icons/react`). Components mostly use the React package; Phosphor classes (`ph ph-*`) appear in some chrome.
- **Color tokens**: defined in `app/recipes-next/src/app/globals.css` with light/dark variants gated by `data-theme`. Macro pie uses a fixed primary triad: protein magenta `#EC008C`, fat yellow `#FFF200`, carbs cyan `#00AEEF`.

### 18.2 Theming
- Stored in `localStorage` under `kitchenos-theme`. Values: `system | light | dark`. (Not a cookie — note the legacy `app-theme` term that has appeared in some discussions is wrong.)
- A `THEME_INIT_SCRIPT` injected into `<head>` resolves and applies before paint to avoid flicker.
- The account menu has a three-up theme picker.

### 18.3 Toaster
- **Sonner** at bottom-right, max 4 toasts at a time, default duration 10s, with a close button.
- The toaster is **top-layer aware**: when a native `<dialog>` is open via `setTopLayerHost`, the toaster is portaled into it so toasts sit above the modal instead of behind it.

### 18.4 Top-layer host pattern (a hard rule)
The browser’s top layer (used by `showModal()`) sits above z-index. Anything that portals (popovers, dropdowns, comboboxes, tooltips, nested confirm modals, toasts) **must** portal into the active top-layer host when there is one, otherwise their content appears *behind* the dialog.

The shared store at `lib/top-layer-host.ts` exports:
- `setTopLayerHost(el)` / `getTopLayerHost()` — used by the modal opener (e.g. `RecipeDetailDialog`, the receipt FAB) when it opens / closes.
- `useTopLayerHost()` — for Radix or Base UI `Portal container` props.
- `useTopLayerPortalContainer()` — returns the active dialog when open or `document.body` otherwise; used by `createPortal`.

Every floating UI primitive in the app uses this pattern. The workspace rule **`popovers-above-modals.mdc`** enforces it for new code.

### 18.5 Step timer watcher
A global `StepTimerWatcher` lives in the root layout. It listens for cooking timer events; on a milestone it plays a soft nudge sound, on a “done” event it starts a continuous alarm and shows a sticky toast that stops the alarm on dismiss.

### 18.6 Time zone
On every page load, `TimeZoneSync` writes the browser’s tz to a `user_tz` cookie (1-year, lax, path `/`). The server reads it via `getUserTimeZone()` for plan date math.

### 18.7 Forms & autosave
Many fields use a shared `useDebouncedCommit` hook:
- Local optimistic state, default 500ms debounce.
- On commit: if the server returns `{ ok: false }`, revert.
- `flush()` for blur or unmount.
- Calls `router.refresh()` on success.

This is the standard pattern for inventory quantity, plan servings, and similar stepper-style fields.

### 18.8 Ingredient picker
The `SearchableSelect` is the standard typeahead picker. It portals through the top-layer host, supports `allowCreate`, and supports an `bareInline` mode for nested table cells.

### 18.9 Storybook
- Set up with `@storybook/nextjs-vite`.
- Addons: a11y (informational mode, not failing builds), docs, Chromatic.
- Stories live next to components, e.g. `recipe-card.stories.tsx`.
- Coverage is partial: about 34 stories, including auth, app chrome, recipe card / detail, plan board, inventory, person components, and shared primitives. Not exhaustive.

### 18.10 Testing
Unit tests live under `src/lib/__tests__/`, `src/lib/<area>/__tests__/`, and `src/app/actions/__tests__/`. Vitest, Node environment. Coverage today (selected):
- Legacy instructions parse / format.
- Recipe description link parsing.
- Ingredient backbone inference.
- Ingredient resolution normalize + pipeline.
- Nutrition pipeline + normalize.
- Instacart line item mapping.
- Inventory unit cleanup recommendations.
- Voice grouped ingredients.
- Ingredient nutrition empty state edge cases.

There is **no E2E test suite** in the repo.

---

## 19. Storage, environments, deployment

### 19.1 The repo at a glance

- `app/recipes-next/` — primary Next.js app. Where 95% of new work happens.
- `app/recipes-ui/` — legacy static HTML/JS UI. Same Supabase backend. Deprecated for new feature work but still deployed somewhere.
- `app/database/` — schema, migrations, Python/Node data-import scripts. The single source of truth for SQL.
- `ios/` — small SwiftUI client. Reads recipes and ingredients from the same Supabase project. Email + Google sign-in. Mostly read-only today.
- `supabase/` — Supabase CLI metadata (project id, function configs) and the **`openai-kitchen` edge function** source.
- `.github/` — CI workflows.
- `.cursor/` — workspace rules.

### 19.2 Hosting
- The Next app deploys to **Vercel** via GitHub Actions on push to `main` when paths under `app/recipes-next/**` change.
- The legacy static UI uses a `vercel.json` build that writes a local Supabase config from env vars before serving the static folder.
- Storybook is built locally to `storybook-static/`. There’s no automated Storybook deployment in this repo.

### 19.3 Environment variables (canonical list)

Public (browser-exposed):
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key.
- `NEXT_PUBLIC_SUPABASE_RECIPE_BUCKET` — overrides the default bucket name `"recipe-images"`.
- `NEXT_PUBLIC_VOICE_MODE_ENABLED` — gates the voice FAB.
- `NEXT_PUBLIC_ELEVENLABS_VOICE_ID` — optional voice override on the client.

Server-only:
- `SUPABASE_SERVICE_ROLE_KEY` — used only in admin/server flows that bypass user RLS (storage, image gen, scripts).
- `OPENAI_API_KEY` — every LLM flow.
- `RECIPE_IMAGE_DIRECTOR_MODEL` — defaults to `gpt-5`.
- `USDA_FDC_API_KEY` — defaults to `DEMO_KEY` if missing.
- `INSTACART_API_KEY` — required for Send to Instacart.
- `INSTACART_API_BASE_URL` — defaults to production.
- `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_VOICE_ID` — voice mode.

The `lib/env.ts` helpers (`isSupabaseConfigured`, `isVoiceModeConfiguredServer`, etc.) are the canonical gates.

### 19.4 Supabase edge function: `openai-kitchen`
A single Deno function with multiple modes. The Next app calls it with the user’s JWT for auth (the function has `verify_jwt = true` in `supabase/config.toml`). Modes:

- **`meal_plan`** — legacy whole-week destructive suggestion. Returns a 7-day plan + shopping suggestions.
- **`weekly_suggestions`** — current rolling chain. Constrains suggestions to titles in `own_recipes` / `community_recipes` lists. Returns `{ slots: [...] }` with `candidates_per_gap` candidates each.
- Any other mode → 400 `"Unknown mode"`.

### 19.5 Database scripts (Notion → SQLite → Supabase)
The `app/database/` Python scripts implement the original seeding pipeline. They are operator tools, not runtime services.
- `import_recipes.py` — CSV (Notion export) → local `recipes.db`.
- `build_ingredients_from_recipes.py` — parse recipe ingredient text → local `ingredients` table.
- `import_ingredients_from_csv.py` — extended ingredients import.
- `import_public_notion_table.py`, `merge_notion_public_data.py` — merge Notion JSON exports.
- `sync_to_supabase.py` — bulk push from SQLite to hosted Postgres (uses `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, and optionally `KITCHENOS_OWNER_EMAIL` to attach owner_id).
- `export_recipes_json.py`, `update_supabase_images.py` — utility dumps and image patches.

### 19.6 Migrations protocol
Per the workspace rule (`.cursor/rules/supabase-sql-migrations.mdc`): any change that **adds, removes, or alters database structure or policies** must:
1. Be supplied as a runnable SQL block in the same response that proposes the change.
2. Be saved to `app/database/supabase_migration_<topic>.sql` using `IF NOT EXISTS` / idempotent patterns where possible.
3. Be reflected in `app/database/schema.sql` for offline parity.

Several historical migrations have hardcoded production IDs. They are not portable to a fresh DB. See **§21.6**.

### 19.7 Storage
- Bucket: `recipe-images`. Public read; authenticated write/update/delete. Created and policied in `supabase_storage_setup.sql`.
- Recipe `image_urls` is a JSONB column added by `supabase_add_image_urls.sql` to keep a history of image URLs alongside the primary `image_url`.

---

## 20. Database (single source of truth, abridged)

This is a high-level table summary for orientation. The authoritative shapes live in the migration files.

| Table | Owner-scoped? | Highlights |
|---|---|---|
| `auth.users` | n/a (Supabase) | Source of identity. |
| `recipes` | Yes (`owner_id`) | Recipe rows; soft-delete via `deleted_at`. RLS: anyone can read non-deleted; owner can write. |
| `recipe_ingredient_sections` | via parent recipe | Heading + sort order. |
| `recipe_ingredients` | via parent recipe | One line per ingredient with amount/unit/preparation/optional/display. |
| `recipe_instruction_steps` | via parent recipe | Numbered steps with optional heading and timer range. |
| `user_recipe_library` | Yes (`user_id`) | Saved-recipe pointers. |
| `ingredients` | **Shared** | The catalog. Globally unique on `lower(name)`. |
| `ingredient_aliases` | **Shared** | Synonyms with source. |
| `ingredient_nutrients` | **Shared** | USDA-style per-nutrient breakdown. |
| `ingredient_portions` | **Shared** | Named portions with gram weight. |
| `ingredient_products` | Yes (`owner_id`) | Per-user ranked preferred products. |
| `ingredient_backbone_catalogue` | **Shared** | Curated taxonomy with defaults. |
| `inventory_items` | Yes (`owner_id`) | (ingredient × storage_location) with qty/unit. |
| `equipment` | Catalog (read-only) | Seeded list of kitchen tools. |
| `user_equipment` | Yes (`user_id`) | Per-user has-it toggle. |
| `meal_plans` | Yes (`owner_id`) | Per-(user, week_start). |
| `meal_plan_entries` | via parent plan | Slot cards with servings + suggestion fields. |
| `meal_plan_slot_dismissals` | Yes (`owner_id`) | Trash-suggestion blocklist. |
| `shopping_items` | Yes (`owner_id`) | **Defined but not used by the live shop UI.** |
| `people` | Yes (`owner_id`) | Family members + nutrition targets. |
| `receipt_imports` | Yes (`owner_id`) | One row per import. |
| `receipt_import_items` | Yes (`owner_id`) | One row per parsed line. |

Storage:
- `recipe-images` bucket — public read.

---

## 21. WIP, partial features, and known drift

This section is **the honest list**. Anything not yet finished, not yet wired up, or quietly inconsistent between the database, the UI, and the code lives here. When you build a new feature, check this list first to avoid stepping on a known issue.

### 21.1 Receipt import / log
- Files for the log page and list component were untracked at the time of writing — feature not fully merged.
- The `schema.sql` in the repo doesn’t list `receipt_imports` / `receipt_import_items` tables. The migration is the source of truth until that gap closes.
- **No vision/OCR**: the FAB is text-paste only. Camera capture, file upload, and CSV upload don’t exist despite some UI copy hinting at them.
- **No undo / re-apply**: applied imports are immutable.
- **No `raw_text` display** on the log page: the parent receipt’s pasted snapshot isn’t surfaced in the UI.
- **Item ordering** on the log page is global by `created_at` desc, not per-import; line order within an import isn’t guaranteed.
- **Soft warning for partial chunk failure** in the parser is a TODO.

### 21.2 Inventory
- **Storage location dropdown drift**: the table view’s inline storage select shows only 4 options (Fridge, Freezer, Shallow Pantry, Deep Pantry) — it’s missing **Other** and doesn’t allow custom values. The detail sheet and filter bar do.
- **No URL state** for filters or view mode — not deep-linkable, not persisted.
- **Multi-row per ingredient** (same ingredient in multiple locations) is supported in DB but the table and category views collapse to one row per ingredient via `getInventoryRowForIngredient`. There is no full multi-location matrix UI.
- **Legacy stock columns** (`current_stock`, `minimum_stock`, `maximum_stock`) on `ingredients` still exist but are no longer the source of truth. They’re fallback display only.
- **Variants in the table view**: the table component does not show variants. Variant expand/DnD lives only in the (Storybook-only) `InventoryTableBody` component.
- **No min/max thresholds / low-stock view** today.
- **`InventoryTableBody`** is in Storybook only; the real table view is `InventoryTableView`.

### 21.3 Plan
- **`PlanToolbar`** (with “AI suggest week”) is fully implemented but **not mounted** in the live plan page.
- **`PlanWeekNav`** (week/day URL navigation) is implemented but **not mounted**.
- The plan board uses **native HTML5 drag/drop**, not `@dnd-kit`. New code that wants to integrate with drag/drop here should match.
- **`use-plan-board-fit.ts`** is marked as backward-compatible; column constants live in `plan-week-board.tsx` and are duplicated.
- `ensureSuggestionChainAction` runs from the client on mount, not from the server during render — there can be a brief empty-then-fill flicker.
- `acceptMealPlanSuggestionAction` doesn’t revalidate; the client triggers the chain refresh and `router.refresh()` itself.

### 21.4 Shopping list
- The list is fully **computed**, not stored. There is no manual “add a custom item to the shopping list” UI.
- The `shopping_items` table exists with RLS but is unused by `/shop`. Anyone designing manual add UI should decide whether to use it or extend the computed model.
- AI suggestions in the plan **count** toward the shopping list (any plan entry with a `recipe_id` is included, regardless of `is_suggestion`). This is intentional but worth being explicit about.

### 21.5 People & nutrition
- **Schema drift on macros**: `supabase_migration_people_fat_range.sql` removed `fat_target_grams` and `carb_target_grams` from `people`. But `supabase_setup.sql`, the TypeScript `PersonRow`, and the server action `updatePersonMacrosAction` all still write to those columns. If the migration was applied as written, every macro update is **silently broken** in production. **High-priority fix** — either revert that migration or update the code path.
- **Equipment is data-layer only** in the Next app: there’s no UI to mark “I own this” outside the legacy `recipes-ui`. The `user_equipment` table is unused in the Next runtime.
- **Equipment seed has duplicate names** (e.g. "Can opener" appears in both Small appliances and Prep tools). `on conflict (name) do nothing` means only the first wins — a hygiene issue.
- **`person-detail-form.tsx`** has unused hooks/state (`createPortal`, `deleteModalOpen`, `useId`, etc.) suggesting an incomplete delete-confirmation modal. Today, delete uses a native `window.confirm`.
- **`suggestedBandMin` / `suggestedBandMax`** are implemented in `person-nutrient-sliders.ts` but unused by the slider UI.
- **Per-person macros do not feed AI suggestions today.** The meal plan AI gets only `name`, `dietary_restrictions`, and `allergies` per person. Recipes are not scored against macro targets.
- **TDEE**: `daily_calorie_expenditure` is manually entered. There’s no auto-calculation from age/height/weight.

### 21.6 Ingredient catalog & data cleanups
- Several migrations have **hardcoded production IDs** (`supabase_migration_collapse_citrus_wedges.sql`, `supabase_migration_soft_duplicate_cleanup.sql`). They are not portable to a fresh DB and should not be in the rebuild path.
- `supabase_migration_strip_organic_from_ingredients.sql` references `owner_id` in conflict logic, which may be stale post-shared-catalogue migration.
- `default_units` (on the catalog) is authoritative in data and admin tooling, but the **live recipe unit dropdown does not use it** — it shows the global canonical unit list. New code might want to wire this in.

### 21.7 Auth & access
- Email + password only on the web. No magic link, no Google. iOS app has more.
- `/admin/unit-cleanup` and `/admin/color-audit` have **no page-level auth gate**. Anyone with the URL can view them. (`/admin/ingredient-autofill` does check sign-in.) These tools should be either auth-gated or moved out of the public Next routing.
- No role-based access. No "team" concept.
- The legacy data claim script (`supabase_claim_legacy_data_for_user.sql`) hardcodes a specific email. It’s a one-time tool, not a runtime feature.

### 21.8 Voice mode
- Cost is real ($13 per 45-min session). Set a usage cap before exposing it broadly.
- No transcript persistence.
- No ad-hoc kitchen timers (only timers attached to a step).

### 21.9 Storybook & tests
- Storybook a11y is informational (`a11y.test: "todo"`) — not gating.
- No E2E suite. Vitest tests are all unit-scope and Node-environment.

### 21.10 Legacy surfaces
- The static `recipes-ui` is still maintained well enough to deploy (its `vercel.json` writes config from env at build time) but is not the canonical web product.
- The iOS app exists, supports Email + Google, and is read-only for recipes/ingredients. It is not feature-complete with the web UI.

### 21.11 Operational footguns
- `update_supabase_images.py` embeds a hardcoded URL and key in source. **Treat as a template — never run as-is.**
- Operator scripts that need `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` should never be invoked from the Next runtime. Keep them in `app/recipes-next/scripts/` and `app/database/`.

---

## 22. Glossary

- **Apply (a receipt)** — Click the button that turns reviewed receipt items into actual inventory increments and product updates.
- **Backbone** — The curated taxonomy (`ingredient_backbone_catalogue`) of canonical ingredients with default metadata. New ingredients inherit from it.
- **Card** — A meal plan entry as drawn on the plan board.
- **Chain (suggestion chain)** — The rolling 7-day forward look that auto-fills empty plan slots after a committed meal in the same slot.
- **Community** — All non-deleted recipes from other users that you can read on `/community`.
- **Dismissal (suggestion dismissal)** — A row in `meal_plan_slot_dismissals` that prevents the chain from re-suggesting a specific slot. Cleared automatically when a real meal lands there.
- **Draft (recipe draft)** — An in-flight imported recipe sitting in browser session storage, awaiting confirmation on `/recipe-draft`.
- **Library** — The set of community recipes you saved (heart) without duplicating. Rows in `user_recipe_library`.
- **Owner** — The Supabase user that owns a record. Most tables have `owner_id`.
- **Plan board** — The horizontally scrolling calendar at `/plan`.
- **Pool (suggestion pool)** — JSON array of alternative candidates for a single suggestion card; powers the cycle button.
- **Receipt log** — `/receipt-log`, the read-only history of past receipt imports.
- **Remix** — A recipe edit flow that uses the existing recipe as context for the parser.
- **Resolution (ingredient resolution)** — The pipeline that maps free-text ingredient names to real `ingredient_id`s.
- **Section (recipe section)** — A heading group within a recipe’s ingredient list (e.g. “For the Dressing”).
- **Slot (meal slot)** — One of seven UI rows on the plan board. Maps to `(meal_slot, sort_order)` in the DB.
- **Storage location** — Where an inventory row lives physically: Fridge, Freezer, Shallow Pantry, Deep Pantry, Other, or any custom string.
- **Tombstone** — The “removed by author” state shown for community recipes that you saved before they were soft-deleted.
- **Top layer** — The browser’s special rendering layer for `showModal()`-ed dialogs. We portal floating UI into it via `lib/top-layer-host.ts`.
- **Variant** — A child ingredient under a parent (e.g. specific cuts under a generic).

---

*End of document. Maintained alongside the code. If something feels wrong, fix the code or fix the doc — don’t leave them in disagreement.*
