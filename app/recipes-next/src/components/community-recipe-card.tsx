"use client";

import Link from "next/link";
import { Heart } from "@phosphor-icons/react";
import { useState, useTransition, type MouseEvent } from "react";
import {
  addRecipeToLibraryAction,
  removeRecipeFromLibraryAction,
} from "@/app/actions/recipes";
import type { RecipeRow } from "@/types/database";
import { primaryImageUrl, recipeImageFocusYPercent } from "@/lib/recipes";
import { useTruncatedElement } from "@/lib/use-truncated-element";

export function CommunityRecipeCard({
  recipe,
  isOwn,
  inLibrary: inLibraryInitial,
}: {
  recipe: RecipeRow;
  isOwn: boolean;
  inLibrary?: boolean;
}) {
  const { ref: titleRef, isTruncated } = useTruncatedElement<HTMLHeadingElement>(
    recipe.name,
  );
  const img = primaryImageUrl(recipe);
  const focusY = recipeImageFocusYPercent(recipe);

  const [inLibrary, setInLibrary] = useState(!!inLibraryInitial);
  const [isPending, startTransition] = useTransition();

  const toggleLibrary = (e: MouseEvent<HTMLButtonElement>) => {
    // The whole card is a link — keep the click from navigating / selecting.
    e.preventDefault();
    e.stopPropagation();
    if (isPending) return;
    const next = !inLibrary;
    setInLibrary(next); // optimistic
    startTransition(async () => {
      const result = next
        ? await addRecipeToLibraryAction(recipe.id)
        : await removeRecipeFromLibraryAction(recipe.id);
      if (result && "error" in result && result.error) {
        setInLibrary(!next); // revert on failure
      }
    });
  };

  return (
    <Link
      href={isOwn ? `/recipes/${recipe.id}` : `/community/${recipe.id}`}
      className="card"
      title={isTruncated ? recipe.name : undefined}
    >
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
        {!isOwn ? (
          <button
            type="button"
            className={`community-card-heart${inLibrary ? " is-saved" : ""}`}
            aria-pressed={inLibrary}
            aria-label={
              inLibrary ? "Remove from your library" : "Save to your library"
            }
            onClick={toggleLibrary}
            disabled={isPending}
          >
            <Heart
              size={22}
              weight={inLibrary ? "fill" : "regular"}
              aria-hidden
            />
          </button>
        ) : null}
      </div>
      <div className="card-content">
        <h4 ref={titleRef} className="card-title">
          {recipe.name}
        </h4>
      </div>
    </Link>
  );
}
