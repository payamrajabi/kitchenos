import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { CommunitySaveActions } from "@/components/community-save-actions";
import { RecipeDetailEditor } from "@/components/recipe-detail-editor";
import { RecipeTombstone } from "@/components/recipe-tombstone";
import { loadCommunityRecipeDetail } from "@/lib/load-recipe-detail";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!isSupabaseConfigured()) return { title: "Community Recipe" };
  const supabase = await createClient();
  const { data } = await supabase
    .from("recipes")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  const row = data as { name: string } | null;
  if (!row?.name) return { title: "Community Recipe" };
  return { title: `${row.name} · Community` };
}

export default async function CommunityRecipeDetailPage({ params }: Props) {
  const { id } = await params;

  const outcome = await loadCommunityRecipeDetail(id);

  if (outcome.status === "unconfigured") {
    return (
      <section className="grid is-empty">
        <p>Configure Supabase in <code>.env.local</code>.</p>
      </section>
    );
  }
  if (outcome.status === "not-found") notFound();
  if (outcome.status === "redirect") redirect(outcome.to);
  if (outcome.status === "tombstone") {
    return <RecipeTombstone recipe={outcome.recipe} />;
  }
  if (outcome.status === "error") {
    return (
      <section className="grid is-empty">
        <p>{outcome.message}</p>
      </section>
    );
  }

  const {
    recipe,
    recipeIngredients,
    recipeIngredientSections,
    recipeInstructionSteps,
    availableIngredients,
    stockedIngredientIds,
    isSignedIn,
    inLibrary,
  } = outcome.data;

  return (
    <RecipeDetailEditor
      key={recipe.id}
      recipe={recipe}
      recipeIngredients={recipeIngredients}
      recipeIngredientSections={recipeIngredientSections}
      recipeInstructionSteps={recipeInstructionSteps}
      availableIngredients={availableIngredients}
      stockedIngredientIds={stockedIngredientIds}
      viewOnly
      asideActionSlot={
        <CommunitySaveActions
          recipeId={recipe.id}
          inLibrary={inLibrary}
          isSignedIn={isSignedIn}
        />
      }
    />
  );
}
