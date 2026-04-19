"use client";

import { X } from "@phosphor-icons/react";

export const INVENTORY_FILTER_KEYS = [
  "fridge",
  "freezer",
  "shallowPantry",
  "deepPantry",
  "other",
] as const;

export type InventoryFilterKey = (typeof INVENTORY_FILTER_KEYS)[number];

// `null` = no single filter is active (show all locations).
export type InventoryFilterState = InventoryFilterKey | null;

export const DEFAULT_INVENTORY_FILTERS: InventoryFilterState = null;

const LABELS: Record<InventoryFilterKey, string> = {
  fridge: "Fridge",
  freezer: "Freezer",
  shallowPantry: "Shallow Pantry",
  deepPantry: "Deep Pantry",
  other: "Other",
};

// Canonical `storage_location` values stored on `inventory_items` rows.
export const STORAGE_LOCATION_BY_FILTER_KEY: Record<InventoryFilterKey, string> =
  {
    fridge: "Fridge",
    freezer: "Freezer",
    shallowPantry: "Shallow Pantry",
    deepPantry: "Deep Pantry",
    other: "Other",
  };

export function InventoryFilterBar({
  value,
  onChange,
}: {
  value: InventoryFilterState;
  onChange: (next: InventoryFilterState) => void;
}) {
  return (
    <div
      className="inventory-filter-bar"
      role="group"
      aria-label="Inventory storage location"
    >
      {value != null ? (
        <>
          <button
            type="button"
            className="inventory-filter-clear"
            onClick={() => onChange(null)}
            aria-label="Show all storage locations"
          >
            <X size={16} weight="bold" aria-hidden />
          </button>
          <span
            className="secondary-tab-button active inventory-filter-solo-label"
            role="status"
            aria-label={`Filtered by ${LABELS[value]}`}
          >
            {LABELS[value]}
          </span>
        </>
      ) : (
        INVENTORY_FILTER_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className="secondary-tab-button active"
            aria-label={`Show only ${LABELS[key]}`}
            onClick={() => onChange(key)}
          >
            {LABELS[key]}
          </button>
        ))
      )}
    </div>
  );
}
