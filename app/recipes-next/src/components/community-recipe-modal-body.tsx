"use client";

import { useState, useTransition } from "react";
import { removeRecipeFromLibraryAction } from "@/app/actions/recipes";
import { CommunitySaveActions } from "@/components/community-save-actions";
import { RecipeDetailEditor } from "@/components/recipe-detail-editor";
import type { RecipeDetailOverlayMenuItem } from "@/components/recipe-detail-overlay-chrome";
import type {
  RecipeDetailAvailableIngredient,
} from "@/lib/load-recipe-detail";
import type {
  RecipeIngredientRow,
  RecipeIngredientSectionRow,
  RecipeInstructionStepRow,
  RecipeRow,
} from "@/types/database";

type Props = {
  recipe: RecipeRow;
  recipeIngredients: RecipeIngredientRow[];
  recipeIngredientSections: RecipeIngredientSectionRow[];
  recipeInstructionSteps: RecipeInstructionStepRow[];
  availableIngredients: RecipeDetailAvailableIngredient[];
  recipeId: number;
  initialInLibrary: boolean;
  isSignedIn: boolean;
};

/**
 * Client wrapper used by the community recipe modal. Holds shared
 * `inLibrary` state so two entry points stay consistent:
 *
 *  - The inline "Saved" / "Save Recipe" button (via CommunitySaveActions).
 *  - A "Remove from my recipes" entry in the kebab overflow menu, surfaced
 *    only when the recipe is currently in the user's library.
 *
 * The standalone /community/[id] page still uses CommunitySaveActions
 * uncontrolled; this wrapper opts into the optional onInLibraryChange
 * callback so both entry points can drive + reflect the same state.
 */
export function CommunityRecipeModalBody({
  recipe,
  recipeIngredients,
  recipeIngredientSections,
  recipeInstructionSteps,
  availableIngredients,
  recipeId,
  initialInLibrary,
  isSignedIn,
}: Props) {
  const [inLibrary, setInLibrary] = useState(initialInLibrary);
  const [isRemoving, startRemove] = useTransition();

  const removeFromLibrary = () => {
    if (!isSignedIn || !inLibrary || isRemoving) return;
    startRemove(async () => {
      const result = await removeRecipeFromLibraryAction(recipeId);
      if (result && "error" in result && result.error) {
        // Keep state as-is if the server said no; CommunitySaveActions
        // surfaces errors in its own flow when the user uses that button.
        return;
      }
      setInLibrary(false);
    });
  };

  const overlayExtraMenuItems: RecipeDetailOverlayMenuItem[] =
    isSignedIn && inLibrary
      ? [
          {
            key: "remove-from-library",
            label: isRemoving ? "Removing…" : "Remove from my recipes",
            onSelect: removeFromLibrary,
            destructive: true,
            disabled: isRemoving,
          },
        ]
      : [];

  return (
    <RecipeDetailEditor
      key={recipe.id}
      recipe={recipe}
      recipeIngredients={recipeIngredients}
      recipeIngredientSections={recipeIngredientSections}
      recipeInstructionSteps={recipeInstructionSteps}
      availableIngredients={availableIngredients}
      viewOnly
      overlayExtraMenuItems={overlayExtraMenuItems}
      asideActionSlot={
        <CommunitySaveActions
          recipeId={recipeId}
          inLibrary={inLibrary}
          isSignedIn={isSignedIn}
          onInLibraryChange={setInLibrary}
        />
      }
    />
  );
}
