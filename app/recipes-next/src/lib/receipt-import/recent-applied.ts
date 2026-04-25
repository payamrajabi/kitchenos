"use client";

/**
 * Ephemeral "just applied from a receipt" marker. We keep a Set of ingredient
 * ids that were touched by the most recent apply action so the inventory list
 * can flash them with a faint yellow background. The Set lives only in
 * memory — a hard refresh clears it, which matches the user's "this session
 * only" expectation.
 */

import { useSyncExternalStore } from "react";

const applied = new Set<number>();
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function markApplied(ids: number[]) {
  let changed = false;
  for (const id of ids) {
    if (!applied.has(id)) {
      applied.add(id);
      changed = true;
    }
  }
  if (changed) emit();
}

export function clearApplied() {
  if (applied.size === 0) return;
  applied.clear();
  emit();
}

export function hasRecentApplied(id: number): boolean {
  return applied.has(id);
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getSnapshot(): ReadonlySet<number> {
  return applied;
}

function getServerSnapshot(): ReadonlySet<number> {
  return applied;
}

/**
 * Hook returning a stable snapshot of the applied-ids set. Components that
 * only need a single id can read via hasRecentApplied() directly, but this
 * hook exists to plug into React's update cycle when the Set changes.
 */
export function useRecentAppliedSet(): ReadonlySet<number> {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
