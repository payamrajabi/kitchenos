"use client";

import {
  acceptMealPlanSuggestionAction,
  cycleMealPlanSuggestionAction,
  dismissMealPlanSuggestionAction,
  ensureSuggestionChainAction,
  refillSuggestionPoolAction,
} from "@/app/actions/meal-plan";
import { SearchableSelect, type SelectOption } from "@/components/searchable-select";
import { PlanEntryDeleteButton } from "@/components/plan-entry-delete-button";
import { PlanEntryServingsControl } from "@/components/plan-entry-servings-control";
import { PlanSuggestionAcceptButton } from "@/components/plan-suggestion-accept-button";
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
import type {
  MealPlanEntryRow,
  RecipeRow,
  SuggestionCandidate,
} from "@/types/database";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

/**
 * Client-side override for a suggestion card. Lets us swap what the user sees
 * BEFORE the server action finishes, so the Cycle button feels instant.
 */
type SuggestionOverride = {
  recipeId: number | null;
  label: string;
  notes: string | null;
  pool: SuggestionCandidate[];
};

/** When the local pool shrinks to this size or below, kick off a refill. */
const POOL_REFILL_THRESHOLD = 2;

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

  // Per-entry optimistic overrides for suggestion cycling. When present, the
  // card renders from this instead of the raw server row so the user sees the
  // new pick immediately; the server action runs in the background and the
  // DB catches up shortly after.
  const [suggestionOverrides, setSuggestionOverrides] = useState<
    Map<number, SuggestionOverride>
  >(() => new Map());
  // Entries currently waiting on the slow-path LLM refresh (empty pool).
  const [cyclePending, setCyclePending] = useState<Set<number>>(
    () => new Set(),
  );
  // Entries we've already kicked off a background refill for, so we don't
  // spam the edge function on every click while one is already in flight.
  const refillingRef = useRef<Set<number>>(new Set());

  // Entries the user just accepted. Treated as committed meals locally,
  // even before the server re-render catches up. (See handleAcceptSuggestion.)
  const [acceptedSuggestionIds, setAcceptedSuggestionIds] = useState<
    Set<number>
  >(() => new Set());

  // Entries the user just dismissed. Hidden locally so the card disappears
  // instantly, without waiting for the server round-trip.
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<
    Set<number>
  >(() => new Set());

  const router = useRouter();

  const dragEnabled =
    typeof onDragStartCard === "function" && typeof onDropOnCell === "function";
  const isDragging = draggingId != null;

  const getSuggestionPool = (entry: MealPlanEntryRow): SuggestionCandidate[] => {
    const override = suggestionOverrides.get(entry.id);
    if (override) return override.pool;
    return Array.isArray(entry.suggestion_pool) ? entry.suggestion_pool : [];
  };

  const handleCycleSuggestion = (entry: MealPlanEntryRow) => {
    if (cyclePending.has(entry.id)) return;
    const pool = getSuggestionPool(entry);

    if (pool.length > 0) {
      // ── Fast path ────────────────────────────────────────────────────
      // Swap the card on the screen first, then persist in the background.
      const [next, ...rest] = pool;
      setSuggestionOverrides((prev) => {
        const copy = new Map(prev);
        copy.set(entry.id, {
          recipeId: next.recipe_id ?? null,
          label: next.label,
          notes: next.notes ?? null,
          pool: rest,
        });
        return copy;
      });

      void (async () => {
        // Fire-and-forget: the optimistic UI already shows the right thing.
        await cycleMealPlanSuggestionAction(entry.id).catch(() => undefined);
      })();

      // Top the pool back up in the background if it's running low, so the
      // NEXT click stays on the fast path.
      if (
        rest.length <= POOL_REFILL_THRESHOLD &&
        !refillingRef.current.has(entry.id)
      ) {
        refillingRef.current.add(entry.id);
        void (async () => {
          try {
            const result = await refillSuggestionPoolAction(entry.id);
            if (result.ok && result.added.length > 0) {
              setSuggestionOverrides((prev) => {
                const copy = new Map(prev);
                const current = copy.get(entry.id);
                if (!current) return prev;
                copy.set(entry.id, {
                  ...current,
                  pool: [...current.pool, ...result.added],
                });
                return copy;
              });
            }
          } finally {
            refillingRef.current.delete(entry.id);
          }
        })();
      }
      return;
    }

    // ── Slow path ────────────────────────────────────────────────────
    // Pool is empty, so the server has to call the LLM. Show a spinner and
    // refresh once the new row lands.
    setCyclePending((prev) => {
      const copy = new Set(prev);
      copy.add(entry.id);
      return copy;
    });
    void (async () => {
      try {
        const result = await cycleMealPlanSuggestionAction(entry.id);
        if (result.ok) {
          // The server updated the DB with a fresh active + pool. Drop any
          // old override and let the server state win.
          setSuggestionOverrides((prev) => {
            if (!prev.has(entry.id)) return prev;
            const copy = new Map(prev);
            copy.delete(entry.id);
            return copy;
          });
          router.refresh();
        }
      } finally {
        setCyclePending((prev) => {
          const copy = new Set(prev);
          copy.delete(entry.id);
          return copy;
        });
      }
    })();
  };

  const handleAcceptSuggestion = (entry: MealPlanEntryRow) => {
    // Flip the card to "committed" state locally. The next render treats it
    // like any other real meal — no dim, no action row, no dashed chrome.
    setAcceptedSuggestionIds((prev) => {
      if (prev.has(entry.id)) return prev;
      const copy = new Set(prev);
      copy.add(entry.id);
      return copy;
    });
    // Background: persist the accept, then run the chain to seed the same
    // slot on the next day, then refresh so the new suggestion row appears
    // in the calendar without a manual reload. The user already sees the
    // instant "committed" flip above, so this all happens out-of-band.
    void (async () => {
      try {
        await acceptMealPlanSuggestionAction(entry.id);
        const chainResult = await ensureSuggestionChainAction();
        if (chainResult.ok && chainResult.filled > 0) {
          router.refresh();
        }
      } catch {
        // Swallow: worst case the user sees their acceptance stick but the
        // next-day suggestion appears on their next visit to /plan.
      }
    })();
  };

  const handleDismissSuggestion = (entry: MealPlanEntryRow) => {
    // Hide the card locally so the slot looks empty right away. The server
    // deletes the row and records a dismissal in the background; on the next
    // page navigation the empty slot matches the local view.
    setDismissedSuggestionIds((prev) => {
      if (prev.has(entry.id)) return prev;
      const copy = new Set(prev);
      copy.add(entry.id);
      return copy;
    });
    void dismissMealPlanSuggestionAction(entry.id).catch(() => undefined);
  };

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
          {cellEntries
            .filter((entry) => !dismissedSuggestionIds.has(entry.id))
            .map((entry) => {
            // Treat locally-accepted suggestions as committed meals, even if
            // the server row still has `is_suggestion = true` (the write is
            // running in the background).
            const isSuggestion =
              entry.is_suggestion === true &&
              !acceptedSuggestionIds.has(entry.id);
            // Layer the client-side optimistic override (if any) on top of
            // the server row so the card reflects what the user just picked.
            const override = isSuggestion
              ? suggestionOverrides.get(entry.id)
              : undefined;
            const displayEntry: MealPlanEntryRow = override
              ? {
                  ...entry,
                  recipe_id: override.recipeId,
                  label: override.label,
                  notes: override.notes,
                }
              : entry;

            const titleText = displayEntry.label || "Recipe";
            const resolvedRecipe = planEntryRecipeMatch(
              recipeById,
              recipeByNameLower,
              displayEntry,
              titleText,
            );
            const recipeForImage = resolvedRecipe as RecipeRow | undefined;
            const navigationRecipeId =
              resolvedRecipe != null
                ? coerceNumericId(resolvedRecipe.id)
                : coerceNumericId(displayEntry.recipe_id);
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
                  <div
                    className="plan-suggestion-actions"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <PlanSuggestionDismissButton
                      pendingParent={pending}
                      onDismiss={() => handleDismissSuggestion(entry)}
                    />
                    <PlanSuggestionCycleControl
                      pendingParent={pending}
                      onCycle={() => handleCycleSuggestion(entry)}
                      isSpinning={cyclePending.has(entry.id)}
                    />
                    <PlanSuggestionAcceptButton
                      pendingParent={pending}
                      onAccept={() => handleAcceptSuggestion(entry)}
                    />
                  </div>
                ) : (
                  <>
                    <PlanEntryDeleteButton
                      entryId={entry.id}
                      pendingParent={pending}
                    />
                    <PlanEntryServingsControl
                      entryId={entry.id}
                      servingsProp={entry.servings}
                      pendingParent={pending}
                    />
                  </>
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
                {!imgUrl || displayEntry.notes ? (
                  <div className="plan-board-card-image-footer">
                    {!imgUrl ? (
                      <p className="plan-board-card-image-title">{titleText}</p>
                    ) : null}
                    {displayEntry.notes ? (
                      <p className="plan-board-card-image-notes">{displayEntry.notes}</p>
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
