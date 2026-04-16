"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Two-state recipe screen model: "view" is the default for anyone reading /
 * cooking; "edit" exposes all the authoring affordances (borders, drag
 * handles, row menus, add rows, delete, publish, etc.).
 *
 * Mutations in edit mode still autosave on blur/commit — the mode flag only
 * drives which UI surfaces are visible.
 */
export type RecipeEditMode = "view" | "edit";

const RecipeEditModeContext = createContext<RecipeEditMode>("view");

export function RecipeEditModeProvider({
  mode,
  children,
}: {
  mode: RecipeEditMode;
  children: ReactNode;
}) {
  return (
    <RecipeEditModeContext.Provider value={mode}>
      {children}
    </RecipeEditModeContext.Provider>
  );
}

export function useRecipeEditMode(): RecipeEditMode {
  return useContext(RecipeEditModeContext);
}

export function useIsRecipeEditing(): boolean {
  return useContext(RecipeEditModeContext) === "edit";
}
