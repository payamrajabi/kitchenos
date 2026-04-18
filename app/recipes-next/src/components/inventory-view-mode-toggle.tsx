"use client";

import { GridFour, ListBullets } from "@phosphor-icons/react";

export const INVENTORY_VIEW_MODES = ["list", "categories"] as const;
export type InventoryViewMode = (typeof INVENTORY_VIEW_MODES)[number];

const OPTIONS: Array<{
  value: InventoryViewMode;
  label: string;
  title: string;
  Icon: typeof ListBullets;
}> = [
  { value: "list", label: "List", title: "Alphabetical list", Icon: ListBullets },
  {
    value: "categories",
    label: "Categories",
    title: "Grouped by ingredient category",
    Icon: GridFour,
  },
];

export function InventoryViewModeToggle({
  value,
  onChange,
}: {
  value: InventoryViewMode;
  onChange: (next: InventoryViewMode) => void;
}) {
  return (
    <div
      className="inventory-view-mode-toggle"
      role="group"
      aria-label="Inventory view"
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.value;
        const { Icon } = opt;
        return (
          <button
            key={opt.value}
            type="button"
            className={`secondary-tab-button inventory-view-mode-toggle-btn${active ? " active" : ""}`}
            aria-pressed={active}
            title={opt.title}
            onClick={() => onChange(opt.value)}
          >
            <Icon size={14} weight="bold" aria-hidden />
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
