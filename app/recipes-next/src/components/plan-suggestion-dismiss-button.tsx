"use client";

import { dismissMealPlanSuggestionAction } from "@/app/actions/meal-plan";
import { TrashSimple } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import {
  useTransition,
  type MouseEvent as ReactMouseEvent,
} from "react";

type Props = {
  entryId: number;
  pendingParent: boolean;
};

export function PlanSuggestionDismissButton({ entryId, pendingParent }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const busy = pendingParent || pending;

  const onClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    startTransition(async () => {
      const result = await dismissMealPlanSuggestionAction(entryId);
      if (result.ok) router.refresh();
    });
  };

  return (
    <button
      type="button"
      className="plan-suggestion-dismiss"
      aria-label="Remove this suggestion"
      title="Remove this suggestion"
      disabled={busy}
      onClick={onClick}
    >
      <TrashSimple size={14} weight="bold" aria-hidden />
    </button>
  );
}
