import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { DraftImportsProvider } from "@/components/draft-imports-provider";
import { DraftRecipeCards } from "@/components/draft-recipe-cards";
import { RecipeAddFab } from "@/components/recipe-add-fab";
import { RecipesMealFilterSection } from "@/components/recipes-meal-filter-section";
import {
  loadLibraryRecipeIds,
  ownedOrLibraryOrClause,
} from "@/lib/recipe-visibility";
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
  const orClause = ownedOrLibraryOrClause(user.id, libraryIds);

  const { data: recipes, error } = await supabase
    .from("recipes")
    .select("*")
    .or(orClause)
    .is("deleted_at", null)
    .order("name");

  if (error) {
    return (
      <section className="grid recipes-page is-empty">
        <p>Could not load recipes: {error.message}</p>
      </section>
    );
  }

  const list = (recipes ?? []) as RecipeRow[];

  return (
    <DraftImportsProvider>
      <section className={`grid recipes-page${list.length ? "" : " grid-recipes-empty"}`}>
        <DraftRecipeCards />
        <RecipesMealFilterSection recipes={list} />
        {!list.length ? (
          <p className="grid-recipes-hint">
            Your recipes show up here after you add one with the + button in the corner.
            Open a card to edit title, ingredients, and steps right on the page — no
            separate edit mode.
          </p>
        ) : null}
        <RecipeAddFab />
      </section>
    </DraftImportsProvider>
  );
}
