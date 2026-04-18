"use client";

import { removeRecipeFromLibraryAction } from "@/app/actions/recipes";
import type { RecipeRow } from "@/types/database";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function RecipeTombstone({ recipe }: { recipe: RecipeRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleRemove = () => {
    setError(null);
    startTransition(async () => {
      const r = await removeRecipeFromLibraryAction(recipe.id);
      if (r && "error" in r && r.error) {
        setError(r.error);
        return;
      }
      router.push("/recipes");
    });
  };

  return (
    <article className="community-detail">
      <div className="community-detail-layout">
        <div className="community-detail-main">
          <h1 className="community-detail-title">Removed by author</h1>
          <p className="community-detail-description">
            {recipe.name
              ? `“${recipe.name}” was removed by its author.`
              : "This recipe was removed by its author."}{" "}
            It&rsquo;s no longer available to view. You can take it out of your
            library to tidy things up.
          </p>

          <div className="community-detail-actions">
            <button
              type="button"
              className="primary community-save-btn"
              onClick={handleRemove}
              disabled={isPending}
            >
              {isPending ? "Removing…" : "Remove from library"}
            </button>
            {error ? <p className="community-detail-error">{error}</p> : null}
          </div>
        </div>
      </div>
    </article>
  );
}
