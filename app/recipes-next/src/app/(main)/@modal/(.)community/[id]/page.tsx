import { CommunityRecipeModalBody } from "@/components/community-recipe-modal-body";
import { RecipeDetailDialog } from "@/components/recipe-detail-dialog";
import { RecipeTombstone } from "@/components/recipe-tombstone";
import { loadCommunityRecipeDetail } from "@/lib/load-recipe-detail";
import { notFound, redirect } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

// Intercepted community viewer — mirrors the owner intercepted route so both
// "my recipes" and "community recipes" open as a modal from within the app.
// Hard reloads still land on the standalone /community/[id] page.
export default async function CommunityRecipeDetailModalPage({ params }: Props) {
  const { id } = await params;

  // Recipe IDs are always positive integers. A non-numeric segment means the
  // client navigated to a sibling static route (e.g. a future /community/new)
  // and Next is just trying to fill the dynamic slot — render nothing instead
  // of bailing the whole page to a 404.
  if (!/^\d+$/.test(id)) return null;

  const outcome = await loadCommunityRecipeDetail(id);

  if (outcome.status === "unconfigured") return null;
  if (outcome.status === "not-found") notFound();
  if (outcome.status === "redirect") redirect(outcome.to);
  if (outcome.status === "tombstone") {
    // Render the tombstone inside the dialog so a deleted recipe still
    // dismisses cleanly back to whatever tab the user came from.
    return (
      <RecipeDetailDialog
        closeFallbackHref="/community"
        ariaLabel={outcome.recipe.name || "Recipe"}
      >
        <RecipeTombstone recipe={outcome.recipe} />
      </RecipeDetailDialog>
    );
  }
  if (outcome.status === "error") {
    redirect(`/community/${id}`);
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
    <RecipeDetailDialog
      closeFallbackHref="/community"
      ariaLabel={recipe.name || "Recipe"}
    >
      <CommunityRecipeModalBody
        recipe={recipe}
        recipeIngredients={recipeIngredients}
        recipeIngredientSections={recipeIngredientSections}
        recipeInstructionSteps={recipeInstructionSteps}
        availableIngredients={availableIngredients}
        stockedIngredientIds={stockedIngredientIds}
        recipeId={recipe.id}
        initialInLibrary={inLibrary}
        isSignedIn={isSignedIn}
      />
    </RecipeDetailDialog>
  );
}
