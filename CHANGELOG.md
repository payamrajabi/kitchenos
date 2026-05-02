# kitchenOS — Changelog

> Plain-English release notes, day by day. The [PRD](PRD.md) describes *what kitchenOS does today*. This file is the story of *how it got there* — the dated record of every working day where new product surface shipped.

---

## How to read this file

- One section per **day** that something shipped. Newest at the top.
- Each day starts with a one-line headline and then breaks down the changes by area of the app (Recipes, Inventory, Plan, etc.).
- We treat “shipped” as “merged to main and pushed.” Some days have one commit, some have a dozen — they’re collapsed into a single release because the user only sees the final state.
- “Behind the scenes” notes call out infrastructure or developer-experience changes that don’t directly change the product but are worth remembering.
- Dates are local Pacific time, matching the commit history.

---

## 2026-04-25 — Receipts, voice cooking, and the shared ingredient catalog

A big day. We shipped three large net-new features, plus the first written PRD.

### Receipts → Inventory

- New **Receipt Import** flow on the inventory page. A new floating button (next to the “add ingredient” FAB) opens a dialog where you paste the raw text of a grocery receipt.
- The receipt is cleaned up, parsed by an LLM, optionally enriched with a web search to disambiguate weird store-brand abbreviations, and matched against the items already in your kitchen.
- A review screen lets you confirm the matches before applying. Anything that didn’t match becomes a candidate to add as a new ingredient.
- Applying the receipt bumps quantities on existing inventory items and remembers your **product preferences** (which brand you bought, which size, at what price).
- New **Receipt Log** page at `/receipt-log`, linked from the avatar menu. Every receipt you’ve ever imported (raw text + every parsed line, including the lines we excluded) is preserved here as history.

### Hands-free voice cooking

- New **Waveform FAB** on every recipe detail page (web only, gated by an env flag). Tapping it opens a realtime voice session powered by ElevenLabs Conversational AI.
- The agent walks you through the recipe in two phases: it first goes through the ingredients in smart-grouped order (pantry → fridge → produce → protein), scaled to the servings you’ve selected, then walks you through the instruction steps one at a time, waiting for a spoken affirmative before moving on.
- While voice mode is active, the recipe layout swaps in two centered FABs (mute, end) and the row currently being read aloud is ringed and auto-scrolls into view.
- The phone’s screen stays awake while you cook.
- Step timers are forwarded back to the agent so it can announce timer finishes naturally instead of relying on a phone alarm.

### Shop → Instacart

- A **Send to Instacart** button on the `/shop` page maps your computed shopping list into Instacart line items and opens the Instacart handoff. (Filters out lines that aren’t real grocery items, like “2 tsp salt.”)

### Ingredient products

- Each ingredient can now hold a list of **products**: per-store variants with **price**, **price basis** (per kg, per unit, per pack…), **unit size**, and brand notes.
- New “Organize ingredient” menu surfaces these next to the ingredient itself, in both inventory and recipes.
- Products are owner-scoped — your products are yours; the canonical ingredient is shared.

### Inventory polish

- Inline **taxonomy-subcategory editor** on the inventory detail sheet. You can now reclassify an ingredient (e.g. move “Sumac” from “Spices & Seasonings” to “Herbs & Aromatics”) without leaving the side sheet.
- New admin tool at `/admin/unit-cleanup`: scans every inventory row and recommends a canonical stock unit per ingredient based on how it’s actually used. Useful for one-time cleanups when units drift across many users.

### The shared ingredient catalog (data shape change)

- The `ingredients` table is now formally **shared** across all users — no `owner_id`, one canonical row per food item, indexed on `lower(name)`. The migration deduped existing rows and updated every reference.
- “Soft duplicate cleanup” migration retired old user-scoped duplicates and pointed everything at the canonical row.
- “Collapse citrus wedges” migration consolidated lemon/lime wedge variants under their parent ingredient.

