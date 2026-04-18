"use client";

import { useMemo } from "react";
import type { IngredientRow, InventoryItemRow } from "@/types/database";
import {
  getInventoryRowForIngredient,
  getInventoryStockValuesUnified,
} from "@/lib/inventory-display";
import { InventoryQtyControl } from "@/components/inventory-qty-control";
import { INGREDIENT_TAXONOMY_SUBCATEGORIES } from "@/lib/ingredient-backbone-inference";

const UNCATEGORISED_LABEL = "Uncategorised";

const SUBCATEGORY_ORDER_INDEX = new Map<string, number>(
  INGREDIENT_TAXONOMY_SUBCATEGORIES.map((c, i) => [c as string, i]),
);

type Section = {
  key: string;
  label: string;
  items: IngredientRow[];
};

function bucketKey(ing: IngredientRow): string {
  const raw = ing.taxonomy_subcategory?.trim();
  return raw && raw.length > 0 ? raw : UNCATEGORISED_LABEL;
}

function sectionSortIndex(key: string): number {
  if (key === UNCATEGORISED_LABEL) return Number.MAX_SAFE_INTEGER;
  const idx = SUBCATEGORY_ORDER_INDEX.get(key);
  return idx ?? Number.MAX_SAFE_INTEGER - 1;
}

function buildSections(ingredients: IngredientRow[]): Section[] {
  const buckets = new Map<string, IngredientRow[]>();

  for (const ing of ingredients) {
    // Roots only — variants live under their parent and would clutter the
    // dense view. Tapping a root opens the detail sheet where variants live.
    if (ing.parent_ingredient_id) continue;
    const key = bucketKey(ing);
    const arr = buckets.get(key) ?? [];
    arr.push(ing);
    buckets.set(key, arr);
  }

  const sections: Section[] = [];
  for (const [key, items] of buckets.entries()) {
    items.sort((a, b) => a.name.localeCompare(b.name));
    sections.push({ key, label: key, items });
  }

  sections.sort((a, b) => {
    const ai = sectionSortIndex(a.key);
    const bi = sectionSortIndex(b.key);
    if (ai !== bi) return ai - bi;
    return a.label.localeCompare(b.label);
  });

  return sections;
}

export function InventoryCategoryView({
  ingredients,
  inventory,
  onSelectIngredient,
}: {
  ingredients: IngredientRow[];
  inventory: InventoryItemRow[];
  onSelectIngredient: (id: number) => void;
}) {
  const sections = useMemo(() => buildSections(ingredients), [ingredients]);

  if (sections.length === 0) {
    return (
      <p className="inventory-filter-empty" role="status">
        No ingredients match your filters.
      </p>
    );
  }

  return (
    <div className="inventory-category-view">
      {sections.map((section) => (
        <section className="inv-cat-section" key={section.key}>
          <h3 className="inv-cat-section-heading">
            <span className="inv-cat-section-title">{section.label}</span>
          </h3>
          <ul className="inv-cat-section-list">
            {section.items.map((ing) => {
              const invRow = getInventoryRowForIngredient(inventory, ing.id);
              const stock = getInventoryStockValuesUnified(ing, invRow);
              const qty =
                typeof stock.quantity === "number" ? stock.quantity : 0;
              const isEmpty = qty <= 0;
              return (
                <li
                  className={`inv-cat-row${isEmpty ? " inv-cat-row--empty" : ""}`}
                  key={ing.id}
                >
                  <button
                    type="button"
                    className="inv-cat-row-name"
                    onClick={() => onSelectIngredient(ing.id)}
                    title={ing.name}
                  >
                    {ing.name}
                  </button>
                  <InventoryQtyControl
                    ingredientId={ing.id}
                    inventoryId={invRow?.id ?? ""}
                    quantity={qty}
                    unit={stock.unit || ""}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
