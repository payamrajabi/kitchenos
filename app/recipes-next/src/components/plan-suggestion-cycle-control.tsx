"use client";

import { ArrowsClockwise } from "@phosphor-icons/react";
import {
  type MouseEvent as ReactMouseEvent,
} from "react";

type Props = {
  pendingParent: boolean;
  onCycle: () => void;
  /** True while the slow-path LLM call is in flight; shows a spinning icon. */
  isSpinning?: boolean;
};

/**
 * Presentational "show a different suggestion" button.
 *
 * Kept intentionally dumb: the parent component (`PlanMealSlot`) owns the
 * pool state so it can do an optimistic swap on the client BEFORE the server
 * writes finish. See `handleCycleSuggestion` in plan-meal-slot.tsx.
 */
export function PlanSuggestionCycleControl({
  pendingParent,
  onCycle,
  isSpinning = false,
}: Props) {
  const busy = pendingParent || isSpinning;

  const onClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (pendingParent) return;
    onCycle();
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
          className={isSpinning ? "is-spinning" : undefined}
        />
      </button>
    </div>
  );
}
