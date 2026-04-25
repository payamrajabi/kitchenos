"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { useRouter } from "next/navigation";
import { CircleNotch, Plus, Receipt, X } from "@phosphor-icons/react";
import { toast } from "sonner";

import {
  applyReceiptReviewAction,
  importReceiptAction,
  type ReviewDecision,
} from "@/app/actions/receipt-import";
import { getTopLayerHost, setTopLayerHost } from "@/lib/top-layer-host";
import {
  IngredientSearchControl,
  sortIngredientOptions,
  type IngredientOption,
  type IngredientSuggestion,
} from "@/components/ingredient-search-control";
import { INGREDIENT_UNITS } from "@/lib/unit-mapping";
import type { ProductPriceBasis } from "@/types/database";
import {
  clearAll,
  dismissBatch,
  retryBatch,
  dismissRow,
  dispatchParse,
  includeExcludedRow,
  patchRow,
  setApplying,
  summarizeQueue,
  useIsApplying,
  useReceiptQueue,
  type QueueBatchEntry,
  type QueueRowEntry,
  type RowState,
} from "@/lib/receipt-import/queue";
import { markApplied } from "@/lib/receipt-import/recent-applied";

type Props = {
  /** Inventory ingredients available for assignment in the review step. */
  ingredients: { id: number; name: string }[];
};

function formatMoney(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return "";
  return `$${n.toFixed(2)}`;
}

function formatQty(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1000) / 1000);
}

function compactProductTitle(r: RowState): string {
  const brand = r.productBrand.trim();
  const product = r.productName.trim();
  if (brand && product) return `${brand} ${product}`;
  return product || brand || r.row.rawLine;
}

function compactPriceLabel(r: RowState): string {
  const money = formatMoney(r.price.trim());
  if (!money) return "Price not found";

  const basis = r.priceBasis || "package";
  if (basis === "weight") {
    const amount = Number(r.priceBasisAmount.trim());
    const unit = r.priceBasisUnit.trim();
    if (!unit) return `${money} by weight`;
    if (!Number.isFinite(amount) || amount <= 0 || amount === 1) {
      return `${money}/${unit}`;
    }
    return `${money} per ${formatQty(r.priceBasisAmount.trim())}${unit}`;
  }

  if (basis === "unit") {
    const unit = r.priceBasisUnit.trim();
    return unit && unit !== "ea" ? `${money}/${unit}` : `${money} each`;
  }

  const purchased = Number(r.purchaseQuantity.trim());
  return Number.isFinite(purchased) && purchased > 1
    ? `${money} per package`
    : money;
}

function reviewFlagsForRow(r: RowState): string[] {
  return Array.isArray(r.row.reviewFlags) ? r.row.reviewFlags : [];
}

function rowNeedsReview(entry: QueueRowEntry): boolean {
  return (
    entry.state.row.confidence !== "high" ||
    reviewFlagsForRow(entry.state).length > 0
  );
}

function reviewPriority(entry: QueueRowEntry): number {
  const flags = reviewFlagsForRow(entry.state).length;
  const confidenceWeight =
    entry.state.row.confidence === "low"
      ? 3
      : entry.state.row.confidence === "medium"
        ? 2
        : 0;
  return flags * 10 + confidenceWeight;
}

function mappedIngredientLabel(
  r: RowState,
  ingredients: IngredientOption[],
): string {
  if (r.action === "create") return r.createName.trim() || "New Ingredient";
  return (
    ingredients.find((ingredient) => String(ingredient.id) === r.assignIngredientId)
      ?.name ??
    r.row.suggestedIngredientName ??
    "Unassigned"
  );
}

/** Which pane the dialog is showing. null = closed. */
type DialogMode = "input" | "queue" | null;

