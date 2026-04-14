"use client";

import { useCallback, useMemo, useTransition } from "react";
import { updateInventoryStockUnitAction } from "@/app/actions/inventory";
import { normalizeInventoryId } from "@/lib/inventory-display";
import { canonicalIngredientUnit } from "@/lib/unit-mapping";
import { STOCK_UNIT_OPTIONS, STOCK_UNIT_VALUES } from "@/lib/stock-units";
import { SearchableSelect, type SelectOption } from "@/components/searchable-select";

export function InventoryStockUnitSelect({
  ingredientId,
  inventoryId,
  value,
  disabled: externalDisabled,
}: {
  ingredientId: number;
  inventoryId: number | "";
  value: string;
  disabled?: boolean;
}) {
  const resolvedInventoryId = normalizeInventoryId(inventoryId);
  const [isPending, startTransition] = useTransition();

  const normalizedValue = canonicalIngredientUnit(value);

  const options: SelectOption[] = useMemo(() => {
    const v = normalizedValue.trim();
    if (v && !STOCK_UNIT_VALUES.has(v)) {
      return [{ value: v, label: v }, ...STOCK_UNIT_OPTIONS];
    }
    return STOCK_UNIT_OPTIONS;
  }, [normalizedValue]);

  const selectValue =
    normalizedValue && options.some((o) => o.value === normalizedValue)
      ? normalizedValue
      : normalizedValue || "";

  const handleChange = useCallback(
    (next: string) => {
      startTransition(async () => {
        await updateInventoryStockUnitAction(ingredientId, resolvedInventoryId, next);
      });
    },
    [ingredientId, resolvedInventoryId],
  );

  return (
    <SearchableSelect
      className="inventory-unit-select"
      options={options}
      value={selectValue}
      onChange={handleChange}
      disabled={isPending || !!externalDisabled}
      aria-label="Stock unit"
    />
  );
}
