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
 * Two-word ghost toggle matching the Figma spec: uppercase semibold labels
 * sitting side by side, the active one at full opacity, the inactive one
 * dimmed. Tap either word to switch modes.
 */
export function IngredientUnitDisplayToggle({
  className,
}: {
  className?: string;
}) {
  const { mode, setMode } = useIngredientUnitDisplay();
  const selectOriginal = useCallback(() => setMode("original"), [setMode]);
  const selectGrams = useCallback(() => setMode("grams"), [setMode]);

  return (
    <div
      className={[
        "recipe-ingredients-unit-toggle",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="group"
      aria-label="Show ingredient amounts in"
    >
      <button
        type="button"
        className={[
          "recipe-ingredients-unit-toggle-option",
          mode === "original"
            ? "recipe-ingredients-unit-toggle-option--active"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-pressed={mode === "original"}
        onClick={selectOriginal}
      >
        Original
      </button>
      <button
        type="button"
        className={[
          "recipe-ingredients-unit-toggle-option",
          mode === "grams"
            ? "recipe-ingredients-unit-toggle-option--active"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-pressed={mode === "grams"}
        onClick={selectGrams}
      >
        Grams
      </button>
    </div>
  );
}
