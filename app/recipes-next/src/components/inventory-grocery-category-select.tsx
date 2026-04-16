"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";
import { updateIngredientGroceryCategoryAction } from "@/app/actions/inventory";
import {
  INGREDIENT_GROCERY_CATEGORIES,
  isIngredientGroceryCategory,
} from "@/lib/ingredient-grocery-category";
import { SearchableSelect, type SelectOption } from "@/components/searchable-select";

export function InventoryGroceryCategorySelect({
  ingredientId,
  value,
  disabled: externalDisabled,
}: {
  ingredientId: number;
  value: string | null | undefined;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const options: SelectOption[] = useMemo(
    () => INGREDIENT_GROCERY_CATEGORIES.map((c) => ({ value: c, label: c })),
    [],
  );

  const selectValue = isIngredientGroceryCategory(value)
    ? value
    : INGREDIENT_GROCERY_CATEGORIES[0];

  const handleChange = useCallback(
    (next: string) => {
      startTransition(async () => {
        const r = await updateIngredientGroceryCategoryAction(ingredientId, next);
        if (r.ok) router.refresh();
      });
    },
    [ingredientId, router],
  );

  return (
    <SearchableSelect
      className="inventory-grocery-category-select"
      options={options}
      value={selectValue}
      onChange={handleChange}
      disabled={isPending || !!externalDisabled}
      aria-label="Grocery category"
      bareInline
    />
  );
}
