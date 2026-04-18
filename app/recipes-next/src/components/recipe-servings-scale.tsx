"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Display-only multiplier for recipe ingredient amounts. The recipe's stored
 * servings count stays put; this just rescales how each amount is rendered in
 * view mode when the reader bumps servings up or down.
 *
 * 1 = show amounts as stored. 1.5 = show 1.5× the stored amount, etc.
 */
const RecipeServingsScaleContext = createContext<number>(1);

export function RecipeServingsScaleProvider({
  scale,
  children,
}: {
  scale: number;
  children: ReactNode;
}) {
  const safe =
    Number.isFinite(scale) && scale > 0 ? scale : 1;
  return (
    <RecipeServingsScaleContext.Provider value={safe}>
      {children}
    </RecipeServingsScaleContext.Provider>
  );
}

export function useRecipeServingsScale(): number {
  return useContext(RecipeServingsScaleContext);
}
