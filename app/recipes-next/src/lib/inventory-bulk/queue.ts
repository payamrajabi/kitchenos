"use client";

/**
 * Stocktake review queue.
 *
 * The "Update inventory" flow used to apply directly. Now it mirrors the
 * receipt log review pattern: dispatch parse → modal closes → background
 * LLM call → results land here → user reviews/edits → confirms → server
 * action overwrites stock + (optionally) zeroes-out unmentioned items in
 * checked storage locations.
 *
 * Smaller cousin of `lib/receipt-import/queue.ts`:
 * - One in-flight parse at a time (single LLM call, no chunking).
 * - In-memory only (no sessionStorage). If you accidentally navigate away
 *   mid-parse, you'll need to re-dictate. Re-dictation is cheap and the
 *   queue isn't reviewing many rows so this is an acceptable trade-off.
 * - Three "zero out anything I didn't mention in this location" booleans
 *   that travel with the queue (so they survive re-opening the dialog).
 */

import { useSyncExternalStore } from "react";

import type { ParsedStocktakeItem } from "@/lib/inventory-bulk/parse-inventory-update";

export type StocktakeRowAction = "set" | "ignore";

/**
 * UI-side editable mirror of a ParsedStocktakeItem. Numeric fields are
 * kept as strings so we don't fight controlled inputs; we coerce on Apply.
 */
export type StocktakeRowState = {
  row: ParsedStocktakeItem;
  action: StocktakeRowAction;
  expanded: boolean;
  /** "" or the numeric id of the existing ingredient, as a string. */
  assignIngredientId: string;
  /** Title-cased name to create when no existing match is chosen. */
  createName: string;
  quantity: string;
  unit: string;
  /** Optional preferred-product fields. Populated by the LLM when the
   *  user named a brand; otherwise blank and no preferred product is
   *  written on apply. */
  productName: string;
  productBrand: string;
  unitSizeAmount: string;
  unitSizeUnit: string;
};

export type StocktakeRowEntry = {
  id: string;
  state: StocktakeRowState;
};

export type ZeroOutFlags = {
  fridge: boolean;
  freezer: boolean;
  pantry: boolean;
};

/* ---------- module state ----------------------------------------------- */

let parsing = false;
let parseError: string | null = null;
let entries: StocktakeRowEntry[] = [];
let zeroOut: ZeroOutFlags = { fridge: false, freezer: false, pantry: false };

const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

/* ---------- mutations -------------------------------------------------- */

export function setParsing(next: boolean): void {
  if (parsing === next) return;
  parsing = next;
  emit();
}

export function setParseError(next: string | null): void {
  if (parseError === next) return;
  parseError = next;
  emit();
}

/**
 * Replace the queue with a freshly parsed batch. Defaults each row to
 * "set" action and collapses them; the user can expand to edit.
 */
export function setParsedRows(items: ParsedStocktakeItem[]): void {
  entries = items.map((item, idx) => ({
    id: `s-${Date.now()}-${idx}`,
    state: rowStateFromParsed(item),
  }));
  parsing = false;
  parseError = null;
  emit();
}

function rowStateFromParsed(item: ParsedStocktakeItem): StocktakeRowState {
  const matched = item.matchedIngredientId != null;
  const isSkippable = Boolean(item.skipReason) || item.quantity == null;
  return {
    row: item,
    // Phrases the LLM marked as "no quantity" / "filler" default to ignore
    // so the user only has to confirm the meaningful rows.
    action: isSkippable ? "ignore" : "set",
    expanded: false,
    assignIngredientId: matched ? String(item.matchedIngredientId) : "",
    createName:
      item.newIngredientName ?? item.matchedIngredientName ?? "",
    quantity: item.quantity != null ? String(item.quantity) : "",
    unit: item.unit ?? "",
    productName: item.productName ?? "",
    productBrand: item.productBrand ?? "",
    unitSizeAmount:
      item.unitSizeAmount != null ? String(item.unitSizeAmount) : "",
    unitSizeUnit: item.unitSizeUnit ?? "",
  };
}

export function patchRow(id: string, patch: Partial<StocktakeRowState>): void {
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return;
  entries = entries.slice();
  entries[idx] = { ...entries[idx], state: { ...entries[idx].state, ...patch } };
  emit();
}

export function dismissRow(id: string): void {
  entries = entries.filter((e) => e.id !== id);
  emit();
}

export function ignoreRow(id: string): void {
  patchRow(id, { action: "ignore", expanded: false });
}

export function reviveIgnoredRow(id: string): void {
  patchRow(id, { action: "set", expanded: false });
}

export function setZeroOut(next: Partial<ZeroOutFlags>): void {
  zeroOut = { ...zeroOut, ...next };
  emit();
}

export function clearStocktakeQueue(): void {
  entries = [];
  zeroOut = { fridge: false, freezer: false, pantry: false };
  parsing = false;
  parseError = null;
  emit();
}

/* ---------- selectors -------------------------------------------------- */

export function isParsing(): boolean {
  return parsing;
}

export function getStocktakeEntries(): StocktakeRowEntry[] {
  return entries;
}

export function getZeroOut(): ZeroOutFlags {
  return zeroOut;
}

export function getParseError(): string | null {
  return parseError;
}

/** Number of rows the user has chosen to apply. */
export function activeStocktakeRowCount(rows: StocktakeRowEntry[]): number {
  let n = 0;
  for (const e of rows) {
    if (e.state.action === "set") n += 1;
  }
  return n;
}

/* ---------- React hooks ----------------------------------------------- */

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const EMPTY: StocktakeRowEntry[] = [];

function getServerEntries(): StocktakeRowEntry[] {
  return EMPTY;
}

function getServerBool(): boolean {
  return false;
}

function getServerString(): string | null {
  return null;
}

const NEUTRAL_ZERO_OUT: ZeroOutFlags = {
  fridge: false,
  freezer: false,
  pantry: false,
};

function getServerZeroOut(): ZeroOutFlags {
  return NEUTRAL_ZERO_OUT;
}

export function useStocktakeEntries(): StocktakeRowEntry[] {
  return useSyncExternalStore(subscribe, getStocktakeEntries, getServerEntries);
}

export function useIsParsing(): boolean {
  return useSyncExternalStore(subscribe, isParsing, getServerBool);
}

export function useStocktakeParseError(): string | null {
  return useSyncExternalStore(subscribe, getParseError, getServerString);
}

export function useZeroOut(): ZeroOutFlags {
  return useSyncExternalStore(subscribe, getZeroOut, getServerZeroOut);
}
