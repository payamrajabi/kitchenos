"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { X } from "@phosphor-icons/react";
import { toast } from "sonner";

import { parseAddIngredientsAction } from "@/app/actions/inventory-bulk";
import { getTopLayerHost, setTopLayerHost } from "@/lib/top-layer-host";
import {
  setAddParseError,
  setAddParsedRows,
  setAddParsing,
} from "@/lib/inventory-bulk/add-ingredients-queue";

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * Add-ingredient INPUT dialog. The user pastes / dictates a list of
 * ingredient names. Hitting "Review" closes this dialog and fires the
 * LLM enrichment in the background; results land on the inventory
 * page's bottom-right pill ("Reviewing new ingredients…" → "Review new
 * ingredients (N)") which opens the review modal.
 *
 * Mirrors `UpdateInventoryDialog` so the two flows look and feel the
 * same — the only behavioural difference is that THIS one creates
 * ingredients (with category / subcategory / parent / storage chosen by
 * the LLM and confirmed by the user), while Update Inventory overwrites
 * stock quantities.
 */
export function AddIngredientDialog({ open, onClose }: Props) {
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
      setError("Type or paste at least one ingredient.");
      return;
    }
    setError(null);
    setText("");
    onClose();

    setAddParsing(true);
    setAddParseError(null);
    void (async () => {
      try {
        const result = await parseAddIngredientsAction(trimmed);
        if (!result.ok) {
          setAddParsing(false);
          setAddParseError(result.error);
          toast.error(result.error);
          return;
        }
        setAddParsedRows(result.items);
        const actionable = result.items.filter((i) => !i.skipReason).length;
        if (actionable > 0) {
          toast.success(
            `Ready to review — ${actionable} ingredient${
              actionable === 1 ? "" : "s"
            } classified.`,
          );
        } else if (result.items.length > 0) {
          toast.message("Ready — open the pill to review.");
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to classify ingredients.";
        setAddParsing(false);
        setAddParseError(msg);
        toast.error(msg);
      }
    })();
  }, [text, onClose]);

  return (
    <dialog
      ref={dialogRef}
      className="receipt-import-dialog"
      aria-label="Add ingredients"
      onClick={onBackdropClick}
    >
      <div className="receipt-import-dialog-surface">
        <header className="receipt-import-dialog-header">
          <h2 className="receipt-import-dialog-title">Add ingredients</h2>
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
              List the ingredients you want to add — one per line, separated
              by commas, or just type/dictate them naturally. When you hit
              Review this dialog will close and an AI pass runs in the
              background to suggest each ingredient&apos;s category,
              subcategory, parent (e.g. Russet Potato → Potato), and
              storage location. Tap the pill in the bottom-right when it
              says &quot;Review new ingredients&quot; to confirm before
              anything is created.
            </p>

            <textarea
              className="receipt-import-textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`e.g.\nRusset Potato\nSweet Potato\nLacinato Kale\nMaldon Salt\nor: kale, broccoli and asparagus`}
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
