"use client";

import Link from "next/link";
import type { RecipeRow } from "@/types/database";
import { primaryImageUrl, recipeImageFocusYPercent } from "@/lib/recipes";
import { useTruncatedElement } from "@/lib/use-truncated-element";

export function RecipeCard({ recipe }: { recipe: RecipeRow }) {
  const { ref: titleRef, isTruncated } = useTruncatedElement<HTMLHeadingElement>(
    recipe.name,
  );
  const img = primaryImageUrl(recipe);
  const focusY = recipeImageFocusYPercent(recipe);
  return (
    <Link
      href={`/recipes/${recipe.id}`}
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
      </div>
      <div className="card-content">
        <h4 ref={titleRef} className="card-title">
          {recipe.name}
        </h4>
        {recipe.calories ? (
          <div className="card-meta">{`${recipe.calories} cal`}</div>
        ) : null}
      </div>
    </Link>
  );
}
