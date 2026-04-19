"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Display-only toggle at the top of the recipe ingredients table. Switches
 * each row's amount between the authored unit ("Original") and a grams-based
 * conversion ("Grams"). Nothing about the recipe or ingredient is written
 * back to the DB by this toggle — it only affects rendering.
 */
export type IngredientUnitDisplayMode = "original" | "grams";

type ContextValue = {
  mode: IngredientUnitDisplayMode;
  setMode: (mode: IngredientUnitDisplayMode) => void;
};

const IngredientUnitDisplayContext = createContext<ContextValue>({
  mode: "original",
  setMode: () => {},
});

export function RecipeIngredientUnitDisplayProvider({
  children,
  initialMode = "original",
}: {
  children: ReactNode;
  initialMode?: IngredientUnitDisplayMode;
}) {
  const [mode, setMode] = useState<IngredientUnitDisplayMode>(initialMode);
  const value = useMemo<ContextValue>(() => ({ mode, setMode }), [mode]);
  return (
    <IngredientUnitDisplayContext.Provider value={value}>
      {children}
    </IngredientUnitDisplayContext.Provider>
  );
}

export function useIngredientUnitDisplay(): ContextValue {
  return useContext(IngredientUnitDisplayContext);
}

/**
 * Single-label toggle: a "Show in grams" pill that reads as dim/disabled in
 * the default "original" mode and comes alive (full-weight ink colour) when
 * active. Tapping flips between the two modes.
 */
export function IngredientUnitDisplayToggle({
  className,
}: {
  className?: string;
}) {
  const { mode, setMode } = useIngredientUnitDisplay();
  const isGrams = mode === "grams";
  const toggle = useCallback(
    () => setMode(isGrams ? "original" : "grams"),
    [isGrams, setMode],
  );

  return (
    <button
      type="button"
      className={[
        "recipe-ingredients-unit-toggle-option",
        isGrams ? "recipe-ingredients-unit-toggle-option--active" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-pressed={isGrams}
      onClick={toggle}
    >
      Show in grams
    </button>
  );
}
