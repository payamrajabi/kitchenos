"use client";

import { X } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import {
  RECIPE_MEAL_TYPES,
  normalizeMealTypesFromDb,
  type RecipeMealType,
} from "@/lib/recipe-meal-types";
import type { RecipeRow } from "@/types/database";
import { RecipeCard } from "@/components/recipe-card";

function recipeMatchesSingleMeal(
  recipe: RecipeRow,
  meal: RecipeMealType | null,
): boolean {
  if (meal === null) return true;
  const tags = normalizeMealTypesFromDb(recipe.meal_types);
  return tags.includes(meal);
}

export function RecipesMealFilterSection({ recipes }: { recipes: RecipeRow[] }) {
  const [singleMeal, setSingleMeal] = useState<RecipeMealType | null>(null);

  const visible = useMemo(
    () => recipes.filter((r) => recipeMatchesSingleMeal(r, singleMeal)),
    [recipes, singleMeal],
  );

  if (!recipes.length) {
    return null;
  }

  const selectMeal = (meal: RecipeMealType) => {
    setSingleMeal(meal);
  };

  const clearToAll = () => {
    setSingleMeal(null);
  };

  return (
    <>
      <div className="recipes-meal-filter-strip">
        <div
          className="recipes-meal-filter-bar"
          role="group"
          aria-label="Filter recipes by meal type"
        >
          {singleMeal != null ? (
            <>
              <button
                type="button"
                className="recipes-meal-filter-clear"
                onClick={clearToAll}
                aria-label="Show all meal types"
              >
                <X size={16} weight="bold" aria-hidden />
              </button>
              <span
                className="secondary-tab-button active recipes-meal-filter-solo-label"
                role="status"
                aria-label={`Filtered by ${singleMeal}`}
              >
                {singleMeal}
              </span>
            </>
          ) : (
            RECIPE_MEAL_TYPES.map((key) => (
              <button
                key={key}
                type="button"
                className="secondary-tab-button active"
                aria-label={`Show only ${key} recipes`}
                onClick={() => selectMeal(key)}
              >
                {key}
              </button>
            ))
          )}
        </div>
      </div>
      {visible.map((recipe) => (
        <RecipeCard key={recipe.id} recipe={recipe} />
      ))}
      {!visible.length ? (
        <p
          className="inventory-filter-empty recipes-meal-filter-empty"
          role="status"
        >
          No recipes match your filters.
        </p>
      ) : null}
    </>
  );
}