### Documentation

- First version of [`PRD.md`](PRD.md) — the living plain-English description of what kitchenOS does.
- New Cursor rule (`prd-sync.mdc`) that nags AI-assisted edits to keep the PRD in step with code changes.

### Behind the scenes

- New `popovers-above-modals` rule, ensuring dropdowns/toasts always stack above the recipe-detail modal (the native `<dialog>` top layer).
- Searchable-select, recipe ingredients editor, and recipe instructions editor all got polish passes.

---

## 2026-04-22 — Plan board fixes itself, recipes get a table view

A short, intense day: we caught a regression on `/plan`, recovered some lost work, and shipped two new view modes.

### Plan board

- **Fixed:** `/plan` was returning a 500 after upgrading to Next.js 16, because the rolling 7-day auto-fill was running during page render. Auto-fill now fires from the client right after mount, so the page loads instantly and suggestions trickle in.
- **New:** committed meals on the plan board now have a small **trash button** next to the servings control, so you can clear a slot without opening it.
- Better separation between “suggestion” slots (the AI-suggested cards) and “committed” slots (real planned meals): suggestions get cycle/dismiss/accept controls; committed meals get the new delete control.

### Recipes

- New **Table view** on `/recipes` (toggle next to the existing card grid). Columns include image, name, meal types, and a “my recipes / saved from community” marker.
- New **Table view** on `/inventory` as a third mode alongside list and categories. Dense, sortable, good for bulk edits.
- Recipe **AI bar** (the one that lets you refine an imported recipe) now collapses to a small FAB when you scroll, in both the standalone recipe page and inside the modal.
- Recipe ingredients now show an **“Out of stock”** badge inline when the viewer’s pantry doesn’t have that ingredient. Works the same in personal recipes and in community recipes you’ve saved.

### Authoring

- Instruction steps can now have an optional **heading** (e.g. “Make the dough”), and we backfilled headings on existing recipes that had them embedded in step text.

### Admin

- New `/admin/color-audit` page — a tool for designers to scan the codebase for hardcoded colors that should use design tokens.

### Behind the scenes

- A `theme-provider` component centralizes the light/dark/system theme story (previously a bare init script).
- A “draft imports shell” wraps the main and modal slots together so AI recipe drafts persist as you click between tabs.

---

## 2026-04-19 — A meal plan that fills itself, and recipes-as-overlays

### Plan

- **Auto-populating 7-day meal plan.** Empty slots on `/plan` are filled with GPT-4o-mini suggestions on page load. Each suggestion shows up as a soft card with:
 - A **cycle** button to flip through alternatives (we keep a small local pool of suggestions per slot, refilling when it runs out).
 - A **trash** button that dismisses the slot — auto-fill will leave it alone forever.
 - Any other interaction (edit servings, drag, swap) **promotes** the suggestion into a real, committed meal.
- All the suggestion rules live in one place (no-repeat-within-4-days, meal type matches slot type, etc.) so it’s easy to tighten the prompt over time.

### Recipes

- Recipe details now open as a **modal overlay** on top of whatever tab you were on, not a full-page navigation. Refresh or open in a new tab still gives you the full standalone page.
- This works for both your own recipes and community recipes (`/community/[id]` and `/recipes/[id]` both intercept).
- The shared “load recipe detail” reader makes sure the modal and the page show identical data.

### Recipe import

- When you paste a recipe URL, we now **scrape candidate hero images** from the source page and auto-attach the first viable one to the imported recipe. Cheap, fast, and avoids needing AI image generation in the common case.

### Behind the scenes

- New shared store (`top-layer-host`) that tracks which native `<dialog>` is open, so any popover/menu/toast portals into the dialog instead of behind it. This is the foundation that the popovers-above-modals rule (added a few days later) protects.

---

## 2026-04-18 — Always-shared community, the original/grams toggle, the ingredient backbone

