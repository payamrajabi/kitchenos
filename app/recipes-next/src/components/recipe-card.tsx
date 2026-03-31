import Link from "next/link";
import type { RecipeRow } from "@/types/database";
import { primaryImageUrl, recipeImageFocusYPercent } from "@/lib/recipes";

export function RecipeCard({ recipe }: { recipe: RecipeRow }) {
  const img = primaryImageUrl(recipe);
  const focusY = recipeImageFocusYPercent(recipe);
  return (
    <Link href={`/recipes/${recipe.id}`} className="card">
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
        <h4 className="card-title">{recipe.name}</h4>
        <div className="card-meta">
          {recipe.calories ? `${recipe.calories} cal` : ""}
          {recipe.servings ? ` ${recipe.servings} servings` : ""}
        </div>
      </div>
    </Link>
  );
}
