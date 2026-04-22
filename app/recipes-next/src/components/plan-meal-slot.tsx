"use client";

import { SearchableSelect, type SelectOption } from "@/components/searchable-select";
import { PlanEntryServingsControl } from "@/components/plan-entry-servings-control";
import { PlanSuggestionCycleControl } from "@/components/plan-suggestion-cycle-control";
import { PlanSuggestionDismissButton } from "@/components/plan-suggestion-dismiss-button";
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
import {
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

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
  draggingId?: number | null;
  onDragStartCard?: (entryId: number) => void;
  onDragEndCard?: () => void;
  onDropOnCell?: () => void;
  onDropOnCard?: (entryId: number) => void;
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
  draggingId = null,
  onDragStartCard,
  onDragEndCard,
  onDropOnCell,
  onDropOnCard,
}: PlanMealSlotProps) {
  const [cellDropActive, setCellDropActive] = useState(false);
  const [cardDropTargetId, setCardDropTargetId] = useState<number | null>(null);

  const dragEnabled =
    typeof onDragStartCard === "function" && typeof onDropOnCell === "function";
  const isDragging = draggingId != null;

  const baseClass = [
    "plan-board-cell",
    isOpen ? "is-open" : "",
    cellClassName,
    cellDropActive ? "is-drop-target" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleCellDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!isDragging || !dragEnabled) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (!cellDropActive) setCellDropActive(true);
  };

  const handleCellDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setCellDropActive(false);
    setCardDropTargetId(null);
  };

  const handleCellDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!isDragging || !dragEnabled) return;
    event.preventDefault();
    setCellDropActive(false);
    setCardDropTargetId(null);
    onDropOnCell?.();
  };

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
      onDragOver={dragEnabled ? handleCellDragOver : undefined}
      onDragLeave={dragEnabled ? handleCellDragLeave : undefined}
      onDrop={dragEnabled ? handleCellDrop : undefined}
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

            const isSuggestion = entry.is_suggestion === true;

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
                    draggable={false}
                  />
                ) : (
                  <span
                    className="plan-board-card-thumb-fallback"
                    aria-hidden="true"
                  >
                    {titleText.trim().slice(0, 3).toUpperCase()}
                  </span>
                )}
                {isSuggestion ? (
                  <>
                    <PlanSuggestionDismissButton
                      entryId={entry.id}
                      pendingParent={pending}
                    />
                    <PlanSuggestionCycleControl
                      entryId={entry.id}
                      pendingParent={pending}
                    />
                  </>
                ) : (
                  <PlanEntryServingsControl
                    entryId={entry.id}
                    servingsProp={entry.servings}
                    pendingParent={pending}
                  />
                )}
              </div>
            );

            const isDraggingSelf = draggingId === entry.id;
            const isDropHover = cardDropTargetId === entry.id;

            const cardClassName = [
              "plan-board-card",
              "plan-board-card--image",
              imgUrl ? "" : "plan-board-card--no-photo",
              dragEnabled ? "plan-board-card--draggable" : "",
              isDraggingSelf ? "is-dragging" : "",
              isDropHover ? "is-drop-target" : "",
              isSuggestion ? "plan-board-card--suggestion" : "",
            ]
              .filter(Boolean)
              .join(" ");

            const handleCardDragStart = (
              event: ReactDragEvent<HTMLElement>,
            ) => {
              if (!dragEnabled) return;
              event.stopPropagation();
              event.dataTransfer.effectAllowed = "move";
              try {
                event.dataTransfer.setData("text/plain", String(entry.id));
              } catch {
                /* some browsers disallow custom data; effectAllowed alone is fine */
              }
              onDragStartCard?.(entry.id);
            };

            const handleCardDragEnd = () => {
              if (!dragEnabled) return;
              setCardDropTargetId(null);
              setCellDropActive(false);
              onDragEndCard?.();
            };

            const handleCardDragOver = (
              event: ReactDragEvent<HTMLElement>,
            ) => {
              if (!dragEnabled || !isDragging || isDraggingSelf) return;
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = "move";
              if (cardDropTargetId !== entry.id) {
                setCardDropTargetId(entry.id);
              }
              if (cellDropActive) setCellDropActive(false);
            };

            const handleCardDragLeave = (
              event: ReactDragEvent<HTMLElement>,
            ) => {
              if (!dragEnabled) return;
              const next = event.relatedTarget;
              if (next instanceof Node && event.currentTarget.contains(next)) {
                return;
              }
              if (cardDropTargetId === entry.id) setCardDropTargetId(null);
            };

            const handleCardDrop = (event: ReactDragEvent<HTMLElement>) => {
              if (!dragEnabled || !isDragging || isDraggingSelf) return;
              event.preventDefault();
              event.stopPropagation();
              setCardDropTargetId(null);
              setCellDropActive(false);
              onDropOnCard?.(entry.id);
            };

            return (
              <article
                key={entry.id}
                className={cardClassName}
                draggable={dragEnabled}
                onClick={(event) => event.stopPropagation()}
                onDragStart={dragEnabled ? handleCardDragStart : undefined}
                onDragEnd={dragEnabled ? handleCardDragEnd : undefined}
                onDragOver={dragEnabled ? handleCardDragOver : undefined}
                onDragLeave={dragEnabled ? handleCardDragLeave : undefined}
                onDrop={dragEnabled ? handleCardDrop : undefined}
              >
                {navigationRecipeId != null ? (
                  <Link
                    href={`/recipes/${navigationRecipeId}`}
                    className="plan-board-card-imagelink"
                    aria-label={titleText}
                    onClick={(event) => event.stopPropagation()}
                    draggable={false}
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
