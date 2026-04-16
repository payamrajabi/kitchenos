/**
 * Module-level singleton that manages countdown timers for recipe instruction
 * steps.  Lives outside React so timers survive page navigation.
 *
 * Supports range timers: a step can have a low and high bound (e.g. 30–35 min).
 * The countdown always runs to the HIGH value.  When the LOW milestone is
 * reached the `onMilestone` callback fires; when the HIGH end is reached
 * `onDone` fires.  For single-value timers, low === high and only `onDone`
 * fires.
 */

export type TimerEntry = {
  stepId: number;
  recipeName: string;
  stepLabel: string;
  /** Total countdown duration (the high end), in seconds. */
  totalSeconds: number;
  /** Low-end threshold in seconds (same as totalSeconds when no range). */
  lowSeconds: number;
  /** Seconds remaining right now. */
  remainingSeconds: number;
  /** Whether the low-end milestone has already fired. */
  lowFired: boolean;
};

type Listener = () => void;

export type TimerEvent =
  | { kind: "milestone"; entry: TimerEntry }
  | { kind: "done"; entry: TimerEntry };

let timers: Map<number, TimerEntry> = new Map();
let intervals: Map<number, ReturnType<typeof setInterval>> = new Map();
let listeners: Set<Listener> = new Set();
let eventCallbacks: Set<(event: TimerEvent) => void> = new Set();

function replaceTimers() {
  timers = new Map(timers);
}

function emit() {
  for (const fn of listeners) fn();
}

function fireEvent(event: TimerEvent) {
  for (const cb of eventCallbacks) cb(event);
}

export function addOnTimerEvent(cb: (event: TimerEvent) => void): () => void {
  eventCallbacks.add(cb);
  return () => { eventCallbacks.delete(cb); };
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getSnapshot(): Map<number, TimerEntry> {
  return timers;
}

export function startTimer(
  stepId: number,
  lowSeconds: number,
  highSeconds: number,
  recipeName: string,
  stepLabel: string,
) {
  stopTimer(stepId);

  const entry: TimerEntry = {
    stepId,
    recipeName,
    stepLabel,
    totalSeconds: highSeconds,
    lowSeconds,
    remainingSeconds: highSeconds,
    lowFired: lowSeconds >= highSeconds,
  };
  timers.set(stepId, entry);
  replaceTimers();
  emit();

  const iv = setInterval(() => {
    const current = timers.get(stepId);
    if (!current) {
      clearInterval(iv);
      intervals.delete(stepId);
      return;
    }

    const next = current.remainingSeconds - 1;

    if (next <= 0) {
      clearInterval(iv);
      intervals.delete(stepId);
      timers.delete(stepId);
      replaceTimers();
      emit();
      fireEvent({ kind: "done", entry: { ...current, remainingSeconds: 0 } });
      return;
    }

    const elapsed = current.totalSeconds - next;
    const lowThreshold = current.totalSeconds - current.lowSeconds;

    let lowFired = current.lowFired;
    if (!lowFired && elapsed >= lowThreshold) {
      lowFired = true;
      fireEvent({ kind: "milestone", entry: { ...current, remainingSeconds: next, lowFired: true } });
    }

    const inRangeZone = lowFired && current.lowSeconds < current.totalSeconds;
    if (inRangeZone) {
      const secsIntoRange = elapsed - lowThreshold;
      if (secsIntoRange > 0 && secsIntoRange % 60 === 0) {
        fireEvent({ kind: "milestone", entry: { ...current, remainingSeconds: next, lowFired: true } });
      }
    }

    timers.set(stepId, { ...current, remainingSeconds: next, lowFired });
    replaceTimers();
    emit();
  }, 1000);

  intervals.set(stepId, iv);
}

export function stopTimer(stepId: number) {
  const iv = intervals.get(stepId);
  if (iv != null) {
    clearInterval(iv);
    intervals.delete(stepId);
  }
  if (timers.delete(stepId)) {
    replaceTimers();
    emit();
  }
}

export function isRunning(stepId: number): boolean {
  return timers.has(stepId);
}

export function formatRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
