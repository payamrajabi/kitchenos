"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { updateInventoryQuantityFieldAction } from "@/app/actions/inventory";
import { normalizeInventoryId } from "@/lib/inventory-display";

function toInputString(n: number | null): string {
  if (n === null || n === undefined) return "";
  if (Number.isNaN(Number(n))) return "";
  return String(Math.trunc(Number(n)));
}

/** Peer bound: null / invalid → 0 (empty defaults to zero). */
function peerBound(n: number | null | undefined): number {
  if (n === null || n === undefined) return 0;
  const t = Math.trunc(Number(n));
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, t);
}

function initialCommitted(n: number | null): number | null {
  if (n === null || n === undefined) return null;
  const t = Math.trunc(Number(n));
  return Number.isNaN(t) ? null : t;
}

/**
 * Commit parse: blank → 0. Invalid or negative → reject (caller reverts).
 */
function parseCommit(raw: string): { ok: true; n: number } | { ok: false } {
  const t = raw.trim();
  if (t === "") return { ok: true, n: 0 };
  const v = Number(t);
  if (!Number.isFinite(v)) return { ok: false };
  const n = Math.trunc(v);
  if (n < 0) return { ok: false };
  return { ok: true, n };
}

function isAllowedValue(
  field: "quantity" | "min_quantity" | "max_quantity",
  n: number,
  minBound: number | null | undefined,
  maxBound: number | null | undefined,
): boolean {
  if (n < 0) return false;
  if (field === "min_quantity" && maxBound !== undefined) {
    if (n > peerBound(maxBound)) return false;
  }
  if (field === "max_quantity" && minBound !== undefined) {
    if (n < peerBound(minBound)) return false;
  }
  return true;
}

export function InventoryQtyField({
  ingredientId,
  inventoryId,
  field,
  initialValue,
  ariaLabel,
  minBound,
  maxBound,
  disabled: externalDisabled,
}: {
  ingredientId: number;
  inventoryId: number | "";
  field: "quantity" | "min_quantity" | "max_quantity";
  initialValue: number | null;
  ariaLabel: string;
  /** For max field: current minimum (null = 0). */
  minBound?: number | null;
  /** For min field: current maximum (null = 0). */
  maxBound?: number | null;
  disabled?: boolean;
}) {
  const resolvedInventoryId = useMemo(
    () => normalizeInventoryId(inventoryId),
    [inventoryId],
  );
  const [text, setText] = useState(() => toInputString(initialValue));
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setText(toInputString(initialValue));
  }, [initialValue]);

  const revertDisplay = useCallback(() => {
    setText(toInputString(initialValue));
  }, [initialValue]);

  const persist = useCallback(
    (raw: string) => {
      const parsed = parseCommit(raw);
      if (!parsed.ok) {
        revertDisplay();
        return;
      }
      if (!isAllowedValue(field, parsed.n, minBound, maxBound)) {
        revertDisplay();
        return;
      }
      const prev = initialCommitted(initialValue);
      if (prev !== null && parsed.n === prev) return;

      startTransition(async () => {
        await updateInventoryQuantityFieldAction(
          ingredientId,
          resolvedInventoryId,
          field,
          parsed.n,
        );
      });
    },
    [
      ingredientId,
      resolvedInventoryId,
      field,
      initialValue,
      minBound,
      maxBound,
      revertDisplay,
    ],
  );

  const fieldDisabled = isPending || !!externalDisabled;

  return (
    <div className={`inventory-qty-wrap${externalDisabled ? " inventory-qty-locked" : ""}`}>
      <input
        type="text"
        inputMode="numeric"
        className="inventory-qty-input"
        value={text}
        aria-label={ariaLabel}
        disabled={fieldDisabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => persist(text)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}
