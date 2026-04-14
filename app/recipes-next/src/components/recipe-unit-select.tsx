"use client";

import { useCallback, useMemo, useTransition } from "react";
import { updateRecipeUnitAction } from "@/app/actions/inventory";
import {
  canonicalIngredientUnit,
  defaultRecipeUnitForStockUnit,
  INGREDIENT_UNIT_VALUES,
  RECIPE_UNITS,
} from "@/lib/unit-mapping";
import { normalizeInventoryId } from "@/lib/inventory-display";
import { SearchableSelect, type SelectOption } from "@/components/searchable-select";

export function RecipeUnitSelect({
  ingredientId,
  inventoryId,
  stockUnit,
  savedRecipeUnit,
  disabled: externalDisabled,
}: {
  ingredientId: number;
  inventoryId: number | "";
  stockUnit: string;
  savedRecipeUnit: string;
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  const effectiveValue = useMemo(() => {
    const savedNorm = canonicalIngredientUnit(savedRecipeUnit);
    if (savedNorm) return savedNorm;
    return defaultRecipeUnitForStockUnit(stockUnit);
  }, [savedRecipeUnit, stockUnit]);

  const options: SelectOption[] = useMemo(() => {
    const v = effectiveValue.trim();
    const base = RECIPE_UNITS.map((u) => ({ value: u, label: u }));
    if (v && !INGREDIENT_UNIT_VALUES.has(v)) {
      return [{ value: v, label: v }, ...base];
    }
    return base;
  }, [effectiveValue]);

  const selectValue =
    effectiveValue && options.some((o) => o.value === effectiveValue) ? effectiveValue : effectiveValue || "";

  const resolvedInventoryId = normalizeInventoryId(inventoryId);

  const handleChange = useCallback(
    (next: string) => {
      startTransition(async () => {
        await updateRecipeUnitAction(next, resolvedInventoryId, ingredientId);
      });
    },
    [resolvedInventoryId, ingredientId],
  );

  return (
    <SearchableSelect
      className="inventory-unit-select"
      options={options}
      value={selectValue}
      onChange={handleChange}
      disabled={isPending || !!externalDisabled}
      aria-label="Recipe unit"
    />
  );
}
