"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { IngredientRow, InventoryItemRow } from "@/types/database";
import { InventoryTableBody } from "@/components/inventory-table-body";
import {
  DEFAULT_INVENTORY_FILTERS,
  InventoryFilterBar,
  type InventoryFilterState,
} from "@/components/inventory-filter-bar";
import { InventoryDetailSheet } from "@/components/inventory-detail-sheet";
import {
  InventoryViewModeToggle,
  type InventoryViewMode,
} from "@/components/inventory-view-mode-toggle";
import { InventoryCategoryView } from "@/components/inventory-category-view";

type Props = {
  ingredients: IngredientRow[];
  inventory: InventoryItemRow[];
  inRecipeIngredientIds: number[];
  inMealPlanIngredientIds: number[];
};

export function InventoryView({
  ingredients,
  inventory,
  inRecipeIngredientIds,
  inMealPlanIngredientIds,
}: Props) {
  const [filters, setFilters] =
    useState<InventoryFilterState>(DEFAULT_INVENTORY_FILTERS);
  const [viewMode, setViewMode] = useState<InventoryViewMode>("list");
  const [selectedIngredientId, setSelectedIngredientId] = useState<number | null>(null);

  const recipeSet = useMemo(
    () => new Set(inRecipeIngredientIds),
    [inRecipeIngredientIds],
  );
  const planSet = useMemo(
    () => new Set(inMealPlanIngredientIds),
    [inMealPlanIngredientIds],
  );

  const stockSet = useMemo(() => {
    const s = new Set<number>();
    for (const row of inventory) {
      const q =
        row.quantity != null && row.quantity !== undefined
          ? Number(row.quantity)
          : NaN;
      if (Number.isFinite(q) && q > 0) s.add(row.ingredient_id);
    }
    return s;
  }, [inventory]);

  const filteredIngredients = useMemo(() => {
    const anyFilterOn =
      filters.inStock ||
      filters.outOfStock ||
      filters.recipes ||
      filters.mealPlan;

    const variantsByParent = new Map<number, IngredientRow[]>();
    for (const ing of ingredients) {
      if (ing.parent_ingredient_id) {
        const arr = variantsByParent.get(ing.parent_ingredient_id) ?? [];
        arr.push(ing);
        variantsByParent.set(ing.parent_ingredient_id, arr);
      }
    }

    const groupVisible = (root: IngredientRow): boolean => {
      if (!anyFilterOn) return false;

      const variants = variantsByParent.get(root.id) ?? [];
      const ids = [root.id, ...variants.map((v) => v.id)];

      const groupInStock = ids.some((id) => stockSet.has(id));
      const groupOutOfStock = ids.every((id) => !stockSet.has(id));
      const groupInRecipes = ids.some((id) => recipeSet.has(id));
      const groupInMealPlan = ids.some((id) => planSet.has(id));

      return (
        (filters.inStock && groupInStock) ||
        (filters.outOfStock && groupOutOfStock) ||
        (filters.recipes && groupInRecipes) ||
        (filters.mealPlan && groupInMealPlan)
      );
    };

    const includedRootIds = new Set<number>();
    for (const ing of ingredients) {
      if (!ing.parent_ingredient_id && groupVisible(ing)) {
        includedRootIds.add(ing.id);
      }
    }

    return ingredients.filter((ing) => {
      if (!ing.parent_ingredient_id) return includedRootIds.has(ing.id);
      return includedRootIds.has(ing.parent_ingredient_id);
    });
  }, [ingredients, filters, stockSet, recipeSet, planSet]);

  const hasRows = filteredIngredients.some((ing) => !ing.parent_ingredient_id);

  const flatVisibleIds = useMemo(() => {
    const roots = filteredIngredients.filter((i) => !i.parent_ingredient_id);
    return roots.map((r) => r.id);
  }, [filteredIngredients]);

  const navigateRow = useCallback(
    (dir: 1 | -1) => {
      if (selectedIngredientId == null) return;
      const idx = flatVisibleIds.indexOf(selectedIngredientId);
      if (idx === -1) return;
      const next = flatVisibleIds[idx + dir];
      if (next != null) setSelectedIngredientId(next);
    },
    [selectedIngredientId, flatVisibleIds],
  );

  useEffect(() => {
    if (selectedIngredientId == null) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        navigateRow(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        navigateRow(-1);
      } else if (e.key === "Escape") {
        setSelectedIngredientId(null);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIngredientId, navigateRow]);

  const selectedIngredient = useMemo(
    () => ingredients.find((i) => i.id === selectedIngredientId) ?? null,
    [ingredients, selectedIngredientId],
  );

  const selectedInvRow = useMemo(() => {
    if (!selectedIngredientId) return null;
    return (
      inventory.find(
        (r) => r.ingredient_id === selectedIngredientId,
      ) ?? null
    );
  }, [inventory, selectedIngredientId]);

  return (
    <>
      <div className="inventory-view-controls">
        <InventoryFilterBar value={filters} onChange={setFilters} />
        <InventoryViewModeToggle value={viewMode} onChange={setViewMode} />
      </div>
      {viewMode === "list" ? (
        <div className="table-container inventory-table">
          <table className="ingredients-table inventory-table--compact">
            <InventoryTableBody
              ingredients={filteredIngredients}
              inventory={inventory}
              selectedIngredientId={selectedIngredientId}
              onSelectIngredient={setSelectedIngredientId}
            />
          </table>
          {!hasRows && (
            <p className="inventory-filter-empty" role="status">
              No ingredients match your filters.
            </p>
          )}
        </div>
      ) : (
        <InventoryCategoryView
          ingredients={filteredIngredients}
          inventory={inventory}
          onSelectIngredient={setSelectedIngredientId}
        />
      )}
      {selectedIngredient && (
        <InventoryDetailSheet
          ingredient={selectedIngredient}
          inventoryItem={selectedInvRow}
          onClose={() => setSelectedIngredientId(null)}
        />
      )}
    </>
  );
}
