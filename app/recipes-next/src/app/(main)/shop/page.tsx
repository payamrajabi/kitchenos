import { isSupabaseConfigured } from "@/lib/env";
import { getShoppingListAction } from "@/app/actions/shop";
import { ShoppingList } from "@/components/shopping-list";

export default async function ShopPage() {
  if (!isSupabaseConfigured()) {
    return (
      <section className="grid shop-view is-empty">
        <p>Configure Supabase in <code>.env.local</code>.</p>
      </section>
    );
  }

  const result = await getShoppingListAction();

  if (!result.ok) {
    return (
      <section className="grid shop-view is-empty">
        <div className="empty-state">
          <p className="empty-state-message">{result.error}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="grid shop-view">
      <ShoppingList items={result.items} />
    </section>
  );
}
