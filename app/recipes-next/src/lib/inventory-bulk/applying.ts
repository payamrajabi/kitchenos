"use client";

/**
 * Tiny module-level applying-state tracker for the new bulk inventory flows
 * (add ingredients, update inventory from text). Mirrors the receipt
 * importer's `setApplying`/`useIsApplying` pair but lives in its own store
 * so the two flows don't clobber each other's pill labels.
 *
 * The label is the user-visible busy text the FAB pill shows while the
 * action is in flight (e.g. "Updating inventory…"). Setting it to null
 * clears the pill.
 */

import { useSyncExternalStore } from "react";

let label: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getSnapshot(): string | null {
  return label;
}

function getServerSnapshot(): string | null {
  return null;
}

export function setInventoryBulkBusy(next: string | null): void {
  if (label === next) return;
  label = next;
  emit();
}

export function useInventoryBulkBusy(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
