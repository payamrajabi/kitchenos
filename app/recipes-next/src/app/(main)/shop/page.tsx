import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import type { ShoppingItemRow } from "@/types/database";

function shopGroup(value: string | null | undefined, fallback: string) {
  const v = (value ?? "").trim();
  return v || fallback;
}

export default async function ShopPage() {
  if (!isSupabaseConfigured()) {
    return (
      <section className="grid shop-view is-empty">
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
      <section className="grid shop-view is-empty">
        <div className="empty-state">
          <p className="empty-state-message">Sign in to see your shopping list.</p>
        </div>
      </section>
    );
  }

  const { data: items, error } = await supabase
    .from("shopping_items")
    .select("*")
    .order("store")
    .order("aisle")
    .order("name");

  if (error) {
    return (
      <section className="grid shop-view is-empty">
        <p>{error.message}</p>
      </section>
    );
  }

  const list = (items ?? []) as ShoppingItemRow[];

  if (!list.length) {
    return (
      <section className="grid shop-view is-empty">
        <div className="empty-state">
          <p className="empty-state-message">
            Your shopping list is empty. Add items from the classic UI for now.
          </p>
        </div>
      </section>
    );
  }

  const storeMap = new Map<string, Map<string, ShoppingItemRow[]>>();
  for (const item of list) {
    const store = shopGroup(item.store, "Unassigned store");
    const aisle = shopGroup(item.aisle, "Uncategorized aisle");
    if (!storeMap.has(store)) storeMap.set(store, new Map());
    const aisleMap = storeMap.get(store)!;
    if (!aisleMap.has(aisle)) aisleMap.set(aisle, []);
    aisleMap.get(aisle)!.push(item);
  }

  const sortedStores = [...storeMap.keys()].sort((a, b) => a.localeCompare(b));

  return (
    <section className="grid shop-view">
      <div className="shop-board">
        <div className="shop-board-header">
          <div>
            <h2>Shopping list</h2>
            <p>Grouped by store and aisle from your inventory preferences.</p>
          </div>
        </div>
        <div className="shop-board-columns">
          {sortedStores.map((store) => {
            const aisleMap = storeMap.get(store)!;
            const storeItems = [...aisleMap.values()].flat();
            const sortedAisles = [...aisleMap.keys()].sort((a, b) =>
              a.localeCompare(b),
            );
            return (
              <div key={store} className="shop-column">
                <div className="shop-column-header">
                  <h3 className="shop-column-title">{store}</h3>
                  <span className="shop-column-count">{storeItems.length}</span>
                </div>
                <div className="shop-aisles">
                  {sortedAisles.map((aisle) => {
                    const aisleItems = [...(aisleMap.get(aisle) ?? [])].sort((a, b) =>
                      (a.name || "").localeCompare(b.name || ""),
                    );
                    return (
                      <section key={aisle} className="shop-aisle">
                        <div className="shop-aisle-header">
                          <h4 className="shop-aisle-title">{aisle}</h4>
                          <span className="shop-aisle-count">{aisleItems.length}</span>
                        </div>
                        <div className="shop-cards">
                          {aisleItems.map((item) => {
                            const quantity = String(item.quantity ?? "").trim();
                            const unit = String(item.unit ?? "").trim();
                            const meta = [quantity, unit].filter(Boolean).join(" ");
                            const notes = (item.notes ?? "").trim();
                            return (
                              <article key={item.id} className="shop-card">
                                <div className="shop-card-title">
                                  {item.name || "Item"}
                                </div>
                                {meta ? (
                                  <div className="shop-card-meta">{meta}</div>
                                ) : null}
                                {notes ? (
                                  <div className="shop-card-notes">{notes}</div>
                                ) : null}
                              </article>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
