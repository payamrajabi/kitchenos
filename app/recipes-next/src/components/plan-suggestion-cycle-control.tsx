"use client";

import { cycleMealPlanSuggestionAction } from "@/app/actions/meal-plan";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import {
  useTransition,
  type MouseEvent as ReactMouseEvent,
} from "react";

type Props = {
  entryId: number;
  pendingParent: boolean;
};

export function PlanSuggestionCycleControl({ entryId, pendingParent }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const busy = pendingParent || pending;

  const onClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    startTransition(async () => {
      const result = await cycleMealPlanSuggestionAction(entryId);
      if (result.ok) router.refresh();
    });
  };

  return (
    <div
      className="plan-suggestion-cycle"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="plan-suggestion-cycle-btn"
        aria-label="Show a different suggestion"
        title="Show a different suggestion"
        disabled={busy}
        onClick={onClick}
      >
        <ArrowsClockwise
          size={14}
          weight="bold"
          aria-hidden
          className={busy ? "is-spinning" : undefined}
        />
      </button>
    </div>
  );
}
