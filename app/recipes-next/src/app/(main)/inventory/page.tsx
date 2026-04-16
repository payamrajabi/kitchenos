import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import type { IngredientRow, InventoryItemRow } from "@/types/database";
import { ensureIngredientGroceryCategoriesInDb } from "@/lib/ensure-ingredient-grocery-categories";
import { sortIngredientsForInventoryDisplay } from "@/lib/inventory-display";
import { InventoryAddFab } from "@/components/inventory-add-fab";
import { InventoryView } from "@/components/inventory-view";
import { planDateKeyLocalAnchor } from "@/lib/dates";

export default async function InventoryPage() {
  if (!isSupabaseConfigured()) {
    return (
      <section className="grid inventory-page is-empty">
        <p>Configure Supabase in <code>.env.local</code>.</p>
      </section>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <section className="grid inventory-page is-empty">
        <div className="empty-state">
          <p className="empty-state-message">Sign in to view inventory data.</p>
        </div>
      </section>
    );
  }

  const today = planDateKeyLocalAnchor();

  const [
    { data: ingredients, error: ingErr },
    { data: inventory, error: invErr },
    { data: allRecipeIngredients },
    { data: planRows },
  ] = await Promise.all([
    supabase.from("ingredients").select("*").order("name"),
    supabase.from("inventory_items").select("*").order("storage_location"),
    supabase.from("recipe_ingredients").select("recipe_id, ingredient_id"),
    supabase
      .from("meal_plans")
      .select("meal_plan_entries(recipe_id, plan_date)"),
  ]);

  if (ingErr || invErr) {
    return (
      <section className="grid inventory-page ingredients-view is-empty">
        <p>{ingErr?.message || invErr?.message}</p>
      </section>
    );
  }

  const ingList = (ingredients ?? []) as IngredientRow[];
  const invList = (inventory ?? []) as InventoryItemRow[];
  const withGrocery = await ensureIngredientGroceryCategoriesInDb(supabase, ingList);
  const sortedIng = sortIngredientsForInventoryDisplay(withGrocery);

  const recipeIngredientRows = (allRecipeIngredients ?? []) as {
    recipe_id: number;
    ingredient_id: number;
  }[];

  const inRecipeIngredientIds = Array.from(
    new Set(recipeIngredientRows.map((r) => r.ingredient_id)),
  );

  const planEntries = ((planRows ?? []) as {
    meal_plan_entries: { recipe_id: number | null; plan_date: string }[] | null;
  }[]).flatMap((p) => p.meal_plan_entries ?? []);

  const plannedRecipeIds = new Set<number>();
  for (const entry of planEntries) {
    if (entry.recipe_id != null && entry.plan_date >= today) {
      plannedRecipeIds.add(entry.recipe_id);
    }
  }

  const inMealPlanIngredientIds = Array.from(
    new Set(
      recipeIngredientRows
        .filter((r) => plannedRecipeIds.has(r.recipe_id))
        .map((r) => r.ingredient_id),
    ),
  );

  if (!sortedIng.length) {
    return (
      <section className="grid inventory-page ingredients-view is-empty">
        <div className="empty-state">
          <p className="empty-state-message">
            No ingredients yet. Use the + button to add one, or add them in the classic
            UI.
          </p>
        </div>
        <InventoryAddFab />
      </section>
    );
  }

  return (
    <section className="grid inventory-page ingredients-view">
      <InventoryView
        ingredients={sortedIng}
        inventory={invList}
        inRecipeIngredientIds={inRecipeIngredientIds}
        inMealPlanIngredientIds={inMealPlanIngredientIds}
      />
      <InventoryAddFab />
    </section>
  );
}
