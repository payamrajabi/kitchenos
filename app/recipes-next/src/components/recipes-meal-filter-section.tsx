"use client";

import { X } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  RECIPE_MEAL_TYPES,
  normalizeMealTypesFromDb,
  type RecipeMealType,
} from "@/lib/recipe-meal-types";
import {
  getPlanSlot,
  planSlotOrder,
  type PlanSlotKey,
} from "@/lib/meal-plan";
import { formatPlanDayLabel } from "@/lib/dates";

function parseMealParam(raw: string | null): RecipeMealType | null {
  if (!raw) return null;
  const match = RECIPE_MEAL_TYPES.find(
    (m) => m.toLowerCase() === raw.trim().toLowerCase(),
  );
  return match ?? null;
}

const PLAN_SLOT_KEYS = new Set<string>(planSlotOrder.map((s) => s.key));

type AddToSlotContext = {
  planDate: string;
  slotKey: PlanSlotKey;
  slotLabel: string;
  dayLabel: string;
};

/** Parses `?for=YYYY-MM-DD:slotKey` from the Recipes page URL. */
function parseForParam(raw: string | null): AddToSlotContext | null {
  if (!raw) return null;
  const [planDate, rawSlot] = raw.split(":");
  if (!planDate || !rawSlot) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(planDate)) return null;
  if (!PLAN_SLOT_KEYS.has(rawSlot)) return null;
  const slotKey = rawSlot as PlanSlotKey;
  return {
    planDate,
    slotKey,
    slotLabel: getPlanSlot(slotKey).label,
    dayLabel: formatPlanDayLabel(planDate),
  };
}
import type { RecipeRow } from "@/types/database";
import { RecipeCard } from "@/components/recipe-card";
import { CommunityRecipeCard } from "@/components/community-recipe-card";
import { DraftRecipeCards } from "@/components/draft-recipe-cards";
import {
  RecipesViewModeToggle,
  type RecipesViewMode,
} from "@/components/recipes-view-mode-toggle";
import { RecipesTableView } from "@/components/recipes-table-view";

// Duration of the "suck into X" collapse animation (match CSS).
const COLLAPSE_DURATION_MS = 128;
// Per-pill stagger: pills further from the X start a little later so the
// cascade reads as being consumed one after another.
const COLLAPSE_STAGGER_MS = 8;
// Widths used to predict the target pill's final resting position before we
// commit the solo layout. Must match the CSS for `.recipes-meal-filter-clear`
// (28px chip) and the `--space-8` gap between bar items.
const SOLO_X_WIDTH = 28;
const SOLO_X_GAP = 8;

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
  ingredientCounts?: Record<number, number>;
  instructionCounts?: Record<number, number>;
};

