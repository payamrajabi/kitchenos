"use client";

import { X } from "@phosphor-icons/react";
import { type MouseEvent as ReactMouseEvent } from "react";

type Props = {
  pendingParent: boolean;
  onDismiss: () => void;
};

/**
 * Presentational "Remove this suggestion" button.
 *
 * Like the Cycle and Accept buttons, the parent (`PlanMealSlot`) owns the
 * state so the card can be hidden optimistically on click, with the
 * database delete happening in the background.
 */
export function PlanSuggestionDismissButton({ pendingParent, onDismiss }: Props) {
  const onClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (pendingParent) return;
    onDismiss();
  };

  return (
    <button
      type="button"
      className="plan-suggestion-dismiss"
      aria-label="Remove this suggestion"
      title="Remove this suggestion"
      disabled={pendingParent}
      onClick={onClick}
    >
      <X size={14} weight="bold" aria-hidden />
    </button>
  );
}
