import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import type { IngredientRow, InventoryItemRow } from "@/types/database";
import { ensureIngredientGroceryCategoriesInDb } from "@/lib/ensure-ingredient-grocery-categories";
import { sortIngredientsForInventoryDisplay } from "@/lib/inventory-display";
import { InventoryAddFab } from "@/components/inventory-add-fab";
import { InventoryView } from "@/components/inventory-view";
import { ReceiptImportFab } from "@/components/receipt-import-fab";

export const dynamic = "force-dynamic";

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

  const [
    { data: ingredients, error: ingErr },
    { data: inventory, error: invErr },
  ] = await Promise.all([
    supabase.from("ingredients").select("*").order("name"),
    supabase.from("inventory_items").select("*").order("storage_location"),
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

  const receiptFabIngredients = sortedIng.map((i) => ({
    id: i.id,
    name: i.name,
  }));

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
        <ReceiptImportFab ingredients={receiptFabIngredients} />
      </section>
    );
  }

  return (
    <section className="grid inventory-page ingredients-view">
      <InventoryView ingredients={sortedIng} inventory={invList} />
      <InventoryAddFab />
      <ReceiptImportFab ingredients={receiptFabIngredients} />
    </section>
  );
}
