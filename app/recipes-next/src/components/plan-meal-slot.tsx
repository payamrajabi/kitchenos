"use client";

import { SearchableSelect, type SelectOption } from "@/components/searchable-select";
import { PlanEntryServingsControl } from "@/components/plan-entry-servings-control";
import { getPlanSlotTimeLabel, type PlanSlotKey } from "@/lib/meal-plan";
import {
  normalizeMealTypesFromDb,
  planSlotPreferredRecipeTags,
} from "@/lib/recipe-meal-types";
import {
  coerceNumericId,
  primaryImageUrl,
  recipeImageFocusYPercent,
} from "@/lib/recipes";
import type { MealPlanEntryRow, RecipeRow } from "@/types/database";
import Link from "next/link";
import { type KeyboardEvent as ReactKeyboardEvent } from "react";

type DayColumn = {
  date: string;
  label: string;
};

type RecipeOption = {
  id: number;
  name: string;
  meal_types?: string[] | null;
  image_url: string | null;
  image_urls?: unknown;
  image_focus_y: number | null;
};

type IngredientOption = {
  id: number;
  name: string;
};

function planEntryRecipeMatch(
  recipeById: Map<number, RecipeOption>,
  recipeByNameLower: Map<string, RecipeOption>,
  entry: MealPlanEntryRow,
  titleText: string,
): RecipeOption | undefined {
  const id = coerceNumericId(entry.recipe_id);
  if (id != null) {
    const fromId = recipeById.get(id);
    if (fromId) return fromId;
  }
  const t = titleText.trim().toLowerCase();
  return (
    recipeByNameLower.get(t) ??
    recipeByNameLower.get(t.replace(/\s*\(#\d+\)\s*$/i, "").trim())
  );
}

function planPickerOptionsForSlot(
  recipes: RecipeOption[],
  ingredients: IngredientOption[],
  slotKey: PlanSlotKey,
): SelectOption[] {
  const preferred = new Set(planSlotPreferredRecipeTags(slotKey));
  const recipeOpts: SelectOption[] = recipes.map((recipe) => {
    const tags = normalizeMealTypesFromDb(recipe.meal_types);
    const matches = tags.some((t) => preferred.has(t));
    return {
      value: `r:${recipe.id}`,
      label: recipe.name,
      tier: matches ? 0 : 1,
    };
  });
  const ingredientOpts: SelectOption[] = ingredients.map((ing) => ({
    value: `i:${ing.id}`,
    label: ing.name,
    tier: 2,
  }));
  return [...recipeOpts, ...ingredientOpts];
}

export type PlanMealSlotProps = {
  day: DayColumn;
  slotKey: PlanSlotKey;
  slotLabel: string;
  cellEntries: MealPlanEntryRow[];
  isOpen: boolean;
  recipeById: Map<number, RecipeOption>;
  recipeByNameLower: Map<string, RecipeOption>;
  recipes: RecipeOption[];
  ingredients: IngredientOption[];
  pending: boolean;
  cellClassName?: string;
  /** First column cell used to measure row height for the frozen meal-type rail. */
  isRowHeightSample?: boolean;
  onAssignOpenRef: (el: HTMLDivElement | null) => void;
  onOpen: () => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  commitPick: (value: string) => void;
};

export function PlanMealSlot({
  day,
  slotKey,
  slotLabel,
  cellEntries,
  isOpen,
  recipeById,
  recipeByNameLower,
  recipes,
  ingredients,
  pending,
  cellClassName = "",
  isRowHeightSample = false,
  onAssignOpenRef,
  onOpen,
  onKeyDown,
  commitPick,
}: PlanMealSlotProps) {
  const baseClass = `plan-board-cell${isOpen ? " is-open" : ""}${cellClassName ? ` ${cellClassName}` : ""}`;

  return (
    <div
      ref={isOpen ? onAssignOpenRef : undefined}
      className={baseClass}
      data-plan-row-sample={isRowHeightSample ? slotKey : undefined}
      role="button"
      tabIndex={0}
      aria-label={`Open ${slotLabel.toLowerCase()} at ${getPlanSlotTimeLabel(slotKey)} for ${day.label}`}
      onClick={onOpen}
      onKeyDown={onKeyDown}
    >
      {cellEntries.length ? (
        <div
          className={
            cellEntries.length > 1
              ? "plan-board-stack plan-board-stack--images-multi"
              : "plan-board-stack"
          }
        >
          {cellEntries.map((entry) => {
            const titleText = entry.label || "Recipe";
            const resolvedRecipe = planEntryRecipeMatch(
              recipeById,
              recipeByNameLower,
              entry,
              titleText,
            );
            const recipeForImage = resolvedRecipe as RecipeRow | undefined;
            const navigationRecipeId =
              resolvedRecipe != null
                ? coerceNumericId(resolvedRecipe.id)
                : coerceNumericId(entry.recipe_id);
            const imgUrl =
              recipeForImage != null ? primaryImageUrl(recipeForImage) : null;
            const focusY =
              recipeForImage != null ? recipeImageFocusYPercent(recipeForImage) : 50;

            const imageBody = (
              <div className="plan-board-card-thumb">
                {imgUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- plan thumbnails, arbitrary storage URLs
                  <img
                    src={imgUrl}
                    alt=""
                    className="plan-board-card-thumb-img"
                    style={{
                      objectPosition: `center ${focusY}%`,
                    }}
                  />
                ) : (
                  <span
                    className="plan-board-card-thumb-fallback"
                    aria-hidden="true"
                  >
                    {titleText.trim().slice(0, 3).toUpperCase()}
                  </span>
                )}
                <PlanEntryServingsControl
                  entryId={entry.id}
                  servingsProp={entry.servings}
                  pendingParent={pending}
                />
              </div>
            );

            return (
              <article
                key={entry.id}
                className={`plan-board-card plan-board-card--image${imgUrl ? "" : " plan-board-card--no-photo"}`}
                onClick={(event) => event.stopPropagation()}
              >
                {navigationRecipeId != null ? (
                  <Link
                    href={`/recipes/${navigationRecipeId}`}
                    className="plan-board-card-imagelink"
                    aria-label={titleText}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {imageBody}
                  </Link>
                ) : (
                  <div
                    className="plan-board-card-imagelink"
                    aria-label={titleText}
                  >
                    {imageBody}
                  </div>
                )}
                {!imgUrl || entry.notes ? (
                  <div className="plan-board-card-image-footer">
                    {!imgUrl ? (
                      <p className="plan-board-card-image-title">{titleText}</p>
                    ) : null}
                    {entry.notes ? (
                      <p className="plan-board-card-image-notes">{entry.notes}</p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}

      {isOpen ? (
        <div
          className="plan-board-composer"
          onClick={(event) => event.stopPropagation()}
        >
          {recipes.length || ingredients.length ? (
            <SearchableSelect
              key={`${day.date}-${slotKey}-picker`}
              defaultOpen
              options={planPickerOptionsForSlot(recipes, ingredients, slotKey)}
              value=""
              onChange={commitPick}
              disabled={pending}
              className="plan-board-select"
              aria-label="Search recipes and ingredients"
              placeholder="Search recipes and ingredients"
            />
          ) : (
            <p className="plan-board-composer-empty">
              Add recipes on the Recipes page and ingredients in Inventory, then come back
              here to plan your week.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
