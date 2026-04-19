"use client";

import {
  deleteMealPlanEntryAction,
  updateMealPlanEntryServingsAction,
} from "@/app/actions/meal-plan";
import { useDebouncedCommit } from "@/lib/use-debounced-commit";
import { Minus, Plus, Trash } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useTransition,
  type MouseEvent as ReactMouseEvent,
} from "react";

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
  const serverServings = normalizeServings(servingsProp);
  const [deletePending, startDeleteTransition] = useTransition();

  const commit = useCallback(
    (next: number) => updateMealPlanEntryServingsAction(entryId, next),
    [entryId],
  );

  const { value: servings, update, flush } = useDebouncedCommit<number>({
    value: serverServings,
    commit,
  });

  const busy = pendingParent || deletePending;

  const runDelete = () => {
    startDeleteTransition(async () => {
      const result = await deleteMealPlanEntryAction(entryId);
      if (result.ok) router.refresh();
    });
  };

  const onDecrement = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    if (servings <= 1) {
      flush();
      runDelete();
      return;
    }
    update(servings - 1);
  };

  const onIncrement = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy || servings >= 99) return;
    update(servings + 1);
  };

  const label = String(servings);

  return (
    <div
      className="plan-serving"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onMouseLeave={() => flush()}
      onBlur={() => flush()}
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
