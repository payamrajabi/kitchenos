import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { CommunityRecipeCard } from "@/components/community-recipe-card";
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

  const { data: recipes, error } = await supabase
    .from("recipes")
    .select("*, owner_id")
    .eq("is_published_to_community", true)
    .order("published_at", { ascending: false });

  if (error) {
    return (
      <section className="grid is-empty">
        <p>Could not load community recipes: {error.message}</p>
      </section>
    );
  }

  const list = (recipes ?? []) as RecipeRow[];

  return (
    <section className={`grid${list.length ? "" : " is-empty"}`}>
      {list.length ? (
        list.map((recipe) => (
          <CommunityRecipeCard
            key={recipe.id}
            recipe={recipe}
            isOwn={recipe.owner_id === user.id}
          />
        ))
      ) : (
        <div className="empty-state">
          <p className="empty-state-message">
            No community recipes yet. Be the first to publish one of yours!
          </p>
        </div>
      )}
    </section>
  );
}
