import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
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

  // Counts powering the table view's Ingredients / Instructions columns.
  // We only need one integer per recipe, so we fetch the keys and count in JS
  // to avoid paying for a full join or per-row aggregate SQL.
  const recipeIds = allRecipes.map((r) => r.id);
  const ingredientCounts: Record<number, number> = {};
  const instructionCounts: Record<number, number> = {};
  if (recipeIds.length > 0) {
    const [ingRes, insRes] = await Promise.all([
      supabase
        .from("recipe_ingredients")
        .select("recipe_id")
        .in("recipe_id", recipeIds),
      supabase
        .from("recipe_instruction_steps")
        .select("recipe_id")
        .in("recipe_id", recipeIds),
    ]);
    for (const row of (ingRes.data ?? []) as { recipe_id: number }[]) {
      ingredientCounts[row.recipe_id] =
        (ingredientCounts[row.recipe_id] ?? 0) + 1;
    }
    for (const row of (insRes.data ?? []) as { recipe_id: number }[]) {
      instructionCounts[row.recipe_id] =
        (instructionCounts[row.recipe_id] ?? 0) + 1;
    }
  }

  const hasAny = allRecipes.length > 0;

  return (
    <section className={`grid recipes-page${hasAny ? "" : " grid-recipes-empty"}`}>
      <RecipesMealFilterSection
        ownRecipes={ownRecipes}
        allRecipes={allRecipes}
        libraryIds={libraryIds}
        userId={user.id}
        ingredientCounts={ingredientCounts}
        instructionCounts={instructionCounts}
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
  );
}
