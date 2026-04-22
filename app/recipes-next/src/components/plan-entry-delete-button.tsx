"use client";

import { deleteMealPlanEntryAction } from "@/app/actions/meal-plan";
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

export function PlanEntryDeleteButton({ entryId, pendingParent }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const busy = pendingParent || pending;

  const onClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    startTransition(async () => {
      const result = await deleteMealPlanEntryAction(entryId);
      if (result.ok) router.refresh();
    });
  };

  return (
    <button
      type="button"
      className="plan-entry-delete"
      aria-label="Remove this meal from plan"
      title="Remove this meal from plan"
      disabled={busy}
      onClick={onClick}
    >
      <TrashSimple size={14} weight="bold" aria-hidden />
    </button>
  );
}
