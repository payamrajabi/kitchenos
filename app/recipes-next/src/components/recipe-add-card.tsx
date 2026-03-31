import { createRecipeAndRedirectAction } from "@/app/actions/recipes";

export function RecipeAddCard() {
  return (
    <form action={createRecipeAndRedirectAction} className="recipe-add-form">
      <button type="submit" className="card recipe-add-card" aria-label="Add new recipe">
        <span className="recipe-add-plus" aria-hidden>
          +
        </span>
      </button>
    </form>
  );
}
