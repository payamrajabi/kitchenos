"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { X } from "@phosphor-icons/react";
import { toast } from "sonner";

import { parseInventoryUpdateAction } from "@/app/actions/inventory-bulk";
import { getTopLayerHost, setTopLayerHost } from "@/lib/top-layer-host";
import {
  setParseError,
  setParsedRows,
  setParsing,
} from "@/lib/inventory-bulk/queue";

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * Free-text stocktake **input** dialog. Lets the user dictate (or paste)
 * what they currently have on hand. Clicking Review fires the LLM parse in
 * the background and immediately closes this dialog. The user is then on
 * the inventory page with a "Reading stocktake…" pill in the bottom-right;
 * tapping it (once the parse settles into "Review stocktake (N)") opens
 * the review dialog. This mirrors the receipt importer's fire-and-forget
 * shape so a long parse doesn't trap the user behind a modal spinner.
 *
 * Distinct from the receipt log dialog because the apply has overwrite
 * semantics (set, not add). See PRD §7 for the split.
 */
export function UpdateInventoryDialog({ open, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      if (!el.open) {
        try {
          el.showModal();
        } catch {
          /* already open or not supported */
        }
      }
      setTopLayerHost(el);
    } else {
      if (el.open) {
        try {
          el.close();
        } catch {
          /* ignore */
        }
      }
      if (getTopLayerHost() === el) setTopLayerHost(null);
    }
    return () => {
      if (getTopLayerHost() === el) setTopLayerHost(null);
    };
  }, [open]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener("cancel", onCancel);
    return () => el.removeEventListener("cancel", onCancel);
  }, [onClose]);

  const closeModal = useCallback(() => {
    setError(null);
    onClose();
  }, [onClose]);

  const onBackdropClick = useCallback(
    (event: MouseEvent<HTMLDialogElement>) => {
      if (event.target === event.currentTarget) closeModal();
    },
    [closeModal],
  );

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Type or paste what you have on hand first.");
      return;
    }
    setError(null);
    setText("");
    onClose();

    setParsing(true);
    setParseError(null);
    void (async () => {
      try {
        const result = await parseInventoryUpdateAction(trimmed);
        if (!result.ok) {
          setParsing(false);
          setParseError(result.error);
          toast.error(result.error);
          return;
        }
        setParsedRows(result.items);
        // Light nudge: the user has been waiting and almost certainly
        // navigated away from the FAB area. The pill changes to "Review
        // stocktake (N)" automatically, but a toast tells them the parse
        // landed without forcing the modal open.
        const actionable = result.items.filter(
          (i) => !i.skipReason && i.quantity != null,
        ).length;
        if (actionable > 0) {
          toast.success(
            `Stocktake ready — ${actionable} item${
              actionable === 1 ? "" : "s"
            } to review.`,
          );
        } else if (result.items.length > 0) {
          toast.message("Stocktake ready — open the pill to review.");
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to parse stocktake.";
        setParsing(false);
        setParseError(msg);
        toast.error(msg);
      }
    })();
  }, [text, onClose]);

  return (
    <dialog
      ref={dialogRef}
      className="receipt-import-dialog"
      aria-label="Update inventory"
      onClick={onBackdropClick}
    >
      <div className="receipt-import-dialog-surface">
        <header className="receipt-import-dialog-header">
          <h2 className="receipt-import-dialog-title">Update inventory</h2>
          <button
            type="button"
            className="receipt-import-dialog-close"
            aria-label="Close"
            onClick={closeModal}
          >
            <X size={18} weight="regular" aria-hidden />
          </button>
        </header>

        <div className="receipt-import-dialog-body">
          {error ? (
            <p className="receipt-import-error" role="alert">
              {error}
            </p>
          ) : null}

          <section className="receipt-import-input-pane">
            <p className="receipt-import-help">
              Read off what you currently have on hand — pantry, fridge,
              freezer. Each item&apos;s on-hand stock will be set to the
              amount you state (this is an overwrite, not an addition).
              When you hit Review this dialog will close and the parse runs
              in the background — tap the pill in the bottom-right when it
              says &quot;Review stocktake&quot; to confirm before anything
              saves.
            </p>

            <textarea
              className="receipt-import-textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`e.g.\n18 eggs\nhalf a gallon of oat milk\ntwo pounds of ground beef\na dozen lemons`}
              rows={10}
              autoFocus
            />
          </section>
        </div>

        <footer className="receipt-import-dialog-footer">
          <button
            type="button"
            className="receipt-import-secondary"
            onClick={closeModal}
          >
            Cancel
          </button>
          <button
            type="button"
            className="receipt-import-primary"
            onClick={handleSubmit}
            disabled={!text.trim()}
          >
            Review
          </button>
        </footer>
      </div>
    </dialog>
  );
}
