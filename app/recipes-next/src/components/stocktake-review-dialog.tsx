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
import { CircleNotch, X } from "@phosphor-icons/react";
import { toast } from "sonner";

import {
  applyInventoryUpdateAction,
  type StocktakeDecision,
} from "@/app/actions/inventory-bulk";
import {
  IngredientSearchControl,
  sortIngredientOptions,
  type IngredientOption,
  type IngredientSuggestion,
} from "@/components/ingredient-search-control";
import { INGREDIENT_UNITS } from "@/lib/unit-mapping";
import { getTopLayerHost, setTopLayerHost } from "@/lib/top-layer-host";
import { setInventoryBulkBusy } from "@/lib/inventory-bulk/applying";
import { markApplied } from "@/lib/receipt-import/recent-applied";
import {
  activeStocktakeRowCount,
  clearStocktakeQueue,
  dismissRow,
  ignoreRow,
  patchRow,
  reviveIgnoredRow,
  setZeroOut,
  useIsParsing,
  useStocktakeEntries,
  useStocktakeParseError,
  useZeroOut,
  type StocktakeRowEntry,
  type StocktakeRowState,
} from "@/lib/inventory-bulk/queue";

type Props = {
  ingredients: { id: number; name: string }[];
  open: boolean;
  onClose: () => void;
};

function compactQuantityLabel(r: StocktakeRowState): string {
  const qty = r.quantity.trim();
  if (!qty) return "—";
  const unit = r.unit.trim();
  return unit ? `${qty} ${unit}` : qty;
}

function compactBrandLabel(r: StocktakeRowState): string | null {
  const brand = r.productBrand.trim();
  const product = r.productName.trim();
  if (brand && product) return `${brand} — ${product}`;
  if (brand) return brand;
  if (product) return product;
  return null;
}

function mappedIngredientLabel(
  r: StocktakeRowState,
  ingredients: IngredientOption[],
): string {
  if (r.assignIngredientId) {
    const ing = ingredients.find(
      (i) => String(i.id) === r.assignIngredientId,
    );
    if (ing) return ing.name;
  }
  return r.createName.trim() || r.row.matchedIngredientName || "Unassigned";
}

/**
 * Stocktake review dialog. Mirrors the receipt log review (compact rows
 * with an "X" to ignore, a tappable ingredient pill, and an expanded
 * editor card) but with simpler fields — just ingredient, quantity, unit.
 *
 * The footer carries three "zero out anything I didn't mention in this
 * location" checkboxes (Fridge / Freezer / Pantry). Apply (N) commits
 * the decisions with overwrite semantics and the zero-out flags.
 */
