"use client";

import { CaretDown } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { updateRecipeAction } from "@/app/actions/recipes";
import {
  RECIPE_MEAL_TYPES,
  mealTypesEqual,
  normalizeMealTypesFromDb,
} from "@/lib/recipe-meal-types";

type Props = {
  recipeId: number;
  initialMealTypes: unknown;
  editable: boolean;
};

export function RecipesTableMealTypeCell({
  recipeId,
  initialMealTypes,
  editable,
}: Props) {
  const [value, setValue] = useState<string[]>(() =>
    normalizeMealTypesFromDb(initialMealTypes),
  );
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  // Keep cell in sync if the server refetches and sends a new value in.
  useEffect(() => {
    const fresh = normalizeMealTypesFromDb(initialMealTypes);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate prop-to-state sync; the server-truth initialMealTypes prop changes via router.refresh() and local editing state must re-mirror it.
    setValue((prev) => (mealTypesEqual(prev, fresh) ? prev : fresh));
  }, [initialMealTypes]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = useCallback(
    (label: string) => {
      const has = value.includes(label);
      const next = has
        ? value.filter((x) => x !== label)
        : [...value, label];
      const ordered = RECIPE_MEAL_TYPES.filter((t) => next.includes(t));
      const previous = value;
      setValue(ordered);
      startTransition(async () => {
        const res = await updateRecipeAction(recipeId, {
          meal_types: ordered.length ? ordered : null,
        });
        if (!res.ok) {
          setValue(previous);
        }
      });
    },
    [recipeId, value],
  );

  if (!editable) {
    return value.length ? (
      <span>{value.join(", ")}</span>
    ) : (
      <span className="recipes-table-empty">—</span>
    );
  }

  const isEmpty = value.length === 0;

  return (
    <div className="recipes-table-meal-types-cell" ref={rootRef}>
      <button
        type="button"
        className={`recipes-table-meal-types-trigger${
          isEmpty ? " is-empty" : ""
        }`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={
          isEmpty
            ? "Choose meal type"
            : `Meal type: ${value.join(", ")}. Click to change.`
        }
        disabled={pending && !open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="recipes-table-meal-types-label">
          {isEmpty ? (
            <span className="recipes-table-meal-types-placeholder">
              Choose meal type
            </span>
          ) : (
            value.join(", ")
          )}
        </span>
        <CaretDown
          size={10}
          weight="bold"
          aria-hidden
          className="recipes-table-meal-types-caret"
        />
      </button>
      {open ? (
        <div
          className="recipe-meal-types-dropdown recipes-table-meal-types-dropdown"
          role="listbox"
          aria-label="Meal types"
          aria-multiselectable="true"
        >
          {RECIPE_MEAL_TYPES.map((label) => {
            const selected = value.includes(label);
            return (
              <label key={label} className="recipe-meal-types-option">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggle(label)}
                />
                <span>{label}</span>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
