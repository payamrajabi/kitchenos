import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { RecipeAddCard } from "@/components/recipe-add-card";
import { RecipeCard } from "@/components/recipe-card";
import type { RecipeRow } from "@/types/database";

export default async function RecipesPage() {
  if (!isSupabaseConfigured()) {
    return (
      <section className="grid is-empty">
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
      <section className="grid is-empty">
        <div className="empty-state">
          <p className="empty-state-message">
            Sign in to see your recipes.
          </p>
        </div>
      </section>
    );
  }

  const { data: recipes, error } = await supabase
    .from("recipes")
    .select("*")
    .order("name");

  if (error) {
    return (
      <section className="grid is-empty">
        <p>Could not load recipes: {error.message}</p>
      </section>
    );
  }

  const list = (recipes ?? []) as RecipeRow[];

  return (
    <section className={`grid${list.length ? "" : " grid-recipes-empty"}`}>
      <RecipeAddCard />
      {list.map((recipe) => (
        <RecipeCard key={recipe.id} recipe={recipe} />
      ))}
      {!list.length ? (
        <p className="grid-recipes-hint">
          Your recipes show up here after you add one. Open a card to edit title,
          ingredients, and steps right on the page — no separate edit mode.
        </p>
      ) : null}
    </section>
  );
}