A long Saturday. Several distinct features merged across the day.

### Community + Library (replacing Publish)

- **Removed the “Publish” button entirely.** Every recipe you create is automatically visible to everyone. There is no longer a published-vs-private distinction.
- **New `user_recipe_library` table.** When you save a community recipe, you’re saving a *pointer*, not a copy — your library always reflects the latest version of the original recipe.
- **New “Duplicate” action** for when you actually do want a private fork you can edit independently.
- **Soft-delete** with a tombstone view: if a community recipe gets deleted, your library entry shows a respectful tombstone instead of disappearing or 404’ing.
- One-time migration converted everyone’s old saved-from-community duplicates into the new library pointers.

### Recipe ingredient amounts: Original ↔ Grams toggle

- New display-only toggle on the recipe detail page: **Original** (whatever the recipe was authored with — “2 tsp,” “1 cup,” …) or **Grams**.
- Behind it is a new `density_g_per_ml` field on every ingredient. Mass units always convert; volume units fall back to the authored unit when we don’t have a density.
- Edit mode still shows the authored amount + unit so we never silently rewrite the recipe.

### Inventory: Categories view

- Two-mode toggle on `/inventory`: **List** (the existing dense rows) and **Categories** (a multi-column dense grid grouped by taxonomy subcategory like “Alliums,” “Whole Grains,” “Oils & Fats”).
- The categories view uses 128px columns, hover-reveal `−/+` steppers, and hides zero-quantity rows by default.

### The ingredient backbone

- New schema fields on every ingredient: `variant`, `taxonomy_subcategory`, `default_units`, `storage_hints`, `shelf_life_days`, `packaged_common`, `is_composite`, `backbone_id`. New ingredients now inherit sensible defaults from the curated **backbone catalog** instead of being blank.
- New **backbone catalog table** (~1500 curated ingredients with units, storage hints, shelf life, etc.) and a seed file in code.
- New **admin page** at `/admin/ingredient-autofill` — backfill missing fields on existing ingredients deterministically before falling back to LLM resolution.
- Variant rows can now share the same `backbone_id` (we dropped the unique constraint).

### Public reads

- The community now works for **logged-out** visitors too. Anonymous users can browse `/community` and read recipe details, ingredients, and instruction steps. Writes still require the recipe owner.
- Recipe ingredient writes were loosened to **recipe-ownership only**, so saving an imported recipe works against the shared ingredient catalog without RLS getting in the way.

### Recipe authoring polish

- Recipe schema authoring migration: structured ingredient sections, structured instruction steps, draft-review fields. Recipe import + draft review UI updated to match.
- Reusable “ingredient search” control extracted, now used in the ingredients editor and the inventory add flow.

### Other

- New **Component** meal type (alongside Breakfast / Lunch / Dinner / Snack / Dessert) — for recipes that are sub-recipes inside others.
- New **People FAB** for adding family members.
- The macro pie chart on a person’s page is now interactive: hover/tap a slice to see the corresponding macro target.
- New “debounced commit” hook unifies how we save in-progress edits across the app.

### Fixed

- Importing recipes from photos was occasionally failing with a “Maximum array nesting exceeded” error when the image was over ~750 KB. We now send raw image bytes (Blobs) to the server instead of base64 strings, which both fixes the error and is faster on the wire.

---

## 2026-04-16 — Import recipes from anywhere, generate covers, set timers

This is the day kitchenOS stopped being a manual recipe entry tool.

### Recipe import (URLs and photos)

- New “Import recipe” flow on `/recipes`. Paste a URL, upload up to a few photos of a recipe, or both.
- The pipeline fetches the URL’s text or extracts text from the photos, then runs an LLM that returns a structured recipe (title, headnote, description, yield, servings, ingredient sections, instruction steps).
- A **draft review screen** lets you accept the imported recipe, tweak any field, or discard.
- Drafts persist across navigation — clicking a tab in the middle of reviewing a draft doesn’t throw your work away.

