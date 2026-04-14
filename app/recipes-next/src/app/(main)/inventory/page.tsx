import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import type { IngredientRow, InventoryItemRow } from "@/types/database";
import { sortIngredientsForInventoryDisplay } from "@/lib/inventory-display";
import { InventoryTableBody } from "@/components/inventory-table-body";

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
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <InventoryTableBody
            ingredients={sortedIng}
            inventory={invList}
          />
        </table>
      </div>
    </section>
  );
}
