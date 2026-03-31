import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import type { IngredientRow, InventoryItemRow } from "@/types/database";
import { getInventoryRowForIngredient, getInventoryStockValuesUnified, sortIngredientsForInventoryDisplay } from "@/lib/inventory-display";
import { IngredientDeleteButton } from "@/components/ingredient-delete-button";
import { RecipeUnitSelect } from "@/components/recipe-unit-select";
import { EditableIngredientName } from "@/components/editable-ingredient-name";
import { InventoryQtyField } from "@/components/inventory-qty-field";
import { InventoryStockUnitSelect } from "@/components/inventory-stock-unit-select";

export default async function InventoryPage() {
  if (!isSupabaseConfigured()) {
    return (
      <section className="grid is-empty">
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
      <section className="grid is-empty">
        <div className="empty-state">
          <p className="empty-state-message">Sign in to view inventory data.</p>
        </div>
      </section>
    );
  }

  const [{ data: ingredients, error: ingErr }, { data: inventory, error: invErr }] =
    await Promise.all([
      supabase.from("ingredients").select("*").order("name"),
      supabase.from("inventory_items").select("*").order("storage_location"),
    ]);

  if (ingErr || invErr) {
    return (
      <section className="grid ingredients-view is-empty">
        <p>{ingErr?.message || invErr?.message}</p>
      </section>
    );
  }

  const ingList = (ingredients ?? []) as IngredientRow[];
  const invList = (inventory ?? []) as InventoryItemRow[];
  const sortedIng = sortIngredientsForInventoryDisplay(ingList);

  if (!sortedIng.length) {
    return (
      <section className="grid ingredients-view is-empty">
        <div className="empty-state">
          <p className="empty-state-message">
            No ingredients found. Add ingredients in the classic UI to get started.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="grid ingredients-view">
      <div className="table-container inventory-table">
        <table className="ingredients-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Current</th>
              <th>Stock Unit</th>
              <th>Min</th>
              <th>Max</th>
              <th>Recipe Unit</th>
              <th className="row-delete-th">
                <span className="visually-hidden">Delete ingredient</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedIng.map((ingredient) => {
              const invRow = getInventoryRowForIngredient(invList, ingredient.id);
              const stock = getInventoryStockValuesUnified(ingredient, invRow);
              return (
                <tr key={ingredient.id}>
                    <td className="inventory-ingredient-name">
                      <EditableIngredientName
                        ingredientId={ingredient.id}
                        initialName={ingredient.name || ""}
                      />
                    </td>
                    <td className="inventory-qty-cell">
                      <InventoryQtyField
                        ingredientId={ingredient.id}
                        inventoryId={stock.inventoryId}
                        field="quantity"
                        initialValue={stock.quantity}
                        ariaLabel="Current quantity"
                      />
                    </td>
                    <td className="inventory-unit-cell">
                      <InventoryStockUnitSelect
                        ingredientId={ingredient.id}
                        inventoryId={stock.inventoryId}
                        value={stock.unit}
                      />
                    </td>
                    <td className="inventory-qty-cell">
                      <InventoryQtyField
                        ingredientId={ingredient.id}
                        inventoryId={stock.inventoryId}
                        field="min_quantity"
                        initialValue={stock.min}
                        maxBound={stock.max}
                        ariaLabel="Minimum quantity"
                      />
                    </td>
                    <td className="inventory-qty-cell">
                      <InventoryQtyField
                        ingredientId={ingredient.id}
                        inventoryId={stock.inventoryId}
                        field="max_quantity"
                        initialValue={stock.max}
                        minBound={stock.min}
                        ariaLabel="Maximum quantity"
                      />
                    </td>
                    <td className="inventory-unit-cell">
                      <RecipeUnitSelect
                        ingredientId={ingredient.id}
                        inventoryId={stock.inventoryId}
                        stockUnit={stock.unit}
                        savedRecipeUnit={stock.recipeUnit}
                      />
                    </td>
                    <td className="row-delete-cell">
                      <IngredientDeleteButton
                        ingredientId={ingredient.id}
                        ingredientName={ingredient.name}
                      />
                    </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
