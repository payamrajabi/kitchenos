import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { IngredientBackboneBackfillPanel } from "@/components/ingredient-backbone-backfill-panel";
import { IngredientBackboneCataloguePanel } from "@/components/ingredient-backbone-catalogue-panel";

export default async function IngredientAutofillAdminPage() {
  if (!isSupabaseConfigured()) {
    return (
      <section className="grid is-empty">
        <p>
          Configure Supabase in <code>.env.local</code>.
        </p>
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
          <p className="empty-state-message">
            Sign in to access the ingredient autofill tools.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section style={{ display: "grid", gap: "2rem", padding: "1rem 0" }}>
      <IngredientBackboneCataloguePanel />
      <IngredientBackboneBackfillPanel />
    </section>
  );
}
