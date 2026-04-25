"use client";

/**
 * Persistent receipt-import queue.
 *
 * Why this exists:
 * - The receipt import dialog used to be modal — paste, wait, review, apply.
 *   The user wants it non-blocking instead: hit Import, the modal closes,
 *   parsing runs in the background, finished rows accumulate in a single
 *   review queue you can come back to whenever.
 * - Parsing is best-effort and may take 10–30s for an LLM round-trip.
 *   Surviving a hard refresh is a nice safety net so a long parse isn't
 *   thrown away by accidental navigation. We mirror the queue into
 *   `sessionStorage` for that reason; once the batch is reviewed and applied
 *   (or explicitly discarded), the storage entry is cleared.
 *
 * Shape:
 * - The queue is a flat list of "entries". Each entry is either a
 *   {kind: "batch"} parsing placeholder (one per Import click while in
 *   flight) or a {kind: "row", state: RowState} once the LLM returns.
 * - When a batch resolves, its placeholder entry is replaced in-place by N
 *   row entries (preserving list order so user-visible position is stable).
 *
 * Concurrency: dispatchParse() can be called any number of times; each call
 * spawns its own placeholder + background fetch. There is no global "is
 * parsing" lock.
 */

import { useSyncExternalStore } from "react";

import type { ParsedRow } from "@/app/actions/receipt-import";
import type { ProductPriceBasis } from "@/types/database";

const STORAGE_KEY = "kitchenos:receipt-import-queue:v1";

export type RowDecisionAction = "assign" | "create" | "ignore";

/**
 * UI-side editable mirror of a ParsedRow. All numeric fields are strings so
 * we don't fight controlled inputs; we coerce on Apply.
 */
export type RowState = {
  row: ParsedRow;
  action: RowDecisionAction;
  expanded: boolean;
  assignIngredientId: string;
  createName: string;
  quantity: string;
  unit: string;
  productName: string;
  productBrand: string;
  unitSizeAmount: string;
  unitSizeUnit: string;
  price: string;
  priceBasis: ProductPriceBasis | "";
  priceBasisAmount: string;
  priceBasisUnit: string;
  purchaseQuantity: string;
  purchaseUnit: string;
};

export type QueueBatchEntry = {
  kind: "batch";
  /** Stable id used as React key and as the lookup target on resolution. */
  id: string;
  /** First ~80 chars of the pasted text, for the placeholder label. */
  preview: string;
  /** Number of non-blank lines pasted; we use it as a "parsing N items…" hint. */
  pastedLineCount: number;
  /** Anything we want to surface if the parse failed instead of resolving. */
  error: string | null;
  startedAt: number;
  /** The full raw text the user pasted, retained so a failed batch can be
   * retried in place without making the user re-paste. Stripped from the
   * sessionStorage projection because it can be large. */
  rawText: string;
};

export type QueueRowEntry = {
  kind: "row";
  id: string;
  state: RowState;
};

export type QueueEntry = QueueBatchEntry | QueueRowEntry;

type Listener = (entries: QueueEntry[]) => void;

/* ---------- formatting helpers (mirrored on apply path too) ------------- */

function formatQty(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1000) / 1000);
}

function formatPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return n.toFixed(2);
}

export function rowStateFromParsed(row: ParsedRow): RowState {
  const hasSuggestion = row.suggestedIngredientId != null;
  return {
    row,
    action: row.excludedReason ? "ignore" : hasSuggestion ? "assign" : "create",
    expanded: false,
    assignIngredientId:
      row.suggestedIngredientId != null ? String(row.suggestedIngredientId) : "",
    createName: row.suggestedIngredientName ?? row.productName ?? row.rawLine,
    quantity: formatQty(row.quantityDelta),
    unit: row.unit ?? "",
    productName: row.productName ?? "",
    productBrand: row.productBrand ?? "",
    unitSizeAmount: formatQty(row.unitSizeAmount),
    unitSizeUnit: row.unitSizeUnit ?? "",
    price: formatPrice(row.price),
    priceBasis: row.priceBasis ?? (row.price != null ? "package" : ""),
    priceBasisAmount: formatQty(row.priceBasisAmount),
    priceBasisUnit: row.priceBasisUnit ?? "",
    purchaseQuantity: formatQty(row.purchaseQuantity),
    purchaseUnit: row.purchaseUnit ?? "",
  };
}

