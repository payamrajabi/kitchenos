"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { addMealPlanEntryAction } from "@/app/actions/meal-plan";
import type { RecipeRow } from "@/types/database";
import { primaryImageUrl, recipeImageFocusYPercent } from "@/lib/recipes";
import { imageVariantUrl } from "@/lib/recipe-image-variants";
import type { PlanSlotKey } from "@/lib/meal-plan";
import { useTruncatedElement } from "@/lib/use-truncated-element";

/**
 * Optional "I came here to add a recipe to a plan slot" context. When present,
 * tapping the card commits the recipe to that slot via `addMealPlanEntryAction`
 * and routes back to /plan instead of opening the recipe.
 */
export type RecipeCardAddContext = {
  planDate: string;
  slotKey: PlanSlotKey;
  slotLabel: string;
};

export function RecipeCard({
  recipe,
  addContext,
}: {
  recipe: RecipeRow;
  addContext?: RecipeCardAddContext;
}) {
  const { ref: titleRef, isTruncated } = useTruncatedElement<HTMLHeadingElement>(
    recipe.name,
  );
  const img = imageVariantUrl(primaryImageUrl(recipe), "medium");
  const focusY = recipeImageFocusYPercent(recipe);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const cardBody = (
    <>
      <div
        className="card-image"
        style={
          img
            ? {
                backgroundImage: `url('${img}')`,
                backgroundSize: "cover",
                backgroundPosition: `center ${focusY}%`,
              }
            : undefined
        }
      >
        {img ? null : "Recipe"}
      </div>
      <div className="card-content">
        <h4 ref={titleRef} className="card-title">
          {recipe.name}
        </h4>
      </div>
    </>
  );

  if (addContext) {
    const handleClick = () => {
      if (pending) return;
      startTransition(async () => {
        const result = await addMealPlanEntryAction({
          planDate: addContext.planDate,
          slotKey: addContext.slotKey,
          recipeId: recipe.id,
        });
        if (!result.ok) {
          toast.error(result.error ?? "Could not add to plan.");
          return;
        }
        toast.success(`Added ${recipe.name} to ${addContext.slotLabel}.`);
        router.push("/plan");
        router.refresh();
      });
    };
    return (
      <button
        type="button"
        onClick={handleClick}
        className="card"
        title={
          isTruncated
            ? `${recipe.name} — add to ${addContext.slotLabel}`
            : `Add to ${addContext.slotLabel}`
        }
        disabled={pending}
        aria-label={`Add ${recipe.name} to ${addContext.slotLabel}`}
      >
        {cardBody}
      </button>
    );
  }

  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className="card"
      title={isTruncated ? recipe.name : undefined}
    >
      {cardBody}
    </Link>
  );
}
