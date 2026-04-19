"use client";

import { updateInventoryQuantityFieldAction } from "@/app/actions/inventory";
import { useDebouncedCommit } from "@/lib/use-debounced-commit";
import { Minus, Plus } from "@phosphor-icons/react";
import { useCallback, type MouseEvent as ReactMouseEvent } from "react";

type Props = {
  ingredientId: number;
  inventoryId: number | "";
  quantity: number | null;
  unit: string;
  disabled?: boolean;
};

function formatQty(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

function normalizeQty(value: number | null): number {
  return Math.max(0, Math.floor(Number(value ?? 0)) || 0);
}

/**
 * Inline quantity pill — shows `{qty} {unit}` by default, expands to a
 * minus / number / plus control on hover (mirrors PlanEntryServingsControl
 * but sized for a table cell).
 *
 * Clicks update the displayed number immediately. The server write is
 * debounced so rapid clicks feel instant and only the final value is sent.
 */
export function InventoryQtyControl({
  ingredientId,
  inventoryId,
  quantity,
  unit,
  disabled = false,
}: Props) {
  const serverQty = normalizeQty(quantity);

  const commit = useCallback(
    (next: number) =>
      updateInventoryQuantityFieldAction(
        ingredientId,
        inventoryId,
        "quantity",
        next,
      ),
    [ingredientId, inventoryId],
  );

  const { value: qty, update, flush } = useDebouncedCommit<number>({
    value: serverQty,
    commit,
  });

  const onDecrement = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled || qty <= 0) return;
    update(qty - 1);
  };

  const onIncrement = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    update(qty + 1);
  };

  const label = formatQty(qty);

  return (
    <div
      className="inventory-qty-control"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onMouseLeave={() => flush()}
      onBlur={() => flush()}
    >
      <button
        type="button"
        className="inventory-qty-control-btn inventory-qty-control-btn--dec"
        aria-label={`Decrease ${unit || "quantity"} (currently ${formatQty(qty)})`}
        disabled={disabled || qty <= 0}
        onClick={onDecrement}
      >
        <Minus size={12} weight="bold" aria-hidden />
      </button>
      <span className="inventory-qty-control-label">{label}</span>
      <button
        type="button"
        className="inventory-qty-control-btn inventory-qty-control-btn--inc"
        aria-label={`Increase ${unit || "quantity"}`}
        disabled={disabled}
        onClick={onIncrement}
      >
        <Plus size={12} weight="bold" aria-hidden />
      </button>
    </div>
  );
}