export function RecipesMealFilterSection({
  ownRecipes,
  allRecipes,
  libraryIds,
  userId,
  ingredientCounts,
  instructionCounts,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMeal = parseMealParam(searchParams?.get("meal") ?? null);
  const [singleMeal, setSingleMeal] = useState<RecipeMealType | null>(
    initialMeal,
  );
  const addToSlot = useMemo(
    () => parseForParam(searchParams?.get("for") ?? null),
    [searchParams],
  );
  const [communityOn, setCommunityOn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewMode, setViewMode] = useState<RecipesViewMode>("grid");
  const [collapseTarget, setCollapseTarget] =
    useState<RecipeMealType | null>(null);
  const menuWrapRef = useRef<HTMLDivElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const pillRefs = useRef<Map<RecipeMealType, HTMLButtonElement | null>>(
    new Map(),
  );
  const collapseTimer = useRef<number | null>(null);

  // Keep the filter in sync if the URL ?meal= param changes (e.g. user taps a
  // different meal slot on /plan, which routes here with a fresh meal type).
  useEffect(() => {
    const next = parseMealParam(searchParams?.get("meal") ?? null);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate URL-to-state sync; ?meal= can change via cross-page navigation (e.g. from /plan) and the local pill must re-mirror it.
    if (next !== null) setSingleMeal(next);
  }, [searchParams]);

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

  // Cancel any pending collapse timer on unmount so we don't try to commit
  // state after the component is gone.
  useEffect(() => {
    return () => {
      if (collapseTimer.current !== null) {
        window.clearTimeout(collapseTimer.current);
      }
    };
  }, []);

  if (!ownRecipes.length && !allRecipes.length) {
    return null;
  }

  const commitMeal = (meal: RecipeMealType) => {
    setSingleMeal(meal);
    setCollapseTarget(null);
    setMenuOpen(false);
  };

  // Kicks off the "suck into X" cascade. Measures each pill's current
  // position, writes CSS variables for its absorb delta (toward the X) and
  // stagger delay, then flips `collapseTarget` so CSS takes it from there.
  // After COLLAPSE_DURATION_MS we commit `singleMeal` which swaps the DOM
  // to the final `[X] [solo pill]` layout.
  const selectMeal = (meal: RecipeMealType) => {
    if (collapseTarget !== null) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const targetPill = pillRefs.current.get(meal) ?? null;
    const barEl = barRef.current;

    // When the selection comes from the narrow-viewport dropdown the pills
    // aren't rendered, so there's nothing to animate. Same story for the
    // reduced-motion preference. Commit immediately in both cases.
    if (
      prefersReducedMotion ||
      !targetPill ||
      !barEl ||
      targetPill.offsetParent === null
    ) {
      commitMeal(meal);
      return;
    }

    const barRect = barEl.getBoundingClientRect();
    const targetRect = targetPill.getBoundingClientRect();

    // Final resting x for the solo pill: just after the X chip + the 8px gap.
    const finalLeft = barRect.left + SOLO_X_WIDTH + SOLO_X_GAP;
    const targetDeltaX = finalLeft - targetRect.left;
    targetPill.style.setProperty("--target-delta-x", `${targetDeltaX}px`);

    // Center of the X chip — that's the point all other pills collapse into.
    const xCenter = barRect.left + SOLO_X_WIDTH / 2;

    let order = 0;
    RECIPE_MEAL_TYPES.forEach((key) => {
      if (key === meal) return;
      const el = pillRefs.current.get(key);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = xCenter - (r.left + r.width / 2);
      el.style.setProperty("--absorb-delta-x", `${dx}px`);
      el.style.setProperty(
        "--absorb-stagger",
        `${order * COLLAPSE_STAGGER_MS}ms`,
      );
      order += 1;
    });

    // Animate the "All Meal Types" trigger alongside the pills so the whole
    // row is absorbed together (it sits furthest from the X, so it gets the
    // highest stagger index).
    const menuEl = menuWrapRef.current;
    if (menuEl) {
      const r = menuEl.getBoundingClientRect();
      const dx = xCenter - (r.left + r.width / 2);
      menuEl.style.setProperty("--absorb-delta-x", `${dx}px`);
      menuEl.style.setProperty(
        "--absorb-stagger",
        `${order * COLLAPSE_STAGGER_MS}ms`,
      );
    }

    setCollapseTarget(meal);

    if (collapseTimer.current !== null) {
      window.clearTimeout(collapseTimer.current);
    }
    collapseTimer.current = window.setTimeout(() => {
      collapseTimer.current = null;
      commitMeal(meal);
    }, COLLAPSE_DURATION_MS);
  };

  const registerPillRef = (key: RecipeMealType) =>
    (el: HTMLButtonElement | null) => {
      if (el) pillRefs.current.set(key, el);
      else pillRefs.current.delete(key);
    };

  const clearToAll = () => {
    setSingleMeal(null);
  };

  const isCollapsing = collapseTarget !== null;

  return (
    <>
      {addToSlot ? (
        <div
          className="recipes-add-to-slot-banner"
          role="status"
          aria-live="polite"
        >
          <span className="recipes-add-to-slot-banner-text">
            Tap a recipe to add it to{" "}
            <strong>{addToSlot.slotLabel}</strong> on{" "}
            <strong>{addToSlot.dayLabel}</strong>.
          </span>
          <Link
            href="/plan"
            className="recipes-add-to-slot-banner-cancel"
            aria-label="Cancel and go back to the plan"
            onClick={(e) => {
              e.preventDefault();
              router.push("/plan");
            }}
          >
            Cancel
          </Link>
        </div>
      ) : null}
      <div className="recipes-meal-filter-strip recipes-meal-filter-strip-with-toggle">
        <div
          ref={barRef}
          className={`recipes-meal-filter-bar${
            isCollapsing ? " is-collapsing" : ""
          }`}
          role="group"
          aria-label="Filter recipes"
        >
          {isCollapsing ? (
            <span className="recipes-meal-filter-ghost-x" aria-hidden="true">
              <X size={16} weight="bold" />
            </span>
          ) : null}
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
              {RECIPE_MEAL_TYPES.map((key) => {
                const isTarget = collapseTarget === key;
                const animationClass = isCollapsing
                  ? isTarget
                    ? " is-becoming-solo"
                    : " is-absorbing"
                  : "";
                return (
                  <button
                    key={key}
                    ref={registerPillRef(key)}
                    type="button"
                    className={`secondary-tab-button active recipes-meal-filter-pills-only${animationClass}`}
                    aria-label={`Show only ${key} recipes`}
                    onClick={() => selectMeal(key)}
                  >
                    {key}
                  </button>
                );
              })}
              <div
                ref={menuWrapRef}
                className={`recipes-meal-filter-menu-wrap${
                  isCollapsing ? " is-absorbing" : ""
                }`}
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
        <RecipesViewModeToggle value={viewMode} onChange={setViewMode} />
      </div>
      <DraftRecipeCards />
      {viewMode === "table" ? (
        visible.length ? (
          <div className="recipes-table-wrap">
            <RecipesTableView
              recipes={visible}
              ingredientCounts={ingredientCounts ?? {}}
              instructionCounts={instructionCounts ?? {}}
              currentUserId={userId}
              linkBuilder={(recipe) =>
                communityOn && !(userId && recipe.owner_id === userId)
                  ? `/community/${recipe.id}`
                  : `/recipes/${recipe.id}`
              }
            />
          </div>
        ) : null
      ) : (
        visible.map((recipe) =>
          communityOn ? (
            <CommunityRecipeCard
              key={recipe.id}
              recipe={recipe}
              isOwn={!!userId && recipe.owner_id === userId}
              inLibrary={libraryIdSet.has(recipe.id)}
            />
          ) : (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              addContext={addToSlot ?? undefined}
            />
          ),
        )
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