### AI recipe images

- New “Generate image” pipeline for recipes without a cover photo:
 1. Decide art direction.
 2. Build a prompt.
 3. Search and curate reference images.
 4. Generate.
 5. QC the result.
 6. Upload to Supabase storage.
- Surfaces as a placeholder you can tap on any recipe without an image.

### Instruction steps + cooking timers

- Recipes now have **structured instruction steps** instead of a single text blob. Each step has a body, optional duration, optional headline.
- A **timer chip** can be attached to any step — when you tap it during cooking, a global watcher counts down and chimes when finished.
- Step-level edits, drag-to-reorder, and per-step actions menu.

### Inventory upgrades

- New **filter bar** at the top of `/inventory`.
- New **add-ingredient FAB** that searches the shared catalog and creates new ingredients with sensible defaults.
- New **quantity field** with `−/+` steppers and unit-aware editing.
- New **stock unit** and **grocery category** select controls — pick how you store this ingredient and which aisle to put it in on your shopping list.
- New **inventory detail sheet** that slides in when you tap a row, with full editing for everything that ingredient knows about.
- Per-row **nutrition cells** show macros for the quantity you have on hand.

### Shop / Community

- Real **shopping list** component on `/shop` (computed from your plan minus your inventory, grouped by aisle).
- Community recipe detail card got a polish pass.

### Notifications

- New **Toaster** (bottom-right, max 4, 10s default) for toast messages — used everywhere from “draft imported” to “timer finished.”

### Behind the scenes

- Storybook configured with a fixtures library and broad coverage across components.
- New **ingredient resolution** pipeline: `normalize` → `resolve from catalog` → `LLM fallback` → `apply plan` (a deterministic plan for which ingredient rows to create or update). This is the engine that lets a recipe import write into the shared catalog without making a mess.
- New **admin Supabase client** (service role) for storage uploads and image generation that bypass user RLS.
- New Cursor rule: **AP-style title case** for every ingredient name we create.

### Fixed

- A round of ESLint cleanup (`prefer-const`, intentional `setState-in-effect` callouts).

---

## 2026-04-14 — Community feed, smarter nutrition, plan board v2

### Community

- Brand-new `/community` page: a list of every recipe everyone has shared.
- Per-recipe community detail page at `/community/[id]`.

### Plan board, v2

- The week board got a complete redesign. New plan-week-board, new plan-meal-slot, new plan-week-client.
- New **servings control** on each planned meal — bump portions up or down per slot.
- Restored top-bar “go to today” gesture — tap the active **Plan** tab to scroll the board to today.

### Inventory

- New **categories view** for inventory: rows grouped by taxonomy subcategory (e.g. Alliums, Whole Grains).
- New **inventory table body** that handles the dense rows.

### Nutrition

- A real **nutrition pipeline** for ingredients:
 - USDA FoodData Central client (lookups, portion weight, unit basis).
 - Canadian Nutrient File client.
 - Normalization layer that converts whatever the source returns into our internal nutrition shape.
 - LLM-assisted ingredient match resolution when the deterministic match is ambiguous.
- This unlocks accurate calorie/macro displays on inventory rows and recipe cards.

### Recipes

- **Meal types** on every recipe: Breakfast, Lunch, Dinner, Snack, Dessert. (Brunch was considered and dropped; “snack” replaced an earlier label.)
- Recipe ingredients can be marked **optional**.

### Fixed

- A subtle RLS recursion in the ingredients policies (the policies were calling each other in a loop on insert).

### Behind the scenes

- New **drift check** script that compares the live Supabase schema against the migration files, so we notice when the two diverge.
- New Cursor rule for migrations: every schema change must include a runnable SQL block, not just a code change.
- We moved off `middleware.ts` to Next.js 16’s new `proxy.ts` entrypoint.
- Vitest configured for the project.

---

