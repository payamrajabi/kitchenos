"use client";

import { X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  RECIPE_MEAL_TYPES,
  normalizeMealTypesFromDb,
  type RecipeMealType,
} from "@/lib/recipe-meal-types";
import type { RecipeRow } from "@/types/database";
import { RecipeCard } from "@/components/recipe-card";
import { CommunityRecipeCard } from "@/components/community-recipe-card";
import { DraftRecipeCards } from "@/components/draft-recipe-cards";

function recipeMatchesSingleMeal(
  recipe: RecipeRow,
  meal: RecipeMealType | null,
): boolean {
  if (meal === null) return true;
  const tags = normalizeMealTypesFromDb(recipe.meal_types);
  return tags.includes(meal);
}

type Props = {
  ownRecipes: RecipeRow[];
  allRecipes: RecipeRow[];
  libraryIds: number[];
  userId: string | null;
};

export function RecipesMealFilterSection({
  ownRecipes,
  allRecipes,
  libraryIds,
  userId,
}: Props) {
  const [singleMeal, setSingleMeal] = useState<RecipeMealType | null>(null);
  const [communityOn, setCommunityOn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef<HTMLDivElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);

  const libraryIdSet = useMemo(() => new Set(libraryIds), [libraryIds]);

  const source = communityOn ? allRecipes : ownRecipes;

  const visible = useMemo(
    () => source.filter((r) => recipeMatchesSingleMeal(r, singleMeal)),
    [source, singleMeal],
  );

  // Close the narrow-viewport popover on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (menuWrapRef.current && menuWrapRef.current.contains(t)) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        menuTriggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  if (!ownRecipes.length && !allRecipes.length) {
    return null;
  }

  const selectMeal = (meal: RecipeMealType) => {
    setSingleMeal(meal);
    setMenuOpen(false);
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
          aria-label="Filter recipes"
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
            <>
              {RECIPE_MEAL_TYPES.map((key) => (
                <button
                  key={key}
                  type="button"
                  className="secondary-tab-button active recipes-meal-filter-pills-only"
                  aria-label={`Show only ${key} recipes`}
                  onClick={() => selectMeal(key)}
                >
                  {key}
                </button>
              ))}
              <div
                ref={menuWrapRef}
                className="recipes-meal-filter-menu-wrap"
              >
                <button
                  ref={menuTriggerRef}
                  type="button"
                  className="secondary-tab-button active recipes-meal-filter-menu-trigger"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((o) => !o)}
                >
                  All Meal Types
                </button>
                {menuOpen ? (
                  <div
                    className="recipes-meal-filter-menu"
                    role="menu"
                    aria-label="Filter by meal type"
                  >
                    {RECIPE_MEAL_TYPES.map((key) => (
                      <button
                        key={key}
                        type="button"
                        role="menuitem"
                        className="recipes-meal-filter-menu-item"
                        onClick={() => selectMeal(key)}
                      >
                        {key}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          )}
          <button
            type="button"
            className={`secondary-tab-button recipes-meal-filter-community${
              communityOn ? " is-on" : " active"
            }`}
            aria-pressed={communityOn}
            aria-label={
              communityOn
                ? "Hide community recipes and show only yours"
                : "Show recipes from everyone"
            }
            onClick={() => setCommunityOn((o) => !o)}
          >
            Community
          </button>
        </div>
      </div>
      <DraftRecipeCards />
      {visible.map((recipe) =>
        communityOn ? (
          <CommunityRecipeCard
            key={recipe.id}
            recipe={recipe}
            isOwn={!!userId && recipe.owner_id === userId}
            inLibrary={libraryIdSet.has(recipe.id)}
          />
        ) : (
          <RecipeCard key={recipe.id} recipe={recipe} />
        ),
      )}
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
