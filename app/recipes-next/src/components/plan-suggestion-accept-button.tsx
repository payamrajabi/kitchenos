"use client";

import { Check } from "@phosphor-icons/react";
import { type MouseEvent as ReactMouseEvent } from "react";

type Props = {
  pendingParent: boolean;
  onAccept: () => void;
};

/**
 * Presentational "Accept this suggestion" button.
 *
 * Like the Cycle button, the parent (`PlanMealSlot`) owns the state so the
 * card can flip from "suggestion" to "committed meal" optimistically on
 * click, with the database write happening in the background.
 */
export function PlanSuggestionAcceptButton({ pendingParent, onAccept }: Props) {
  const onClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (pendingParent) return;
    onAccept();
  };

  return (
    <button
      type="button"
      className="plan-suggestion-accept"
      aria-label="Accept this suggestion"
      title="Accept this suggestion"
      disabled={pendingParent}
      onClick={onClick}
    >
      <Check size={14} weight="bold" aria-hidden />
    </button>
  );
}
