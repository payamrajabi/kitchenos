"use client";

export const INVENTORY_FILTER_KEYS = [
  "inStock",
  "outOfStock",
  "recipes",
  "mealPlan",
] as const;

export type InventoryFilterKey = (typeof INVENTORY_FILTER_KEYS)[number];

export type InventoryFilterState = Record<InventoryFilterKey, boolean>;

export const DEFAULT_INVENTORY_FILTERS: InventoryFilterState = {
  inStock: true,
  outOfStock: true,
  recipes: true,
  mealPlan: true,
};

const LABELS: Record<InventoryFilterKey, string> = {
  inStock: "In Stock",
  outOfStock: "Out of Stock",
  recipes: "Recipes",
  mealPlan: "Meal Plan",
};

export function InventoryFilterBar({
  value,
  onChange,
}: {
  value: InventoryFilterState;
  onChange: (next: InventoryFilterState) => void;
}) {
  const toggle = (key: InventoryFilterKey) => {
    onChange({ ...value, [key]: !value[key] });
  };

  return (
    <div
      className="inventory-filter-bar"
      role="group"
      aria-label="Inventory visibility"
    >
      {INVENTORY_FILTER_KEYS.map((key) => {
        const on = value[key];
        return (
          <button
            key={key}
            type="button"
            className={`secondary-tab-button${on ? " active" : ""}`}
            aria-pressed={on}
            onClick={() => toggle(key)}
          >
            {LABELS[key]}
          </button>
        );
      })}
    </div>
  );
}