## 2026-03-30 — The Next.js app goes online, plus iOS

The day kitchenOS became a real web app you log into.

### A new modern web app

- Brand-new **Next.js 16 + React 19** app at `app/recipes-next/` with App Router and Server Actions.
- Live tabs:
 - `/inventory` — your pantry.
 - `/people` and `/people/[id]` — household members with calorie / macro targets.
 - `/plan` — week-based meal plan.
 - `/recipes` and `/recipes/[id]` — your recipe book, with editor.
 - `/shop` — a shopping list page.
- **Auth modal** with email + password sign-in and sign-up via Supabase Auth.
- **Config banner** that warns when Supabase env vars are missing (the app stays usable in degraded mode).
- The legacy static site at `app/recipes-ui/` got a major polish pass and is still live.

### Recipe authoring

- Real recipe editor with a structured ingredients editor, sections, and a searchable ingredient picker.
- Per-ingredient amount + unit + preparation fields.

### People & nutrition

- Each person has calorie + protein + carb + fat targets, with **range** support for each macro.
- New **macro pie** chart and per-macro **nutrient sliders** with sensible defaults and hard-coded healthy ranges.

### Inventory + meals

- Inventory items with quantity + unit + storage location.
- Meal plans, plan entries with planned servings, slot dismissals.

### iOS app

- A new read-only **iOS app** at `ios/` (KitchenOS), sharing the same Supabase backend. Shows the same recipes and ingredients lists from the web app, with email + Google sign-in.

### Schema

- The big foundational migration: **`supabase_migration_kitchenos_v2.sql`** (introduces ingredients, recipes, recipe_ingredients, sections, instruction steps, inventory, meal plans, people, the owner-id trigger, and RLS policies).
- A swarm of focused migrations: people calorie/protein bands, fat/carb targets, fat range, carb range, recipe ingredient sections, recipe ingredients amount/unit, inventory min/max, recipe image focus_y, recipe unit, ingredients upsert fix.
- One-time `supabase_claim_legacy_data_for_user.sql` script to assign all `owner_id IS NULL` rows from the pre-v2 era to a specific user.

### Behind the scenes

- **Vercel** deploys live for `recipes-next`, plus a GitHub Action that builds + deploys on every push.
- Supabase Edge Function `openai-kitchen` for AI-backed bits.
- Supabase config + storage setup committed.

---

## 2026-01-25 — Day zero: the seed catalog

The very first commit. kitchenOS started life as a **single-page static site** backed by Supabase, hand-built in HTML/CSS/JS, with the recipe library imported from a Notion table.

- A static site at `app/recipes-ui/`: one `index.html`, one `styles.css`, and a `app.js` (~1,500 lines) that talked directly to Supabase.
- A pile of Python scripts in `app/database/` to:
 - Import recipes from a public Notion view (`import_public_notion_table.py`, `merge_notion_public_data.py`).
 - Build the initial ingredient catalog from those recipes (`build_ingredients_from_recipes.py`).
 - Import everything into a local SQLite database (`recipes.db`).
 - Sync from SQLite up to Supabase (`sync_to_supabase.py`).
 - Update Supabase image URLs after generation (`update_supabase_images.py`).
- First versions of `schema.sql`, `supabase_setup.sql` (including RLS policies and Storage), and `supabase_storage_setup.sql`.
- Seed data: `recipes.json` (633 lines of imported recipes), `notion_recipes_images.json`, `notion_public_table.json`, `notion_table_view.json`.

This is the prehistoric layer of the codebase. Most of `app/recipes-ui/` is still around but is no longer the primary surface — the modern Next.js app at `app/recipes-next/` (which arrived on **2026-03-30**) is what users see today.

---

*This changelog is maintained alongside the [PRD](PRD.md). When adding a new dated entry, write what the user can now do, see, or notice — not what the code did. Internal-only changes belong in “Behind the scenes.”*
