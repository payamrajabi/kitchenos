"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { updateIngredientNameAction } from "@/app/actions/inventory";

export function EditableIngredientName({
  ingredientId,
  initialName,
}: {
  ingredientId: number;
  initialName: string;
}) {
  const [value, setValue] = useState(initialName);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setValue(initialName);
  }, [initialName]);

  const save = useCallback(() => {
    const next = value.trim();
    if (next === (initialName || "").trim()) return;
    startTransition(async () => {
      await updateIngredientNameAction(ingredientId, next);
    });
  }, [ingredientId, initialName, value]);

  return (
    <input
      type="text"
      className="inventory-name-input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      disabled={isPending}
      aria-label="Ingredient name"
    />
  );
}
