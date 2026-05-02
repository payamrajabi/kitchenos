"use client";

import { CircleNotch, Plus } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ReceiptImportDialog,
  type ReceiptImportMode,
} from "@/components/receipt-import-dialog";
import { AddIngredientDialog } from "@/components/add-ingredient-dialog";
import { UpdateInventoryDialog } from "@/components/update-inventory-dialog";
import { StocktakeReviewDialog } from "@/components/stocktake-review-dialog";
import { AddIngredientsReviewDialog } from "@/components/add-ingredients-review-dialog";
import {
  summarizeQueue,
  useIsApplying,
  useReceiptQueue,
} from "@/lib/receipt-import/queue";
import { useInventoryBulkBusy } from "@/lib/inventory-bulk/applying";
import {
  useIsParsing as useStocktakeParsing,
  useStocktakeEntries,
} from "@/lib/inventory-bulk/queue";
import {
  useAddIngredientsEntries,
  useIsAddParsing,
} from "@/lib/inventory-bulk/add-ingredients-queue";

type Props = {
  /** Inventory ingredients available for assignment in receipt + add review.
   *  parentIngredientId is included so the add-ingredient review can offer
   *  only root ingredients as parent candidates. */
  ingredients: {
    id: number;
    name: string;
    parentIngredientId?: number | null;
  }[];
};

type FabBadgeAction =
  | "none"
  | "open-receipt-queue"
  | "open-stocktake-review"
  | "open-add-review";

type FabBadge = {
  label: string;
  busy: boolean;
  action: FabBadgeAction;
};

/**
 * Consolidated bottom-right FAB for the inventory page. One floating "+"
 * button that fans out into three entry points: Add ingredient, Update
 * inventory, Log receipt. Each option opens a sibling dialog.
 *
 * The receipt review pill from the old `ReceiptImportFab` lives here too,
 * so the user still sees "3 to review" / "Reading receipt…" / "Applying…"
 * next to the FAB even though the dialog itself is now decoupled.
 */
export function InventoryActionsFab({ ingredients }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const [receiptMode, setReceiptMode] = useState<ReceiptImportMode>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [addReviewOpen, setAddReviewOpen] = useState(false);

  const entries = useReceiptQueue();
  const receiptApplying = useIsApplying();
  const bulkBusy = useInventoryBulkBusy();
  const stocktakeParsing = useStocktakeParsing();
  const stocktakeEntries = useStocktakeEntries();
  const addParsing = useIsAddParsing();
  const addEntries = useAddIngredientsEntries();
  const summary = useMemo(() => summarizeQueue(entries), [entries]);

  // Pill priority: in-flight beats "to review", and the most recently
  // started flow wins ties. We surface only one pill at a time to keep the
  // FAB area calm — if a user has both a stocktake review and a receipt
  // review queued, they'll see the stocktake first (since it's more
  // immediately actionable for the user who just dictated it).
  const fabBadge: FabBadge | null = (() => {
    if (bulkBusy) {
      return { label: bulkBusy, busy: true, action: "none" };
    }
    if (receiptApplying) {
      return { label: "Applying…", busy: true, action: "none" };
    }
    if (addParsing) {
      return {
        label: "Classifying ingredients…",
        busy: true,
        action: "open-add-review",
      };
    }
    if (addEntries.length > 0) {
      const activeCount = addEntries.filter(
        (e) => e.state.action === "create",
      ).length;
      return {
        label: `Review new ingredients${activeCount > 0 ? ` (${activeCount})` : ""}`,
        busy: false,
        action: "open-add-review",
      };
    }
    if (stocktakeParsing) {
      return {
        label: "Reading stocktake…",
        busy: true,
        action: "open-stocktake-review",
      };
    }
    if (stocktakeEntries.length > 0) {
      const activeCount = stocktakeEntries.filter(
        (e) => e.state.action === "set",
      ).length;
      return {
        label: `Review stocktake${activeCount > 0 ? ` (${activeCount})` : ""}`,
        busy: false,
        action: "open-stocktake-review",
      };
    }
    if (summary.pendingBatches > 0 && summary.totalRows === 0) {
      return {
        label: "Reading receipt…",
        busy: true,
        action: "open-receipt-queue",
      };
    }
    if (summary.activeRows > 0) {
      return {
        label: `${summary.activeRows} to review`,
        busy: summary.pendingBatches > 0,
        action: "open-receipt-queue",
      };
    }
    return null;
  })();

  // Close the menu on outside click. The dialogs use the native top-layer so
  // clicks inside them don't bubble up to the document; this only fires for
  // genuine clicks outside the wrap.
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  // Close the menu on Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const handleAdd = useCallback(() => {
    setMenuOpen(false);
    setAddOpen(true);
  }, []);

  const handleUpdate = useCallback(() => {
    setMenuOpen(false);
    setUpdateOpen(true);
  }, []);

  const handleReceipt = useCallback(() => {
    setMenuOpen(false);
    setReceiptMode("input");
  }, []);

  const handlePillClick = useCallback(() => {
    if (!fabBadge) return;
    if (fabBadge.action === "open-receipt-queue") setReceiptMode("queue");
    else if (fabBadge.action === "open-stocktake-review") setReviewOpen(true);
    else if (fabBadge.action === "open-add-review") setAddReviewOpen(true);
  }, [fabBadge]);

  // The input dialog already closed itself when the user hit Review. We
  // do NOT open the review dialog here — the user gets the pill in the
  // bottom-right corner and can tap it when the parse is ready, mirroring
  // the receipt importer's fire-and-forget UX.

  return (
    <>
      <div className="inventory-actions-fab-wrap" ref={wrapRef}>
        {fabBadge ? (
          <button
            type="button"
            className={`inventory-receipt-pill${
              fabBadge.busy ? " is-busy" : ""
            }`}
            onClick={handlePillClick}
            disabled={fabBadge.action === "none"}
            aria-label={fabBadge.label}
          >
            {fabBadge.busy ? (
              <CircleNotch
                size={16}
                weight="bold"
                className="inventory-receipt-pill-spinner"
                aria-hidden
              />
            ) : null}
            <span>{fabBadge.label}</span>
          </button>
        ) : null}

        {menuOpen ? (
          <div
            className="inventory-actions-fab-menu"
            role="menu"
            aria-label="Inventory actions"
          >
            <button
              type="button"
              role="menuitem"
              className="inventory-actions-fab-menu-item"
              onClick={handleAdd}
            >
              Add ingredient
            </button>
            <button
              type="button"
              role="menuitem"
              className="inventory-actions-fab-menu-item"
              onClick={handleUpdate}
            >
              Update inventory
            </button>
            <button
              type="button"
              role="menuitem"
              className="inventory-actions-fab-menu-item"
              onClick={handleReceipt}
            >
              Log receipt
            </button>
          </div>
        ) : null}

        <button
          type="button"
          className={`inventory-actions-fab${menuOpen ? " is-open" : ""}`}
          aria-label="Inventory actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <Plus size={22} weight="bold" color="var(--paper)" aria-hidden />
        </button>
      </div>

      <AddIngredientDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
      />
      <UpdateInventoryDialog
        open={updateOpen}
        onClose={() => setUpdateOpen(false)}
      />
      <StocktakeReviewDialog
        ingredients={ingredients}
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
      />
      <AddIngredientsReviewDialog
        ingredients={ingredients}
        open={addReviewOpen}
        onClose={() => setAddReviewOpen(false)}
      />
      <ReceiptImportDialog
        ingredients={ingredients}
        mode={receiptMode}
        onModeChange={setReceiptMode}
      />
    </>
  );
}
