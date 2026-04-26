"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { IngredientRow, InventoryItemRow } from "@/types/database";
import {
  getInventoryRowForIngredient,
  getInventoryStockValuesUnified,
  normalizeInventoryId,
} from "@/lib/inventory-display";
import { inferGroceryCategoryFromName } from "@/lib/ingredient-grocery-category";
import { InventoryGroceryCategorySelect } from "@/components/inventory-grocery-category-select";
import {
  SearchableSelect,
  type SelectOption,
} from "@/components/searchable-select";
import {
  canonicalIngredientUnit,
  defaultRecipeUnitForStockUnit,
  INGREDIENT_UNIT_VALUES,
  RECIPE_UNITS,
} from "@/lib/unit-mapping";
import { STOCK_UNIT_OPTIONS, STOCK_UNIT_VALUES } from "@/lib/stock-units";
import {
  updateInventoryStorageLocationAction,
  updateInventoryStockUnitAction,
  updateIngredientTaxonomySubcategoryAction,
  updateRecipeUnitAction,
} from "@/app/actions/inventory";
import { INGREDIENT_TAXONOMY_SUBCATEGORIES } from "@/lib/ingredient-backbone-inference";

type SortKey =
  | "name"
  | "subcategory"
  | "category"
  | "storage_location"
  | "stock_unit"
  | "recipe_unit";

type SortDir = "asc" | "desc";

type Props = {
  ingredients: IngredientRow[];
  inventory: InventoryItemRow[];
  selectedIngredientId: number | null;
  onSelectIngredient: (id: number) => void;
};

type Row = {
  ingredient: IngredientRow;
  name: string;
  subcategory: string;
  category: string;
  storageLocation: string;
  stockUnit: string;
  recipeUnit: string;
  inventoryId: number | "";
};

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: "name", label: "Ingredient" },
  { key: "subcategory", label: "Subcategory" },
  { key: "category", label: "Category" },
  { key: "storage_location", label: "Storage Location" },
  { key: "stock_unit", label: "Stock Unit" },
  { key: "recipe_unit", label: "Recipe Unit" },
];

const STORAGE_LOCATION_OPTIONS: SelectOption[] = [
  { value: "Fridge", label: "Fridge" },
  { value: "Freezer", label: "Freezer" },
  { value: "Shallow Pantry", label: "Shallow Pantry" },
  { value: "Deep Pantry", label: "Deep Pantry" },
];

