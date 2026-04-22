"use client";

import { List, Table } from "@phosphor-icons/react";

export const INVENTORY_VIEW_MODES = ["list", "table"] as const;
export type InventoryViewMode = (typeof INVENTORY_VIEW_MODES)[number];

export function InventoryViewModeToggle({
  value,
  onChange,
}: {
  value: InventoryViewMode;
  onChange: (next: InventoryViewMode) => void;
}) {
  const next: InventoryViewMode = value === "table" ? "list" : "table";
  const Icon = next === "table" ? Table : List;
  const title =
    next === "table"
      ? "Switch to table view"
      : "Switch to list view";

  return (
    <button
      type="button"
      className="inventory-view-mode-toggle"
      aria-label={title}
      title={title}
      onClick={() => onChange(next)}
    >
      <Icon size={20} weight="regular" aria-hidden />
    </button>
  );
}
