"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { addOnTimerEvent, type TimerEvent } from "@/lib/step-timer-store";
import { startAlarm, stopAlarm, playNudge } from "@/lib/kitchen-alarm";

/**
 * Mount once in the root layout.  Handles two event types from the timer store:
 *
 * - **milestone** (low-end reached, or per-minute reminder) — plays a brief
 *   2-loop nudge chime. No persistent toast.
 * - **done** (high-end reached) — starts continuous alarm + shows a persistent
 *   toast that must be dismissed to stop the sound.
 */
export function StepTimerWatcher() {
  const alarmCountRef = useRef(0);

  useEffect(() => {
    return addOnTimerEvent((event: TimerEvent) => {
      if (event.kind === "milestone") {
        playNudge(3);
        return;
      }

      alarmCountRef.current += 1;
      if (alarmCountRef.current === 1) {
        startAlarm();
      }

      const { entry } = event;
      const stepSnippet =
        entry.stepLabel.length > 60
          ? entry.stepLabel.slice(0, 57) + "…"
          : entry.stepLabel;

      const mins = Math.round(entry.totalSeconds / 60);
      const label = mins >= 1 ? `${mins} min` : `${entry.totalSeconds}s`;

      toast(`Timer done — ${label}`, {
        description: `${entry.recipeName}: ${stepSnippet}`,
        duration: Infinity,
        className: "step-timer-toast",
        onDismiss: () => {
          alarmCountRef.current = Math.max(0, alarmCountRef.current - 1);
          if (alarmCountRef.current === 0) {
            stopAlarm();
          }
        },
        onAutoClose: () => {
          alarmCountRef.current = Math.max(0, alarmCountRef.current - 1);
          if (alarmCountRef.current === 0) {
            stopAlarm();
          }
        },
      });
    });
  }, []);

  return null;
}
