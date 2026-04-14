"use client";

import {
  deleteMealPlanEntryAction,
  updateMealPlanEntryServingsAction,
} from "@/app/actions/meal-plan";
import { Minus, Plus, Trash } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useTransition, type MouseEvent as ReactMouseEvent } from "react";

function normalizeServings(value: number | null | undefined): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 4;
  return Math.min(99, n);
}

type Props = {
  entryId: number;
  servingsProp: number | null | undefined;
  pendingParent: boolean;
};

export function PlanEntryServingsControl({
  entryId,
  servingsProp,
  pendingParent,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const servings = normalizeServings(servingsProp);
  const busy = pending || pendingParent;

  const runUpdate = (next: number) => {
    startTransition(async () => {
      const result = await updateMealPlanEntryServingsAction(entryId, next);
      if (result.ok) router.refresh();
    });
  };

  const runDelete = () => {
    startTransition(async () => {
      const result = await deleteMealPlanEntryAction(entryId);
      if (result.ok) router.refresh();
    });
  };

  const onDecrement = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    if (servings <= 1) {
      runDelete();
      return;
    }
    runUpdate(servings - 1);
  };

  const onIncrement = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy || servings >= 99) return;
    runUpdate(servings + 1);
  };

  const label = String(servings);

  return (
    <div
      className="plan-serving"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="plan-serving-btn plan-serving-btn--dec"
        aria-label={
          servings <= 1
            ? "Remove this meal from plan"
            : `Decrease servings (currently ${label})`
        }
        disabled={busy}
        onClick={onDecrement}
      >
        {servings <= 1 ? (
          <Trash size={14} weight="bold" aria-hidden />
        ) : (
          <Minus size={14} weight="bold" aria-hidden />
        )}
      </button>
      <span className="plan-serving-label">{label}</span>
      <button
        type="button"
        className="plan-serving-btn plan-serving-btn--inc"
        aria-label="Increase servings"
        disabled={busy || servings >= 99}
        onClick={onIncrement}
      >
        <Plus size={14} weight="bold" aria-hidden />
      </button>
    </div>
  );
}
