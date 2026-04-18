import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { CommunityRecipeCard } from "@/components/community-recipe-card";
import { loadLibraryRecipeIds } from "@/lib/recipe-visibility";
import type { RecipeRow } from "@/types/database";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Community",
  description: "Discover recipes shared by other KitchenOS users.",
};

export default async function CommunityPage() {
  if (!isSupabaseConfigured()) {
    return (
      <section className="grid is-empty">
        <p>Configure Supabase in <code>.env.local</code> to browse community recipes.</p>
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
            Sign in to browse community recipes.
          </p>
        </div>
      </section>
    );
  }

  const [recipesResult, libraryIds] = await Promise.all([
    supabase
      .from("recipes")
      .select("*, owner_id")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false }),
    loadLibraryRecipeIds(supabase, user.id),
  ]);

  if (recipesResult.error) {
    return (
      <section className="grid is-empty">
        <p>Could not load community recipes: {recipesResult.error.message}</p>
      </section>
    );
  }

  const list = (recipesResult.data ?? []) as RecipeRow[];
  const libraryIdSet = new Set(libraryIds);

  return (
    <section className={`grid${list.length ? "" : " is-empty"}`}>
      {list.length ? (
        list.map((recipe) => (
          <CommunityRecipeCard
            key={recipe.id}
            recipe={recipe}
            isOwn={recipe.owner_id === user.id}
            inLibrary={libraryIdSet.has(recipe.id)}
          />
        ))
      ) : (
        <div className="empty-state">
          <p className="empty-state-message">
            No recipes in the community yet — add one and it shows up here automatically.
          </p>
        </div>
      )}
    </section>
  );
}
