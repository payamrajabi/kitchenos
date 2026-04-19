import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { DraftImportsProvider } from "@/components/draft-imports-provider";
import { RecipeAddFab } from "@/components/recipe-add-fab";
import { RecipesMealFilterSection } from "@/components/recipes-meal-filter-section";
import { loadLibraryRecipeIds } from "@/lib/recipe-visibility";
import type { RecipeRow } from "@/types/database";

export default async function RecipesPage() {
  if (!isSupabaseConfigured()) {
    return (
      <section className="grid recipes-page is-empty">
        <p>Configure Supabase in <code>.env.local</code> to load recipes.</p>
      </section>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <section className="grid recipes-page is-empty">
        <div className="empty-state">
          <p className="empty-state-message">
            Sign in to see your recipes.
          </p>
        </div>
      </section>
    );
  }

  const libraryIds = await loadLibraryRecipeIds(supabase, user.id);

  // Fetch every active recipe once; we split "yours" vs "all" on the client so
  // the Community toggle can flip between them without a round-trip.
  const { data: recipes, error } = await supabase
    .from("recipes")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <section className="grid recipes-page is-empty">
        <p>Could not load recipes: {error.message}</p>
      </section>
    );
  }

  const allRecipes = (recipes ?? []) as RecipeRow[];
  const libraryIdSet = new Set(libraryIds);
  const ownRecipes = allRecipes.filter(
    (r) => r.owner_id === user.id || libraryIdSet.has(r.id),
  );

  const hasAny = allRecipes.length > 0;

  return (
    <DraftImportsProvider>
      <section className={`grid recipes-page${hasAny ? "" : " grid-recipes-empty"}`}>
        <RecipesMealFilterSection
          ownRecipes={ownRecipes}
          allRecipes={allRecipes}
          libraryIds={libraryIds}
          userId={user.id}
        />
        {!ownRecipes.length && !hasAny ? (
          <p className="grid-recipes-hint">
            Your recipes show up here after you add one with the input at the bottom of the page.
            Open a card to edit title, ingredients, and steps right on the page — no
            separate edit mode.
          </p>
        ) : null}
        <RecipeAddFab />
      </section>
    </DraftImportsProvider>
  );
}
