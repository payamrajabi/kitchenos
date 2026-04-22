import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { RecipeDetailEditor } from "@/components/recipe-detail-editor";
import { recipeDescriptionPlainSnippet } from "@/lib/recipe-description-links";
import { loadOwnerRecipeDetail } from "@/lib/load-recipe-detail";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!isSupabaseConfigured()) {
    return { title: "Recipe" };
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("recipes")
    .select("name, description")
    .eq("id", id)
    .maybeSingle();
  const row = data as { name: string; description?: string | null } | null;
  if (!row?.name) return { title: "Recipe" };
  const descPlain = row.description?.trim()
    ? recipeDescriptionPlainSnippet(row.description)
    : "";
  const metaDesc = descPlain || `Recipe: ${row.name}`;
  return {
    title: row.name,
    description:
      metaDesc.length > 160 ? `${metaDesc.slice(0, 157)}…` : metaDesc,
  };
}

export default async function RecipeDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const genParam = sp.gen;
  const autoGenerating =
    (Array.isArray(genParam) ? genParam[0] : genParam) === "1";

  const outcome = await loadOwnerRecipeDetail(id);

  if (outcome.status === "unconfigured") {
    return (
      <section className="grid is-empty">
        <p>Configure Supabase in <code>.env.local</code>.</p>
      </section>
    );
  }
  if (outcome.status === "signed-out") {
    // Signed-out visitors get the public read-only view. Signing in on that
    // page brings owners right back to this editor via the isOwn branch.
    redirect(`/community/${id}`);
  }
  if (outcome.status === "not-found") notFound();
  if (outcome.status === "redirect") redirect(outcome.to);
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
      autoGenerating={autoGenerating}
    />
  );
}