export function ReceiptImportFab({ ingredients }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [mode, setMode] = useState<DialogMode>(null);
  const [pastedText, setPastedText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const entries = useReceiptQueue();
  const applying = useIsApplying();
  const summary = useMemo(() => summarizeQueue(entries), [entries]);

  // Open/close the native <dialog> and register as the top-layer host so any
  // nested floating UI can stack above the dialog body.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (mode !== null) {
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
  }, [mode]);

  // Pressing Esc on a native dialog fires `cancel`; translate that into our
  // state so the transition runs via our own close path.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      setMode(null);
    };
    el.addEventListener("cancel", onCancel);
    return () => el.removeEventListener("cancel", onCancel);
  }, []);

  const closeModal = useCallback(() => {
    setMode(null);
    setError(null);
  }, []);

  const onBackdropClick = useCallback(
    (event: MouseEvent<HTMLDialogElement>) => {
      if (event.target === event.currentTarget) closeModal();
    },
    [closeModal],
  );

  const knownIngredients = useMemo(
    () => sortIngredientOptions(ingredients),
    [ingredients],
  );

  const handleImport = useCallback(() => {
    const trimmed = pastedText.trim();
    if (!trimmed) {
      setError("Paste some receipt text first.");
      return;
    }
    setError(null);
    dispatchParse(trimmed, { importReceiptAction });
    setPastedText("");
    // Closing the dialog mirrors the user's mental model: hit Import, get out
    // of the way, come back via the FAB pill when there's something to review.
    setMode(null);
  }, [pastedText]);

  const handleCancelAll = useCallback(() => {
    clearAll();
    setPastedText("");
    setError(null);
    setMode(null);
  }, []);

  const handleApply = useCallback(() => {
    const decisions: ReviewDecision[] = [];
    const rowErrors: string[] = [];

    const rowEntries = entries.filter(
      (e): e is QueueRowEntry => e.kind === "row",
    );

    for (const { state: r } of rowEntries) {
      if (r.action === "ignore" || r.row.excludedReason) {
        decisions.push({ action: "ignore", rawLine: r.row.rawLine });
        continue;
      }

      const qty = r.quantity.trim() === "" ? null : Number(r.quantity);
      if (qty != null && (!Number.isFinite(qty) || qty < 0)) {
        rowErrors.push(`"${r.row.rawLine}": quantity must be a non-negative number.`);
        continue;
      }
      const price = r.price.trim() === "" ? null : Number(r.price);
      if (price != null && (!Number.isFinite(price) || price < 0)) {
        rowErrors.push(`"${r.row.rawLine}": price must be a non-negative number.`);
        continue;
      }
      const priceBasisAmount =
        r.priceBasisAmount.trim() === "" ? null : Number(r.priceBasisAmount);
      if (
        priceBasisAmount != null &&
        (!Number.isFinite(priceBasisAmount) || priceBasisAmount <= 0)
      ) {
        rowErrors.push(
          `"${r.row.rawLine}": price basis amount must be a positive number.`,
        );
        continue;
      }
      const packAmount =
        r.unitSizeAmount.trim() === "" ? null : Number(r.unitSizeAmount);
      if (packAmount != null && (!Number.isFinite(packAmount) || packAmount < 0)) {
        rowErrors.push(`"${r.row.rawLine}": pack size must be a non-negative number.`);
        continue;
      }
      const priceBasis = price == null ? null : r.priceBasis || "package";

      if (r.action === "assign") {
        if (!r.assignIngredientId) {
          rowErrors.push(`"${r.row.rawLine}": pick an ingredient or switch to "Create".`);
          continue;
        }
        decisions.push({
          action: "assign",
          rawLine: r.row.rawLine,
          ingredientId: Number(r.assignIngredientId),
          quantityDelta: qty,
          unit: r.unit || null,
          productName: r.productName.trim() || null,
          productBrand: r.productBrand.trim() || null,
          unitSizeAmount: packAmount,
          unitSizeUnit: r.unitSizeUnit || null,
          price,
          priceBasis,
          priceBasisAmount,
          priceBasisUnit: r.priceBasisUnit || null,
        });
      } else {
        const name = r.createName.trim();
        if (!name) {
          rowErrors.push(`"${r.row.rawLine}": give the new ingredient a name.`);
          continue;
        }
        decisions.push({
          action: "create",
          rawLine: r.row.rawLine,
          newIngredientName: name,
          quantityDelta: qty,
          unit: r.unit || null,
          productName: r.productName.trim() || null,
          productBrand: r.productBrand.trim() || null,
          unitSizeAmount: packAmount,
          unitSizeUnit: r.unitSizeUnit || null,
          price,
          priceBasis,
          priceBasisAmount,
          priceBasisUnit: r.priceBasisUnit || null,
        });
      }
    }

    if (rowErrors.length > 0) {
      setError(rowErrors.join(" "));
      return;
    }

    // Close the dialog immediately and run the apply in the background. The
    // pill surfaces an "Applying…" spinner next to the FAB until the server
    // action resolves; on success we flash the affected inventory rows.
    setError(null);
    setMode(null);
    setApplying(true);
    void (async () => {
      try {
        const result = await applyReceiptReviewAction(decisions);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }

        if (result.errors.length > 0) {
          toast.error(
            `${result.errors.length} row${
              result.errors.length === 1 ? "" : "s"
            } couldn't be applied. The rest were saved.`,
          );
        }

        const appliedIds = result.applied.map((a) => a.ingredientId);
        markApplied(appliedIds);
        clearAll();
        toast.success(
          `Applied ${result.applied.length} item${
            result.applied.length === 1 ? "" : "s"
          } to inventory.`,
        );
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to apply receipt.",
        );
      } finally {
        setApplying(false);
      }
    })();
  }, [entries, router]);

  const reviewRows = useMemo(
    () =>
      entries.filter(
        (e): e is QueueRowEntry =>
          e.kind === "row" &&
          !e.state.row.excludedReason &&
          rowNeedsReview(e),
      ).sort((a, b) => reviewPriority(b) - reviewPriority(a)),
    [entries],
  );
  const confidentRows = useMemo(
    () =>
      entries.filter(
        (e): e is QueueRowEntry =>
          e.kind === "row" &&
          !e.state.row.excludedReason &&
          e.state.row.confidence === "high" &&
          reviewFlagsForRow(e.state).length === 0,
      ),
    [entries],
  );
  const excludedRows = useMemo(
    () =>
      entries.filter(
        (e): e is QueueRowEntry =>
          e.kind === "row" && Boolean(e.state.row.excludedReason),
      ),
    [entries],
  );
  const pendingBatches = useMemo(
    () =>
      entries.filter((e): e is QueueBatchEntry => e.kind === "batch"),
    [entries],
  );

  // Pill visibility & label: "Applying…" wins over "Reading" wins over
  // "N to review". All three are mutually informative states.
  const fabBadge = (() => {
    if (applying) {
      return { label: "Applying…", busy: true, clickable: false };
    }
    if (summary.pendingBatches > 0 && summary.totalRows === 0) {
      return { label: "Reading receipt…", busy: true, clickable: true };
    }
    if (summary.activeRows > 0) {
      return {
        label: `${summary.activeRows} to review`,
        busy: summary.pendingBatches > 0,
        clickable: true,
      };
    }
    return null;
  })();

  return (
    <>
      <div className="inventory-receipt-fab-wrap">
        {fabBadge ? (
          <button
            type="button"
            className={`inventory-receipt-pill${fabBadge.busy ? " is-busy" : ""}`}
            onClick={() => {
              if (!fabBadge.clickable) return;
              setError(null);
              setMode("queue");
            }}
            disabled={!fabBadge.clickable}
            aria-label={
              fabBadge.busy
                ? fabBadge.label
                : `${summary.activeRows} items waiting to review`
            }
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
        <button
          type="button"
          className="inventory-receipt-fab"
          aria-label="Log a receipt"
          onClick={() => {
            setError(null);
            setMode("input");
          }}
        >
          <Receipt size={22} weight="regular" color="var(--paper)" aria-hidden />
        </button>
      </div>

      <dialog
        ref={dialogRef}
        className="receipt-import-dialog"
        aria-label={mode === "queue" ? "Review receipt items" : "Log a receipt"}
        onClick={onBackdropClick}
      >
        <div className="receipt-import-dialog-surface">
          <header className="receipt-import-dialog-header">
            <h2 className="receipt-import-dialog-title">
              {mode === "queue" ? "Review receipt items" : "Log a receipt"}
            </h2>
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

            {mode === "input" ? (
              <section className="receipt-import-input-pane">
                <p className="receipt-import-help">
                  Paste receipt text below. The AI will match items to your
                  inventory in the background — come back to the review pill
                  when it&apos;s ready.
                </p>

                <textarea
                  id="receipt-import-paste"
                  className="receipt-import-textarea"
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder={`e.g.\n2 x Smooth Peanut Butter 340g  4.50\nOat Milk 1L  1.85\nBananas 1.2kg  1.20`}
                  rows={10}
                  autoFocus
                />
              </section>
            ) : null}

            {mode === "queue" ? (
              <>
                {pendingBatches.length > 0 ? (
                  <section>
                    <h3 className="receipt-import-subtitle">
                      Parsing ({pendingBatches.length})
                    </h3>
                    <ul className="receipt-import-review-list">
                      {pendingBatches.map((b) => (
                        <PendingBatchRow key={b.id} batch={b} />
                      ))}
                    </ul>
                  </section>
                ) : null}

                {reviewRows.length > 0 ? (
                  <section>
                    <h3 className="receipt-import-subtitle">
                      Review ({reviewRows.length})
                    </h3>
                    <p className="receipt-import-help">
                      These need a quick look because the match, quantity, unit,
                      or pack details look uncertain.
                    </p>
                    <ul className="receipt-import-review-list">
                      {reviewRows.map((entry) => (
                        <RowItem
                          key={entry.id}
                          entry={entry}
                          busy={false}
                          ingredients={knownIngredients}
                        />
                      ))}
                    </ul>
                  </section>
                ) : null}

                {confidentRows.length > 0 ? (
                  <section>
                    <h3 className="receipt-import-subtitle">
                      Confirmed ({confidentRows.length})
                    </h3>
                    <ul className="receipt-import-review-list">
                      {confidentRows.map((entry) => (
                        <RowItem
                          key={entry.id}
                          entry={entry}
                          busy={false}
                          ingredients={knownIngredients}
                        />
                      ))}
                    </ul>
                  </section>
                ) : null}

                {excludedRows.length > 0 ? (
                  <section>
                    <h3 className="receipt-import-subtitle">
                      Excluded ({excludedRows.length})
                    </h3>
                    <p className="receipt-import-help">
                      These look like non-food or non-inventory items. Click
                      Include to add one back to the review list.
                    </p>
                    <ul className="receipt-import-review-list">
                      {excludedRows.map((entry) => (
                        <ExcludedRow
                          key={entry.id}
                          entry={entry}
                          busy={false}
                        />
                      ))}
                    </ul>
                  </section>
                ) : null}

                {summary.totalRows === 0 && pendingBatches.length === 0 ? (
                  <p className="receipt-import-empty">
                    Nothing to review right now. Log a new receipt from the
                    button in the bottom right.
                  </p>
                ) : null}
              </>
            ) : null}
          </div>

          <footer className="receipt-import-dialog-footer">
            {mode === "input" ? (
              <>
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
                  onClick={handleImport}
                  disabled={!pastedText.trim()}
                >
                  Import
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="receipt-import-secondary"
                  onClick={handleCancelAll}
                  disabled={
                    summary.totalRows + summary.pendingBatches === 0
                  }
                >
                  Discard all
                </button>
                <button
                  type="button"
                  className="receipt-import-primary"
                  onClick={handleApply}
                  disabled={summary.activeRows === 0}
                >
                  {summary.activeRows > 0
                    ? `Apply (${summary.activeRows})`
                    : "Apply"}
                </button>
              </>
            )}
          </footer>
        </div>
      </dialog>
    </>
  );
}

/* ----------------------------------------------------------------------- */
/*  Pending parse placeholder                                              */
/* ----------------------------------------------------------------------- */

function PendingBatchRow({ batch }: { batch: QueueBatchEntry }) {
  const failed = batch.error != null;
  return (
    <li
      className={`receipt-import-row receipt-import-row-pending${
        failed ? " is-error" : ""
      }`}
    >
      <div className="receipt-import-pending-card">
        <div className="receipt-import-pending-main">
          <div className="receipt-import-pending-title">
            {failed
              ? "Couldn't read this receipt"
              : `Reading ${batch.pastedLineCount} line${
                  batch.pastedLineCount === 1 ? "" : "s"
                }…`}
          </div>
          <div className="receipt-import-pending-preview">
            {failed ? batch.error : batch.preview}
          </div>
        </div>
        {failed ? (
          <div className="receipt-import-pending-actions">
            <button
              type="button"
              className="receipt-import-row-action"
              onClick={() => dismissBatch(batch.id)}
            >
              Dismiss
            </button>
            <button
              type="button"
              className="receipt-import-row-action receipt-import-row-action-include"
              onClick={() => retryBatch(batch.id, { importReceiptAction })}
            >
              Retry
            </button>
          </div>
        ) : (
          <CircleNotch
            size={18}
            weight="bold"
            className="receipt-import-pending-spinner"
            aria-hidden
          />
        )}
      </div>
    </li>
  );
}

/* ----------------------------------------------------------------------- */
/*  Individual row renderer                                                */
/* ----------------------------------------------------------------------- */

type RowItemProps = {
  entry: QueueRowEntry;
  busy: boolean;
  ingredients: IngredientOption[];
};

function ReviewFlags({ flags }: { flags: string[] }) {
  if (flags.length === 0) return null;
  return (
    <div className="receipt-import-review-flags" role="note">
      <span className="receipt-import-review-flags-label">Check</span>
      <ul className="receipt-import-review-flags-list">
        {flags.map((flag) => (
          <li key={flag}>{flag}</li>
        ))}
      </ul>
    </div>
  );
}

function RowItem({ entry, busy, ingredients }: RowItemProps) {
  const r = entry.state;
  const ignored = r.action === "ignore";
  const isNew = r.action === "create";
  const reviewFlags = reviewFlagsForRow(r);
  const mappedLabel = mappedIngredientLabel(r, ingredients);
  const onChange = useCallback(
    (patch: Partial<RowState>) => patchRow(entry.id, patch),
    [entry.id],
  );

  // Inline map-to editing lives on the collapsed row only: tap the pill to
  // open the ingredient picker right there, pick one, collapse back. Tapping
  // the rest of the row expands the full editor card as before.
  const [isEditingMap, setIsEditingMap] = useState(false);

  const expandRow = useCallback(() => {
    if (isEditingMap) {
      // First tap on the body while the inline picker is open just closes
      // the picker; a second tap expands. Avoids the two interactions
      // fighting each other.
      setIsEditingMap(false);
      return;
    }
    onChange({
      expanded: true,
      action: ignored
        ? r.row.suggestedIngredientId != null
          ? "assign"
          : "create"
        : r.action,
    });
  }, [ignored, isEditingMap, onChange, r.action, r.row.suggestedIngredientId]);

  if (!r.expanded) {
    return (
      <li
        className={`receipt-import-row receipt-import-row-compact${
          ignored ? " is-ignored" : ""
        }${isEditingMap ? " is-editing-map" : ""}`}
      >
        <div className="receipt-import-compact-card">
          <button
            type="button"
            className="receipt-import-compact-body"
            onClick={expandRow}
            disabled={busy}
            aria-label={`Review ${compactProductTitle(r)} mapped to ${mappedLabel}`}
          >
            <span className="receipt-import-compact-main">
              <span className="receipt-import-compact-product">
                {r.productBrand.trim() ? (
                  <>
                    <span className="receipt-import-compact-brand">
                      {r.productBrand.trim()}
                    </span>{" "}
                    <span className="receipt-import-compact-name">
                      {r.productName.trim() || r.row.rawLine}
                    </span>
                  </>
                ) : (
                  <span className="receipt-import-compact-name">
                    {r.productName.trim() || r.row.rawLine}
                  </span>
                )}
              </span>
              <span className="receipt-import-compact-price">
                {compactPriceLabel(r)}
              </span>
              {reviewFlags.length > 0 ? (
                <span
                  className="receipt-import-compact-risk"
                  title={reviewFlags.join(" ")}
                >
                  Check: {reviewFlags[0]}
                  {reviewFlags.length > 1 ? ` +${reviewFlags.length - 1}` : ""}
                </span>
              ) : null}
            </span>
          </button>
          <div className="receipt-import-compact-mapped-slot">
            {isEditingMap ? (
              <IngredientSearchControl
                knownIngredients={ingredients}
                disabled={busy}
                placeholder="Search or create ingredient"
                ariaLabel="Map to"
                inputId={`rc-inline-${entry.id}`}
                defaultQuery={mappedLabel}
                autoFocus
                onCancel={() => setIsEditingMap(false)}
                onPickSuggestion={(suggestion: IngredientSuggestion) => {
                  if (suggestion.kind === "existing") {
                    onChange({
                      action: "assign",
                      assignIngredientId: String(suggestion.ingredient.id),
                      createName: suggestion.ingredient.name,
                    });
                  } else {
                    onChange({
                      action: "create",
                      assignIngredientId: "",
                      createName: suggestion.name,
                    });
                  }
                  setIsEditingMap(false);
                }}
              />
            ) : (
              <button
                type="button"
                className={`receipt-import-compact-mapped${
                  isNew ? " is-new" : ""
                }`}
                onClick={() => setIsEditingMap(true)}
                disabled={busy}
                aria-label={`Change mapped ingredient from ${mappedLabel}`}
              >
                {mappedLabel}
              </button>
            )}
          </div>
        </div>
      </li>
    );
  }

  return (
    <li
      className={`receipt-import-row receipt-import-row-expanded${
        ignored ? " is-ignored" : ""
      }`}
    >
      <div className="receipt-import-card">
        <div className="receipt-import-card-raw">{r.row.rawLine}</div>
        <ReviewFlags flags={reviewFlags} />

        {r.action !== "ignore" ? (
          <>
            <div className="receipt-import-card-section">
              <div className="receipt-import-field">
                <label
                  className="receipt-import-field-label"
                  htmlFor={`rc-name-${entry.id}`}
                >
                  Map to
                </label>
                <IngredientSearchControl
                  knownIngredients={ingredients}
                  disabled={busy}
                  placeholder="Search or create ingredient"
                  ariaLabel="Map to"
                  inputId={`rc-name-${entry.id}`}
                  defaultQuery={mappedLabel}
                  onQueryChange={(query) =>
                    onChange({
                      action: "create",
                      assignIngredientId: "",
                      createName: query,
                    })
                  }
                  onPickSuggestion={(suggestion: IngredientSuggestion) => {
                    if (suggestion.kind === "existing") {
                      onChange({
                        action: "assign",
                        assignIngredientId: String(suggestion.ingredient.id),
                        createName: suggestion.ingredient.name,
                      });
                      return;
                    }
                    onChange({
                      action: "create",
                      assignIngredientId: "",
                      createName: suggestion.name,
                    });
                  }}
                />
              </div>
            </div>

            <div className="receipt-import-card-section">
              <div className="receipt-import-card-row">
                <div className="receipt-import-field">
                  <label
                    className="receipt-import-field-label"
                    htmlFor={`rc-pbrand-${entry.id}`}
                  >
                    Brand
                  </label>
                  <input
                    id={`rc-pbrand-${entry.id}`}
                    className="receipt-import-input"
                    value={r.productBrand}
                    onChange={(e) => onChange({ productBrand: e.target.value })}
                    placeholder="—"
                    disabled={busy}
                  />
                </div>
                <div className="receipt-import-field">
                  <label
                    className="receipt-import-field-label"
                    htmlFor={`rc-pname-${entry.id}`}
                  >
                    Product
                  </label>
                  <input
                    id={`rc-pname-${entry.id}`}
                    className="receipt-import-input"
                    value={r.productName}
                    onChange={(e) => onChange({ productName: e.target.value })}
                    placeholder="Product name"
                    disabled={busy}
                  />
                </div>
              </div>

              <div className="receipt-import-card-row receipt-import-card-row-3">
                <div className="receipt-import-field">
                  <label
                    className="receipt-import-field-label"
                    htmlFor={`rc-pqty-${entry.id}`}
                  >
                    Quantity
                  </label>
                  <input
                    id={`rc-pqty-${entry.id}`}
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    className="receipt-import-input"
                    value={r.purchaseQuantity}
                    onChange={(e) =>
                      onChange({ purchaseQuantity: e.target.value })
                    }
                    disabled={busy}
                  />
                </div>
                <div className="receipt-import-field">
                  <label
                    className="receipt-import-field-label receipt-import-field-label-ghost"
                    aria-hidden="true"
                  >
                    Unit
                  </label>
                  <select
                    aria-label="Quantity unit"
                    className="receipt-import-select"
                    value={r.purchaseUnit}
                    onChange={(e) =>
                      onChange({ purchaseUnit: e.target.value })
                    }
                    disabled={busy}
                  >
                    <option value="">—</option>
                    {INGREDIENT_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="receipt-import-field">
                  <label
                    className="receipt-import-field-label"
                    htmlFor={`rc-price-${entry.id}`}
                  >
                    Unit price
                  </label>
                  <input
                    id={`rc-price-${entry.id}`}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    className="receipt-import-input"
                    value={r.price}
                    onChange={(e) => onChange({ price: e.target.value })}
                    disabled={busy}
                  />
                </div>
              </div>
            </div>

            <div className="receipt-import-card-section">
              <div className="receipt-import-card-row">
                <div className="receipt-import-field">
                  <label
                    className="receipt-import-field-label"
                    htmlFor={`rc-psize-${entry.id}`}
                  >
                    Portions per unit
                  </label>
                  <input
                    id={`rc-psize-${entry.id}`}
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    className="receipt-import-input"
                    value={r.unitSizeAmount}
                    onChange={(e) =>
                      onChange({ unitSizeAmount: e.target.value })
                    }
                    placeholder="e.g. 10"
                    disabled={busy}
                  />
                </div>
                <div className="receipt-import-field">
                  <label
                    className="receipt-import-field-label receipt-import-field-label-ghost"
                    aria-hidden="true"
                  >
                    Unit size
                  </label>
                  <select
                    aria-label="Unit size unit"
                    className="receipt-import-select"
                    value={r.unitSizeUnit}
                    onChange={(e) =>
                      onChange({ unitSizeUnit: e.target.value })
                    }
                    disabled={busy}
                  >
                    <option value="">—</option>
                    {INGREDIENT_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <details className="receipt-import-advanced">
              <summary className="receipt-import-advanced-summary">
                Advanced (stock adjustment &amp; price basis)
              </summary>
              <div className="receipt-import-card-section receipt-import-card-section-nested">
                <div className="receipt-import-card-row">
                  <div className="receipt-import-field">
                    <label
                      className="receipt-import-field-label"
                      htmlFor={`rc-qty-${entry.id}`}
                    >
                      Add to stock
                    </label>
                    <div className="receipt-import-qty-group">
                      <input
                        id={`rc-qty-${entry.id}`}
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min="0"
                        className="receipt-import-input receipt-import-input-qty"
                        value={r.quantity}
                        onChange={(e) => onChange({ quantity: e.target.value })}
                        disabled={busy}
                      />
                      <select
                        aria-label="Stock unit"
                        className="receipt-import-select"
                        value={r.unit}
                        onChange={(e) => onChange({ unit: e.target.value })}
                        disabled={busy}
                      >
                        <option value="">—</option>
                        {INGREDIENT_UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="receipt-import-field">
                    <label
                      className="receipt-import-field-label"
                      htmlFor={`rc-price-basis-${entry.id}`}
                    >
                      Price basis
                    </label>
                    <select
                      id={`rc-price-basis-${entry.id}`}
                      className="receipt-import-select"
                      value={r.priceBasis}
                      onChange={(e) =>
                        onChange({
                          priceBasis: e.target.value as
                            | ProductPriceBasis
                            | "",
                          priceBasisAmount:
                            e.target.value === "weight" ||
                            e.target.value === "unit"
                              ? r.priceBasisAmount || "1"
                              : "",
                          priceBasisUnit:
                            e.target.value === "weight"
                              ? r.priceBasisUnit || r.purchaseUnit || "lb"
                              : e.target.value === "unit"
                                ? r.priceBasisUnit || "ea"
                                : "",
                        })
                      }
                      disabled={busy}
                    >
                      <option value="">—</option>
                      <option value="package">Package</option>
                      <option value="weight">By weight</option>
                      <option value="unit">Each/unit</option>
                    </select>
                  </div>
                </div>

                {r.priceBasis === "weight" || r.priceBasis === "unit" ? (
                  <div className="receipt-import-card-row">
                    <div className="receipt-import-field">
                      <label className="receipt-import-field-label">
                        Basis amount
                      </label>
                      <div className="receipt-import-qty-group">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0"
                          className="receipt-import-input receipt-import-input-qty"
                          value={r.priceBasisAmount}
                          onChange={(e) =>
                            onChange({ priceBasisAmount: e.target.value })
                          }
                          placeholder="1"
                          disabled={busy}
                        />
                        <select
                          aria-label="Price basis unit"
                          className="receipt-import-select"
                          value={r.priceBasisUnit}
                          onChange={(e) =>
                            onChange({ priceBasisUnit: e.target.value })
                          }
                          disabled={busy}
                        >
                          <option value="">unit</option>
                          {INGREDIENT_UNITS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </details>

            <div className="receipt-import-card-actions">
              <button
                type="button"
                className="receipt-import-row-action receipt-import-row-action-danger"
                onClick={() => dismissRow(entry.id)}
                disabled={busy}
              >
                Remove from list
              </button>
              <button
                type="button"
                className="receipt-import-row-action"
                onClick={() => onChange({ expanded: false })}
                disabled={busy}
              >
                Done
              </button>
            </div>
          </>
        ) : null}
      </div>
    </li>
  );
}

function ExcludedRow({ entry, busy }: { entry: QueueRowEntry; busy: boolean }) {
  const r = entry.state;
  return (
    <li className="receipt-import-row receipt-import-excluded-row">
      <div className="receipt-import-excluded-card">
        <div className="receipt-import-compact-main">
          <div className="receipt-import-compact-product">
            <span className="receipt-import-compact-name">{r.row.rawLine}</span>
          </div>
          <div className="receipt-import-compact-price">
            {r.row.excludedReason ?? "Excluded"}
          </div>
        </div>
        <button
          type="button"
          className="receipt-import-row-action receipt-import-row-action-include"
          onClick={() => includeExcludedRow(entry.id)}
          disabled={busy}
          aria-label={`Include ${r.row.rawLine} in the review list`}
        >
          <Plus size={12} weight="bold" aria-hidden />
          <span>Include</span>
        </button>
      </div>
    </li>
  );
}
