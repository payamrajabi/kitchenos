"use client";

/**
 * Add-ingredients review queue.
 *
 * Sister to `lib/inventory-bulk/queue.ts` (stocktake queue) but for the
 * "Add ingredients" flow. The shape is the same:
 *   user dispatch -> background LLM parse -> rows land here ->
 *   user reviews / edits per row -> apply server action creates them.
 *
 * In-memory only (no sessionStorage). The queue is small (one batch at a
 * time, only a few rows) so a navigation away mid-parse is annoying but
 * not catastrophic — the user just re-pastes their list.
 */

import { useSyncExternalStore } from "react";

import type {
  AddStorageLocation,
  ParsedAddIngredientItem,
} from "@/lib/inventory-bulk/parse-add-ingredients";
import type { IngredientStorageHint } from "@/types/database";

export type AddIngredientRowAction = "create" | "ignore";

/**
 * Editable mirror of a ParsedAddIngredientItem. Strings everywhere so
 * controlled inputs don't fight us; coercion happens on Apply.
 */
export type AddIngredientRowState = {
  row: ParsedAddIngredientItem;
  action: AddIngredientRowAction;
  expanded: boolean;
  /** Title-cased name to create. Empty when the user assigned to existing. */
  createName: string;
  /** "" or numeric id of the existing ingredient the user wants to map to. */
  assignIngredientId: string;
  /** Selected grocery category. */
  groceryCategory: string;
  /** Selected culinary subcategory (or empty for none). */
  taxonomySubcategory: string;
  /** Selected parent ingredient id, as string. Empty = no parent. */
  parentIngredientId: string;
  /** Display name of the chosen parent (for read-only chips). */
  parentIngredientName: string;
  /** Selected storage location for the inventory row. */
  storageLocation: AddStorageLocation | "";
  /** Background storage hints (counter / pantry / fridge / freezer). */
  storageHints: IngredientStorageHint[];
};

export type AddIngredientRowEntry = {
  id: string;
  state: AddIngredientRowState;
};

/* ---------- module state ----------------------------------------------- */

let parsing = false;
let parseError: string | null = null;
let entries: AddIngredientRowEntry[] = [];

const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

/* ---------- mutations -------------------------------------------------- */

export function setAddParsing(next: boolean): void {
  if (parsing === next) return;
  parsing = next;
  emit();
}

export function setAddParseError(next: string | null): void {
  if (parseError === next) return;
  parseError = next;
  emit();
}

export function setAddParsedRows(items: ParsedAddIngredientItem[]): void {
  entries = items.map((item, idx) => ({
    id: `add-${Date.now()}-${idx}`,
    state: rowStateFromParsed(item),
  }));
  parsing = false;
  parseError = null;
  emit();
}

function rowStateFromParsed(
  item: ParsedAddIngredientItem,
): AddIngredientRowState {
  const matched = item.matchedIngredientId != null;
  const isSkippable = Boolean(item.skipReason);
  return {
    row: item,
    // Filler / unparseable rows default to ignore so the user only confirms
    // the meaningful ones.
    action: isSkippable ? "ignore" : "create",
    expanded: false,
    createName:
      item.newIngredientName ?? item.matchedIngredientName ?? item.rawLine,
    assignIngredientId: matched ? String(item.matchedIngredientId) : "",
    groceryCategory: item.groceryCategory ?? "",
    taxonomySubcategory: item.taxonomySubcategory ?? "",
    parentIngredientId:
      item.parentIngredientId != null ? String(item.parentIngredientId) : "",
    parentIngredientName: item.parentIngredientName ?? "",
    storageLocation: item.storageLocation ?? "",
    storageHints: item.storageHints ?? [],
  };
}

export function patchAddRow(
  id: string,
  patch: Partial<AddIngredientRowState>,
): void {
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return;
  entries = entries.slice();
  entries[idx] = {
    ...entries[idx],
    state: { ...entries[idx].state, ...patch },
  };
  emit();
}

export function dismissAddRow(id: string): void {
  entries = entries.filter((e) => e.id !== id);
  emit();
}

export function ignoreAddRow(id: string): void {
  patchAddRow(id, { action: "ignore", expanded: false });
}

export function reviveIgnoredAddRow(id: string): void {
  patchAddRow(id, { action: "create", expanded: false });
}

export function clearAddIngredientsQueue(): void {
  entries = [];
  parsing = false;
  parseError = null;
  emit();
}

/* ---------- selectors -------------------------------------------------- */

export function isAddParsing(): boolean {
  return parsing;
}

export function getAddIngredientsEntries(): AddIngredientRowEntry[] {
  return entries;
}

export function getAddParseError(): string | null {
  return parseError;
}

export function activeAddRowCount(rows: AddIngredientRowEntry[]): number {
  let n = 0;
  for (const e of rows) if (e.state.action === "create") n += 1;
  return n;
}

/* ---------- React hooks ----------------------------------------------- */

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const EMPTY: AddIngredientRowEntry[] = [];

function getServerEntries(): AddIngredientRowEntry[] {
  return EMPTY;
}

function getServerBool(): boolean {
  return false;
}

function getServerString(): string | null {
  return null;
}

export function useAddIngredientsEntries(): AddIngredientRowEntry[] {
  return useSyncExternalStore(
    subscribe,
    getAddIngredientsEntries,
    getServerEntries,
  );
}

export function useIsAddParsing(): boolean {
  return useSyncExternalStore(subscribe, isAddParsing, getServerBool);
}

export function useAddParseError(): string | null {
  return useSyncExternalStore(subscribe, getAddParseError, getServerString);
}