/* ---------- the singleton store ---------------------------------------- */

let entries: QueueEntry[] = [];
const listeners = new Set<Listener>();
let hydrated = false;
let counter = 0;

/** True while applyReceiptReviewAction is in flight. Surfaces as the
 * "Applying…" pill next to the FAB after the user hits Apply. */
let applying = false;
const applyListeners = new Set<() => void>();

function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      // Drop any in-flight batches: a hard refresh kills the in-memory promise
      // that would have resolved them, so leaving them as forever-spinners is
      // worse than dropping them. Resolved row entries survive.
      entries = parsed.filter(
        (entry): entry is QueueRowEntry =>
          entry != null &&
          typeof entry === "object" &&
          (entry as { kind?: unknown }).kind === "row",
      );
    }
  } catch {
    /* corrupted storage — ignore */
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    // Persist row entries only; batch placeholders are tied to in-memory
    // promises that don't survive a refresh.
    const rowEntries = entries.filter((e) => e.kind === "row");
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(rowEntries));
  } catch {
    /* quota exceeded or storage disabled — fail silently */
  }
}

function emit() {
  for (const listener of listeners) listener(entries);
}

function setEntries(next: QueueEntry[]) {
  entries = next;
  persist();
  emit();
}

export function getEntries(): QueueEntry[] {
  hydrate();
  return entries;
}

export function subscribe(listener: Listener): () => void {
  hydrate();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/* ---------- actions ----------------------------------------------------- */

export type DispatchParseDeps = {
  /** The server action that turns raw text into parsed rows. */
  importReceiptAction: (
    rawText: string,
  ) => Promise<{ ok: true; rows: ParsedRow[] } | { ok: false; error: string }>;
};

/**
 * Append a parsing placeholder and kick off a background parse. Returns the
 * batch id so callers can correlate. Multiple concurrent parses are fine.
 */
export function dispatchParse(
  rawText: string,
  deps: DispatchParseDeps,
): string {
  hydrate();
  const trimmed = rawText.trim();
  if (!trimmed) return "";
  const lineCount = trimmed
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean).length;

  const id = nextId("batch");
  const batch: QueueBatchEntry = {
    kind: "batch",
    id,
    preview: trimmed.slice(0, 80).replace(/\s+/g, " "),
    pastedLineCount: lineCount,
    error: null,
    startedAt: Date.now(),
    rawText: trimmed,
  };
  setEntries([...entries, batch]);

  void (async () => {
    try {
      const result = await deps.importReceiptAction(trimmed);
      const idx = entries.findIndex((e) => e.kind === "batch" && e.id === id);
      if (idx === -1) return; // batch was cancelled / cleared
      if (!result.ok) {
        const next = [...entries];
        next[idx] = { ...batch, error: result.error };
        setEntries(next);
        return;
      }
      const newRows: QueueRowEntry[] = result.rows.map((row) => ({
        kind: "row",
        id: nextId("row"),
        state: rowStateFromParsed(row),
      }));
      const next = [...entries];
      next.splice(idx, 1, ...newRows);
      setEntries(next);
    } catch (err) {
      const idx = entries.findIndex((e) => e.kind === "batch" && e.id === id);
      if (idx === -1) return;
      const next = [...entries];
      next[idx] = {
        ...batch,
        error:
          err instanceof Error
            ? err.message
            : "Could not parse the receipt. Try again.",
      };
      setEntries(next);
    }
  })();

  return id;
}

