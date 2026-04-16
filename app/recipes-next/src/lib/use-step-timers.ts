"use client";

import { useSyncExternalStore } from "react";
import {
  subscribe,
  getSnapshot,
  type TimerEntry,
} from "@/lib/step-timer-store";

export function useStepTimers(): Map<number, TimerEntry> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
