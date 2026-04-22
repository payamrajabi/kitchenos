import { RecipeDetailDialog } from "@/components/recipe-detail-dialog";
import { RecipeDetailEditor } from "@/components/recipe-detail-editor";
import { loadOwnerRecipeDetail } from "@/lib/load-recipe-detail";
import { notFound, redirect } from "next/navigation";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

// Intercepted route: when a user clicks a recipe card from within the app
// (Plan, Recipes, etc.), Next renders this instead of the full standalone
// page, layering it on top of the underlying route via the `@modal` slot in
// the (main) layout. A hard reload or deep link bypasses the interceptor and
// serves the standalone /recipes/[id] page as usual.
export default async function RecipeDetailModalPage({
  params,
  searchParams,
}: Props) {
  const { id } = await params;

  // Recipe IDs are always positive integers. Defensive bail-out for any
  // non-numeric segment that ever gets routed here — the interceptor would
  // otherwise freeze the underlying page. Sibling non-numeric routes (e.g.
  // the draft review) deliberately live outside `/recipes/*` to avoid this.
  if (!/^\d+$/.test(id)) return null;

  const sp = (await searchParams) ?? {};
  const genParam = sp.gen;
  const autoGenerating =
    (Array.isArray(genParam) ? genParam[0] : genParam) === "1";

  const outcome = await loadOwnerRecipeDetail(id);

  if (outcome.status === "unconfigured") return null;
  if (outcome.status === "signed-out") redirect(`/community/${id}`);
  if (outcome.status === "not-found") notFound();
  if (outcome.status === "redirect") redirect(outcome.to);
  if (outcome.status === "error") {
    // Error while loading secondary data — fall back to the standalone page
    // rather than showing a broken overlay on top of the user's previous tab.
    redirect(`/recipes/${id}`);
  }

  const {
    recipe,
    recipeIngredients,
    recipeIngredientSections,
    recipeInstructionSteps,
    availableIngredients,
  } = outcome.data;

  return (
    <RecipeDetailDialog
      closeFallbackHref="/recipes"
      ariaLabel={recipe.name || "Recipe"}
    >
      <RecipeDetailEditor
        key={recipe.id}
        recipe={recipe}
        recipeIngredients={recipeIngredients}
        recipeIngredientSections={recipeIngredientSections}
        recipeInstructionSteps={recipeInstructionSteps}
        availableIngredients={availableIngredients}
        autoGenerating={autoGenerating}
      />
    </RecipeDetailDialog>
  );
}
