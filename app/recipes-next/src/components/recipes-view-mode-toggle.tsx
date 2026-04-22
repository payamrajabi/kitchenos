"use client";

import { SquaresFour, Table } from "@phosphor-icons/react";

export const RECIPES_VIEW_MODES = ["grid", "table"] as const;
export type RecipesViewMode = (typeof RECIPES_VIEW_MODES)[number];

export function RecipesViewModeToggle({
  value,
  onChange,
}: {
  value: RecipesViewMode;
  onChange: (next: RecipesViewMode) => void;
}) {
  const next: RecipesViewMode = value === "table" ? "grid" : "table";
  const Icon = next === "table" ? Table : SquaresFour;
  const title =
    next === "table" ? "Switch to table view" : "Switch to grid view";

  return (
    <button
      type="button"
      className="inventory-view-mode-toggle recipes-view-mode-toggle"
      aria-label={title}
      title={title}
      onClick={() => onChange(next)}
    >
      <Icon size={20} weight="regular" aria-hidden />
    </button>
  );
}