export function dismissBatch(id: string) {
  setEntries(entries.filter((e) => !(e.kind === "batch" && e.id === id)));
}

/**
 * Re-run the parse for a batch that previously errored. Removes the failed
 * placeholder and dispatches a fresh parse with the same raw text. The user
 * doesn't have to re-paste anything.
 */
export function retryBatch(id: string, deps: DispatchParseDeps): string {
  const target = entries.find(
    (e): e is QueueBatchEntry =>
      e.kind === "batch" && e.id === id && e.error != null,
  );
  if (!target) return "";
  setEntries(entries.filter((e) => !(e.kind === "batch" && e.id === id)));
  return dispatchParse(target.rawText, deps);
}

export function dismissRow(id: string) {
  setEntries(entries.filter((e) => !(e.kind === "row" && e.id === id)));
}

export function patchRow(id: string, patch: Partial<RowState>) {
  setEntries(
    entries.map((e) => {
      if (e.kind === "row" && e.id === id) {
        const merged: RowState = { ...e.state, ...patch };
        // Collapsing one row when another expands keeps the UI calm.
        return { ...e, state: merged };
      }
      // When a row is being expanded, fold every other row.
      if (
        patch.expanded === true &&
        e.kind === "row" &&
        e.id !== id &&
        e.state.expanded
      ) {
        return { ...e, state: { ...e.state, expanded: false } };
      }
      return e;
    }),
  );
}

/**
 * Promote an excluded row back into the active review list. Clears the
 * excludedReason on the underlying ParsedRow so the row classifies as
 * "review" instead of "excluded" downstream, and chooses a sane default
 * action based on whether the LLM had a suggestion.
 */
export function includeExcludedRow(id: string) {
  setEntries(
    entries.map((e) => {
      if (e.kind !== "row" || e.id !== id) return e;
      const hasSuggestion = e.state.row.suggestedIngredientId != null;
      return {
        ...e,
        state: {
          ...e.state,
          action: hasSuggestion ? "assign" : "create",
          row: { ...e.state.row, excludedReason: null },
        },
      };
    }),
  );
}

export function clearAll() {
  setEntries([]);
}

/** Remove only the row entries; leave any in-flight batches alone. */
export function clearRows() {
  setEntries(entries.filter((e) => e.kind === "batch"));
}

export function setApplying(next: boolean) {
  if (applying === next) return;
  applying = next;
  for (const fn of applyListeners) fn();
}

export function isApplying(): boolean {
  return applying;
}

function subscribeApplying(fn: () => void): () => void {
  applyListeners.add(fn);
  return () => {
    applyListeners.delete(fn);
  };
}

function getApplyingSnapshot(): boolean {
  return applying;
}

function getApplyingServerSnapshot(): boolean {
  return false;
}

/* ---------- React hook -------------------------------------------------- */

const EMPTY: QueueEntry[] = [];

function getServerSnapshot(): QueueEntry[] {
  return EMPTY;
}

export function useReceiptQueue(): QueueEntry[] {
  return useSyncExternalStore(subscribe, getEntries, getServerSnapshot);
}

export function useIsApplying(): boolean {
  return useSyncExternalStore(
    subscribeApplying,
    getApplyingSnapshot,
    getApplyingServerSnapshot,
  );
}

/* ---------- selectors --------------------------------------------------- */

export function summarizeQueue(entries: QueueEntry[]) {
  let pendingBatches = 0;
  let activeRows = 0; // rows that will be applied (not excluded, not ignored)
  let excludedRows = 0;
  let totalRows = 0;
  for (const entry of entries) {
    if (entry.kind === "batch") {
      pendingBatches += 1;
      continue;
    }
    totalRows += 1;
    if (entry.state.row.excludedReason || entry.state.action === "ignore") {
      if (entry.state.row.excludedReason) excludedRows += 1;
      continue;
    }
    activeRows += 1;
  }
  return { pendingBatches, activeRows, excludedRows, totalRows };
}

