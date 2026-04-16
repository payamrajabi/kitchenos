"use client";

import { updateInventoryQuantityFieldAction } from "@/app/actions/inventory";
import { Minus, Plus } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useTransition, type MouseEvent as ReactMouseEvent } from "react";

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

/**
 * Inline quantity pill — shows `{qty} {unit}` by default, expands to a
 * minus / number / plus control on hover (mirrors PlanEntryServingsControl
 * but sized for a table cell).
 */
export function InventoryQtyControl({
  ingredientId,
  inventoryId,
  quantity,
  unit,
  disabled = false,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const qty = Math.max(0, Math.floor(Number(quantity ?? 0)) || 0);
  const busy = pending || disabled;

  const runUpdate = (next: number) => {
    if (next < 0) return;
    startTransition(async () => {
      const result = await updateInventoryQuantityFieldAction(
        ingredientId,
        inventoryId,
        "quantity",
        next,
      );
      if (result.ok) router.refresh();
    });
  };

  const onDecrement = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy || qty <= 0) return;
    runUpdate(qty - 1);
  };

  const onIncrement = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    runUpdate(qty + 1);
  };

  const label = formatQty(qty);

  return (
    <div
      className="inventory-qty-control"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="inventory-qty-control-btn inventory-qty-control-btn--dec"
        aria-label={`Decrease ${unit || "quantity"} (currently ${formatQty(qty)})`}
        disabled={busy || qty <= 0}
        onClick={onDecrement}
      >
        <Minus size={12} weight="bold" aria-hidden />
      </button>
      <span className="inventory-qty-control-label">{label}</span>
      <button
        type="button"
        className="inventory-qty-control-btn inventory-qty-control-btn--inc"
        aria-label={`Increase ${unit || "quantity"}`}
        disabled={busy}
        onClick={onIncrement}
      >
        <Plus size={12} weight="bold" aria-hidden />
      </button>
    </div>
  );
}
