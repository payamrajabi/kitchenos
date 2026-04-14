"use client";

import { RECIPE_MEAL_TYPES } from "@/lib/recipe-meal-types";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type Props = {
  value: string[];
  disabled: boolean;
  onCommit: (next: string[]) => void;
};

function summaryLabel(selected: string[]): string {
  if (selected.length === 0) return "Meal type…";
  return selected.join(", ");
}

export function RecipeMealTypesField({ value, disabled, onCommit }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
      onCommit(ordered);
    },
    [value, onCommit],
  );

  return (
    <div className="recipe-meal-types" ref={rootRef}>
      <span className="recipe-meta-label" id="recipe-meal-types-label">
        Meal type
      </span>
      <div className="recipe-meal-types-inner">
        <button
          type="button"
          className="recipe-meal-types-trigger"
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-labelledby="recipe-meal-types-label"
          onClick={() => setOpen((o) => !o)}
        >
          {summaryLabel(value)}
        </button>
        {open ? (
          <div
            className="recipe-meal-types-dropdown"
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
    </div>
  );
}