export function StocktakeReviewDialog({ ingredients, open, onClose }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const entries = useStocktakeEntries();
  const parsing = useIsParsing();
  const parseError = useStocktakeParseError();
  const zeroOut = useZeroOut();

  const knownIngredients = useMemo(
    () => sortIngredientOptions(ingredients),
    [ingredients],
  );

  const [applyError, setApplyError] = useState<string | null>(null);

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
    setApplyError(null);
    onClose();
  }, [onClose]);

  const onBackdropClick = useCallback(
    (event: MouseEvent<HTMLDialogElement>) => {
      if (event.target === event.currentTarget) closeModal();
    },
    [closeModal],
  );

  const activeEntries = useMemo(
    () => entries.filter((e) => e.state.action === "set"),
    [entries],
  );
  const ignoredEntries = useMemo(
    () => entries.filter((e) => e.state.action === "ignore"),
    [entries],
  );
  const activeCount = activeStocktakeRowCount(entries);

  const handleDiscardAll = useCallback(() => {
    clearStocktakeQueue();
    setApplyError(null);
    onClose();
  }, [onClose]);

  const handleApply = useCallback(() => {
    const decisions: StocktakeDecision[] = [];
    const rowErrors: string[] = [];

    for (const entry of entries) {
      const r = entry.state;
      if (r.action === "ignore") {
        decisions.push({ action: "ignore", rawLine: r.row.rawLine });
        continue;
      }

      const qtyTrimmed = r.quantity.trim();
      if (!qtyTrimmed) {
        rowErrors.push(`"${r.row.rawLine}": quantity is required.`);
        continue;
      }
      const qty = Number(qtyTrimmed);
      if (!Number.isFinite(qty) || qty < 0) {
        rowErrors.push(`"${r.row.rawLine}": quantity must be a non-negative number.`);
        continue;
      }

      const ingredientId = r.assignIngredientId
        ? Number(r.assignIngredientId)
        : null;
      const newName = r.createName.trim();

      if (!ingredientId && !newName) {
        rowErrors.push(`"${r.row.rawLine}": pick an ingredient or give a new one a name.`);
        continue;
      }

      const productName = r.productName.trim() || null;
      const productBrand = r.productBrand.trim() || null;
      const packAmountStr = r.unitSizeAmount.trim();
      const packAmount = packAmountStr === "" ? null : Number(packAmountStr);

      decisions.push({
        action: "set",
        rawLine: r.row.rawLine,
        ingredientId,
        newIngredientName: ingredientId ? null : newName,
        quantity: qty,
        unit: r.unit.trim() || null,
        productName,
        productBrand,
        unitSizeAmount:
          packAmount != null && Number.isFinite(packAmount) && packAmount >= 0
            ? packAmount
            : null,
        unitSizeUnit: r.unitSizeUnit.trim() || null,
      });
    }

    if (rowErrors.length > 0) {
      setApplyError(rowErrors.join(" "));
      return;
    }

    setApplyError(null);
    onClose();
    setInventoryBulkBusy("Applying stocktake…");
    void (async () => {
      try {
        const result = await applyInventoryUpdateAction(decisions, zeroOut);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }

        const appliedIds = result.applied.map((a) => a.ingredientId);
        const zeroedIds = result.zeroed.map((z) => z.ingredientId);
        markApplied([...appliedIds, ...zeroedIds]);

        if (result.applied.length > 0) {
          const createdCount = result.applied.filter((a) => a.created).length;
          const updatedCount = result.applied.length - createdCount;
          const parts: string[] = [];
          if (updatedCount > 0) {
            parts.push(
              `Updated ${updatedCount} item${updatedCount === 1 ? "" : "s"}`,
            );
          }
          if (createdCount > 0) {
            parts.push(`created ${createdCount} new`);
          }
          toast.success(parts.join(", ") + ".");
        } else if (result.zeroed.length === 0) {
          toast.message("Nothing to apply.");
        }

        if (result.zeroed.length > 0) {
          toast.success(
            `Zeroed out ${result.zeroed.length} unmentioned item${
              result.zeroed.length === 1 ? "" : "s"
            }.`,
          );
        }

        if (result.errors.length > 0) {
          toast.error(
            `${result.errors.length} item${
              result.errors.length === 1 ? "" : "s"
            } couldn't be applied.`,
          );
        }

        clearStocktakeQueue();
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to apply stocktake.",
        );
      } finally {
        setInventoryBulkBusy(null);
      }
    })();
  }, [entries, zeroOut, onClose, router]);

  const showZeroOutHint =
    zeroOut.fridge || zeroOut.freezer || zeroOut.pantry;

  return (
    <dialog
      ref={dialogRef}
      className="receipt-import-dialog"
      aria-label="Review stocktake"
      onClick={onBackdropClick}
    >
      <div className="receipt-import-dialog-surface">
        <header className="receipt-import-dialog-header">
          <h2 className="receipt-import-dialog-title">Review stocktake</h2>
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
          {applyError ? (
            <p className="receipt-import-error" role="alert">
              {applyError}
            </p>
          ) : null}
          {parseError ? (
            <p className="receipt-import-error" role="alert">
              {parseError}
            </p>
          ) : null}

          {parsing ? (
            <p className="receipt-import-empty">
              <CircleNotch
                size={16}
                weight="bold"
                className="inventory-receipt-pill-spinner"
                aria-hidden
              />
              <span style={{ marginLeft: 8 }}>Reading your stocktake…</span>
            </p>
          ) : null}

          {!parsing && entries.length === 0 ? (
            <p className="receipt-import-empty">
              Nothing to review yet. Open the &quot;Update inventory&quot; option
              from the + menu to dictate a stocktake.
            </p>
          ) : null}

          {activeEntries.length > 0 ? (
            <section>
              <h3 className="receipt-import-subtitle">
                To apply ({activeEntries.length})
              </h3>
              <p className="receipt-import-help">
                Each item below will OVERWRITE the on-hand quantity for the
                matched ingredient. New names create a new ingredient.
              </p>
              <ul className="receipt-import-review-list">
                {activeEntries.map((entry) => (
                  <StocktakeRowItem
                    key={entry.id}
                    entry={entry}
                    ingredients={knownIngredients}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {ignoredEntries.length > 0 ? (
            <section>
              <h3 className="receipt-import-subtitle">
                Skipped ({ignoredEntries.length})
              </h3>
              <p className="receipt-import-help">
                These phrases didn&apos;t carry a clear quantity. Click
                Include to set one anyway.
              </p>
              <ul className="receipt-import-review-list">
                {ignoredEntries.map((entry) => (
                  <StocktakeIgnoredRow key={entry.id} entry={entry} />
                ))}
              </ul>
            </section>
          ) : null}

          {entries.length > 0 ? (
            <section className="stocktake-zero-out">
              <h3 className="receipt-import-subtitle">
                Zero out anything I didn&apos;t mention in
              </h3>
              <p className="receipt-import-help">
                Tick a location to also reset every inventory row in that
                location whose ingredient didn&apos;t come up in your
                dictation. Treat this as a &quot;wipe everything I forgot&quot;
                switch — useful when you&apos;ve actually scanned an entire
                fridge/freezer/pantry top to bottom.
              </p>
              <div className="stocktake-zero-out-grid">
                <label className="stocktake-zero-out-option">
                  <input
                    type="checkbox"
                    checked={zeroOut.fridge}
                    onChange={(e) => setZeroOut({ fridge: e.target.checked })}
                  />
                  <span>Fridge</span>
                </label>
                <label className="stocktake-zero-out-option">
                  <input
                    type="checkbox"
                    checked={zeroOut.freezer}
                    onChange={(e) => setZeroOut({ freezer: e.target.checked })}
                  />
                  <span>Freezer</span>
                </label>
                <label className="stocktake-zero-out-option">
                  <input
                    type="checkbox"
                    checked={zeroOut.pantry}
                    onChange={(e) => setZeroOut({ pantry: e.target.checked })}
                  />
                  <span>Pantry</span>
                </label>
              </div>
              {showZeroOutHint ? (
                <p
                  className="receipt-import-help stocktake-zero-out-warn"
                  role="note"
                >
                  Heads up: applying with these ticked will set every
                  unmentioned item in the chosen location(s) to 0. There&apos;s
                  no undo.
                </p>
              ) : null}
            </section>
          ) : null}
        </div>

        <footer className="receipt-import-dialog-footer">
          <button
            type="button"
            className="receipt-import-secondary"
            onClick={handleDiscardAll}
            disabled={entries.length === 0 && !parsing}
          >
            Discard all
          </button>
          <button
            type="button"
            className="receipt-import-primary"
            onClick={handleApply}
            disabled={
              parsing ||
              (activeCount === 0 &&
                !zeroOut.fridge &&
                !zeroOut.freezer &&
                !zeroOut.pantry)
            }
          >
            {activeCount > 0 ? `Apply (${activeCount})` : "Apply"}
          </button>
        </footer>
      </div>
    </dialog>
  );
}

/* ----------------------------------------------------------------------- */
/*  Row renderers                                                          */
/* ----------------------------------------------------------------------- */

function StocktakeRowItem({
  entry,
  ingredients,
}: {
  entry: StocktakeRowEntry;
  ingredients: IngredientOption[];
}) {
  const r = entry.state;
  const onChange = useCallback(
    (patch: Partial<StocktakeRowState>) => patchRow(entry.id, patch),
    [entry.id],
  );

  const [isEditingMap, setIsEditingMap] = useState(false);
  const mappedLabel = mappedIngredientLabel(r, ingredients);
  const isNew = !r.assignIngredientId;

  const expandRow = useCallback(() => {
    if (isEditingMap) {
      setIsEditingMap(false);
      return;
    }
    onChange({ expanded: true });
  }, [isEditingMap, onChange]);

  if (!r.expanded) {
    return (
      <li
        className={`receipt-import-row receipt-import-row-compact${
          isEditingMap ? " is-editing-map" : ""
        }`}
      >
        <button
          type="button"
          className="receipt-import-compact-exclude"
          onClick={(e) => {
            e.stopPropagation();
            ignoreRow(entry.id);
          }}
          aria-label={`Skip ${r.row.rawLine}`}
          title="Skip"
        >
          <X size={12} weight="bold" aria-hidden />
        </button>
        <div className="receipt-import-compact-card">
          <button
            type="button"
            className="receipt-import-compact-body"
            onClick={expandRow}
            aria-label={`Edit stocktake for ${mappedLabel}`}
          >
            <span className="receipt-import-compact-main">
              <span className="receipt-import-compact-product">
                <span className="receipt-import-compact-name">
                  {r.row.rawLine}
                </span>
              </span>
              <span className="receipt-import-compact-price">
                {compactQuantityLabel(r)}
              </span>
              {compactBrandLabel(r) ? (
                <span
                  className="receipt-import-compact-risk"
                  title="A preferred product will be saved with this stocktake."
                >
                  {compactBrandLabel(r)}
                </span>
              ) : null}
            </span>
          </button>
          <div className="receipt-import-compact-mapped-slot">
            {isEditingMap ? (
              <IngredientSearchControl
                knownIngredients={ingredients}
                disabled={false}
                placeholder="Search or create ingredient"
                ariaLabel="Map to"
                inputId={`st-inline-${entry.id}`}
                defaultQuery={mappedLabel}
                autoFocus
                onCancel={() => setIsEditingMap(false)}
                onPickSuggestion={(suggestion: IngredientSuggestion) => {
                  if (suggestion.kind === "existing") {
                    onChange({
                      assignIngredientId: String(suggestion.ingredient.id),
                      createName: suggestion.ingredient.name,
                    });
                  } else {
                    onChange({
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
    <li className="receipt-import-row receipt-import-row-expanded">
      <div className="receipt-import-card">
        <div className="receipt-import-card-raw">{r.row.rawLine}</div>

        <div className="receipt-import-card-section">
          <div className="receipt-import-field">
            <label
              className="receipt-import-field-label"
              htmlFor={`st-name-${entry.id}`}
            >
              Map to
            </label>
            <IngredientSearchControl
              knownIngredients={ingredients}
              disabled={false}
              placeholder="Search or create ingredient"
              ariaLabel="Map to"
              inputId={`st-name-${entry.id}`}
              defaultQuery={mappedLabel}
              onQueryChange={(query) =>
                onChange({ assignIngredientId: "", createName: query })
              }
              onPickSuggestion={(suggestion: IngredientSuggestion) => {
                if (suggestion.kind === "existing") {
                  onChange({
                    assignIngredientId: String(suggestion.ingredient.id),
                    createName: suggestion.ingredient.name,
                  });
                  return;
                }
                onChange({
                  assignIngredientId: "",
                  createName: suggestion.name,
                });
              }}
            />
          </div>
        </div>

        <div className="receipt-import-card-section">
          <div className="receipt-import-card-row receipt-import-card-row-3">
            <div className="receipt-import-field">
              <label
                className="receipt-import-field-label"
                htmlFor={`st-qty-${entry.id}`}
              >
                On-hand quantity
              </label>
              <input
                id={`st-qty-${entry.id}`}
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                className="receipt-import-input"
                value={r.quantity}
                onChange={(e) => onChange({ quantity: e.target.value })}
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
                aria-label="Stock unit"
                className="receipt-import-select"
                value={r.unit}
                onChange={(e) => onChange({ unit: e.target.value })}
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
            Brand &amp; product (optional)
          </summary>
          <p className="receipt-import-help">
            Filled in automatically when you named a brand. Leave both blank
            to skip the preferred-product entry — the stock-only update
            still applies.
          </p>
          <div className="receipt-import-card-section receipt-import-card-section-nested">
            <div className="receipt-import-card-row">
              <div className="receipt-import-field">
                <label
                  className="receipt-import-field-label"
                  htmlFor={`st-brand-${entry.id}`}
                >
                  Brand
                </label>
                <input
                  id={`st-brand-${entry.id}`}
                  className="receipt-import-input"
                  value={r.productBrand}
                  onChange={(e) => onChange({ productBrand: e.target.value })}
                  placeholder="—"
                />
              </div>
              <div className="receipt-import-field">
                <label
                  className="receipt-import-field-label"
                  htmlFor={`st-product-${entry.id}`}
                >
                  Product
                </label>
                <input
                  id={`st-product-${entry.id}`}
                  className="receipt-import-input"
                  value={r.productName}
                  onChange={(e) => onChange({ productName: e.target.value })}
                  placeholder="Product name"
                />
              </div>
            </div>
            <div className="receipt-import-card-row">
              <div className="receipt-import-field">
                <label
                  className="receipt-import-field-label"
                  htmlFor={`st-pack-${entry.id}`}
                >
                  Pack size
                </label>
                <div className="receipt-import-qty-group">
                  <input
                    id={`st-pack-${entry.id}`}
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    className="receipt-import-input receipt-import-input-qty"
                    value={r.unitSizeAmount}
                    onChange={(e) =>
                      onChange({ unitSizeAmount: e.target.value })
                    }
                    placeholder="—"
                  />
                  <select
                    aria-label="Pack size unit"
                    className="receipt-import-select"
                    value={r.unitSizeUnit}
                    onChange={(e) => onChange({ unitSizeUnit: e.target.value })}
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
          </div>
        </details>

        <div className="receipt-import-card-actions">
          <button
            type="button"
            className="receipt-import-row-action receipt-import-row-action-danger"
            onClick={() => dismissRow(entry.id)}
          >
            Remove from list
          </button>
          <button
            type="button"
            className="receipt-import-row-action"
            onClick={() => onChange({ expanded: false })}
          >
            Done
          </button>
        </div>
      </div>
    </li>
  );
}

function StocktakeIgnoredRow({ entry }: { entry: StocktakeRowEntry }) {
  const r = entry.state;
  const reason =
    r.row.skipReason ?? "No quantity in the phrase.";
  return (
    <li className="receipt-import-row receipt-import-excluded-row">
      <div className="receipt-import-excluded-card">
        <div className="receipt-import-compact-main">
          <div className="receipt-import-compact-product">
            <span className="receipt-import-compact-name">{r.row.rawLine}</span>
          </div>
          <div className="receipt-import-compact-price">{reason}</div>
        </div>
        <button
          type="button"
          className="receipt-import-row-action receipt-import-row-action-include"
          onClick={() => reviveIgnoredRow(entry.id)}
          aria-label={`Include ${r.row.rawLine}`}
        >
          <span>Include</span>
        </button>
      </div>
    </li>
  );
}