// Treat missing / blank values as a single empty token so they always sink to
// the bottom of an ascending sort (and top of descending).
function compareStrings(a: string, b: string, dir: SortDir): number {
  const aEmpty = a.length === 0;
  const bEmpty = b.length === 0;
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  const cmp = a.localeCompare(b, undefined, { sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}

// Stop row-level `onClick` (which opens the detail sheet) from firing when
// the user interacts with an editable cell control.
function CellGuard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="inventory-table-cell-edit"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

function SubcategoryCell({
  ingredientId,
  value,
}: {
  ingredientId: number;
  value: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const options: SelectOption[] = useMemo(() => {
    const base = INGREDIENT_TAXONOMY_SUBCATEGORIES.map((s) => ({
      value: s,
      label: s,
    }));
    const v = (value ?? "").trim();
    if (v && !base.some((o) => o.value === v)) {
      return [{ value: v, label: v }, ...base];
    }
    return base;
  }, [value]);

  const handleChange = useCallback(
    (next: string) => {
      startTransition(async () => {
        const r = await updateIngredientTaxonomySubcategoryAction(
          ingredientId,
          next,
        );
        if (!r.ok) toast.error(r.error);
        else router.refresh();
      });
    },
    [ingredientId, router],
  );

  return (
    <SearchableSelect
      className="inventory-subcategory-select"
      options={options}
      value={value || ""}
      onChange={handleChange}
      disabled={isPending}
      aria-label="Subcategory"
      bareInline
      placeholder="—"
    />
  );
}

function StorageLocationCell({
  ingredientId,
  inventoryId,
  value,
}: {
  ingredientId: number;
  inventoryId: number | "";
  value: string;
}) {
  const router = useRouter();
  const resolvedInventoryId = normalizeInventoryId(inventoryId);
  const [isPending, startTransition] = useTransition();

  const handleChange = useCallback(
    (next: string) => {
      startTransition(async () => {
        const r = await updateInventoryStorageLocationAction(
          ingredientId,
          resolvedInventoryId,
          next,
        );
        if (!r.ok) toast.error(r.error);
        else router.refresh();
      });
    },
    [ingredientId, resolvedInventoryId, router],
  );

  return (
    <SearchableSelect
      className="inventory-storage-location-select"
      options={STORAGE_LOCATION_OPTIONS}
      value={value || ""}
      onChange={handleChange}
      disabled={isPending}
      aria-label="Storage location"
      bareInline
      placeholder="—"
    />
  );
}

function StockUnitCell({
  ingredientId,
  inventoryId,
  value,
}: {
  ingredientId: number;
  inventoryId: number | "";
  value: string;
}) {
  const router = useRouter();
  const resolvedInventoryId = normalizeInventoryId(inventoryId);
  const [isPending, startTransition] = useTransition();
  const normalized = canonicalIngredientUnit(value);

  const options: SelectOption[] = useMemo(() => {
    const v = normalized.trim();
    if (v && !STOCK_UNIT_VALUES.has(v)) {
      return [{ value: v, label: v }, ...STOCK_UNIT_OPTIONS];
    }
    return STOCK_UNIT_OPTIONS;
  }, [normalized]);

  const handleChange = useCallback(
    (next: string) => {
      startTransition(async () => {
        const r = await updateInventoryStockUnitAction(
          ingredientId,
          resolvedInventoryId,
          next,
        );
        if (!r.ok) toast.error(r.error);
        else router.refresh();
      });
    },
    [ingredientId, resolvedInventoryId, router],
  );

  return (
    <SearchableSelect
      className="inventory-stock-unit-select"
      options={options}
      value={normalized}
      onChange={handleChange}
      disabled={isPending}
      aria-label="Stock unit"
      bareInline
      placeholder="—"
    />
  );
}

function RecipeUnitCell({
  ingredientId,
  inventoryId,
  stockUnit,
  savedRecipeUnit,
}: {
  ingredientId: number;
  inventoryId: number | "";
  stockUnit: string;
  savedRecipeUnit: string;
}) {
  const router = useRouter();
  const resolvedInventoryId = normalizeInventoryId(inventoryId);
  const [isPending, startTransition] = useTransition();

  const effective = useMemo(() => {
    const savedNorm = canonicalIngredientUnit(savedRecipeUnit);
    if (savedNorm) return savedNorm;
    return defaultRecipeUnitForStockUnit(stockUnit);
  }, [savedRecipeUnit, stockUnit]);

  const options: SelectOption[] = useMemo(() => {
    const v = effective.trim();
    const base = RECIPE_UNITS.map((u) => ({ value: u, label: u }));
    if (v && !INGREDIENT_UNIT_VALUES.has(v)) {
      return [{ value: v, label: v }, ...base];
    }
    return base;
  }, [effective]);

  const handleChange = useCallback(
    (next: string) => {
      startTransition(async () => {
        const r = await updateRecipeUnitAction(
          next,
          resolvedInventoryId,
          ingredientId,
        );
        if (!r.ok) toast.error(r.error);
        else router.refresh();
      });
    },
    [ingredientId, resolvedInventoryId, router],
  );

  return (
    <SearchableSelect
      className="inventory-recipe-unit-select"
      options={options}
      value={effective}
      onChange={handleChange}
      disabled={isPending}
      aria-label="Recipe unit"
      bareInline
      placeholder="—"
    />
  );
}

export function InventoryTableView({
  ingredients,
  inventory,
  selectedIngredientId,
  onSelectIngredient,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const rows = useMemo<Row[]>(() => {
    const roots = ingredients.filter((ing) => !ing.parent_ingredient_id);
    return roots.map((ing) => {
      const invRow = getInventoryRowForIngredient(inventory, ing.id);
      const stock = getInventoryStockValuesUnified(ing, invRow);
      const category =
        ing.grocery_category?.trim() ||
        inferGroceryCategoryFromName(ing.name || "");
      return {
        ingredient: ing,
        name: ing.name || "",
        subcategory: ing.taxonomy_subcategory?.trim() || "",
        category,
        storageLocation: stock.storageLocation || "",
        stockUnit: stock.unit || "",
        recipeUnit: stock.recipeUnit || "",
        inventoryId: stock.inventoryId,
      };
    });
  }, [ingredients, inventory]);

  const sortedRows = useMemo<Row[]>(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const primary = (() => {
        switch (sortKey) {
          case "name":
            return compareStrings(a.name, b.name, sortDir);
          case "subcategory":
            return compareStrings(a.subcategory, b.subcategory, sortDir);
          case "category":
            return compareStrings(a.category, b.category, sortDir);
          case "storage_location":
            return compareStrings(a.storageLocation, b.storageLocation, sortDir);
          case "stock_unit":
            return compareStrings(a.stockUnit, b.stockUnit, sortDir);
          case "recipe_unit":
            return compareStrings(a.recipeUnit, b.recipeUnit, sortDir);
        }
      })();
      if (primary !== 0) return primary;
      // Stable secondary by name to avoid jittery ordering when primary ties.
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  if (rows.length === 0) {
    return (
      <p className="inventory-filter-empty" role="status">
        No ingredients match your filters.
      </p>
    );
  }

  return (
    <div className="table-container inventory-table inventory-sortable-table">
      <table className="ingredients-table inventory-table--compact">
        <thead>
          <tr>
            {COLUMNS.map((col) => {
              const active = col.key === sortKey;
              const nextDir = active
                ? sortDir === "asc"
                  ? "desc"
                  : "asc"
                : "asc";
              return (
                <th key={col.key} scope="col" className="inventory-sort-th">
                  <button
                    type="button"
                    className={`inventory-sort-btn${
                      active ? " inventory-sort-btn--active" : ""
                    }`}
                    aria-label={`Sort by ${col.label} ${nextDir === "asc" ? "ascending" : "descending"}`}
                    aria-sort={
                      active
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    onClick={() => handleSort(col.key)}
                  >
                    <span>{col.label}</span>
                    <span className="inventory-sort-indicator" aria-hidden>
                      {active && sortDir === "desc" ? (
                        <CaretDown size={12} weight="bold" />
                      ) : (
                        <CaretUp size={12} weight="bold" />
                      )}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => {
            const isSelected = row.ingredient.id === selectedIngredientId;
            return (
              <tr
                key={row.ingredient.id}
                data-ingredient-id={row.ingredient.id}
                className={`inventory-data-row${isSelected ? " inventory-row-selected" : ""}`}
                onClick={() => onSelectIngredient(row.ingredient.id)}
              >
                <td className="inventory-ingredient-name">
                  <span className="inventory-name-text">{row.name}</span>
                </td>
                <td>
                  <CellGuard>
                    <SubcategoryCell
                      ingredientId={row.ingredient.id}
                      value={row.subcategory}
                    />
                  </CellGuard>
                </td>
                <td>
                  <CellGuard>
                    <InventoryGroceryCategorySelect
                      ingredientId={row.ingredient.id}
                      value={row.ingredient.grocery_category ?? row.category}
                    />
                  </CellGuard>
                </td>
                <td>
                  <CellGuard>
                    <StorageLocationCell
                      ingredientId={row.ingredient.id}
                      inventoryId={row.inventoryId}
                      value={row.storageLocation}
                    />
                  </CellGuard>
                </td>
                <td>
                  <CellGuard>
                    <StockUnitCell
                      ingredientId={row.ingredient.id}
                      inventoryId={row.inventoryId}
                      value={row.stockUnit}
                    />
                  </CellGuard>
                </td>
                <td>
                  <CellGuard>
                    <RecipeUnitCell
                      ingredientId={row.ingredient.id}
                      inventoryId={row.inventoryId}
                      stockUnit={row.stockUnit}
                      savedRecipeUnit={row.recipeUnit}
                    />
                  </CellGuard>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
