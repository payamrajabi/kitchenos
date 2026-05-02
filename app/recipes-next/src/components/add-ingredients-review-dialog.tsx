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
  applyAddIngredientsAction,
  type AddIngredientDecision,
} from "@/app/actions/inventory-bulk";
import {
  ADD_STORAGE_LOCATIONS,
  type AddStorageLocation,
} from "@/lib/inventory-bulk/parse-add-ingredients";
import {
  IngredientSearchControl,
  sortIngredientOptions,
  type IngredientOption,
  type IngredientSuggestion,
} from "@/components/ingredient-search-control";
import { INGREDIENT_GROCERY_CATEGORIES } from "@/lib/ingredient-grocery-category";
import { INGREDIENT_TAXONOMY_SUBCATEGORIES } from "@/lib/ingredient-backbone-inference";
import { getTopLayerHost, setTopLayerHost } from "@/lib/top-layer-host";
import { setInventoryBulkBusy } from "@/lib/inventory-bulk/applying";
import { markApplied } from "@/lib/receipt-import/recent-applied";
import {
  activeAddRowCount,
  clearAddIngredientsQueue,
  dismissAddRow,
  ignoreAddRow,
  patchAddRow,
  reviveIgnoredAddRow,
  useAddIngredientsEntries,
  useAddParseError,
  useIsAddParsing,
  type AddIngredientRowEntry,
  type AddIngredientRowState,
} from "@/lib/inventory-bulk/add-ingredients-queue";

type Props = {
  /** Existing ingredient catalog (for assignment + parent search). */
  ingredients: { id: number; name: string; parentIngredientId?: number | null }[];
  open: boolean;
  onClose: () => void;
};

function nameLabel(r: AddIngredientRowState): string {
  if (r.assignIngredientId) return r.createName || r.row.matchedIngredientName || "";
  return r.createName.trim() || r.row.newIngredientName || r.row.rawLine;
}

/**
 * Review dialog for the AI-enriched "Add ingredients" flow. Each row
 * shows the cleaned name, the suggested grocery category, culinary
 * subcategory, parent ingredient (when one fits), and storage location.
 * The user can edit any of those before clicking Apply, which creates
 * the new ingredients + a default inventory row at the chosen storage
 * location. NEVER touches stock quantities.
 */
export function AddIngredientsReviewDialog({
  ingredients,
  open,
  onClose,
}: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const entries = useAddIngredientsEntries();
  const parsing = useIsAddParsing();
  const parseError = useAddParseError();

  const knownIngredients = useMemo(
    () => sortIngredientOptions(ingredients),
    [ingredients],
  );

  const rootIngredients = useMemo(
    () =>
      knownIngredients.filter((i) => !i.parentIngredientId),
    [knownIngredients],
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
    () => entries.filter((e) => e.state.action === "create"),
    [entries],
  );
  const ignoredEntries = useMemo(
    () => entries.filter((e) => e.state.action === "ignore"),
    [entries],
  );
  const activeCount = activeAddRowCount(entries);

  const handleDiscardAll = useCallback(() => {
    clearAddIngredientsQueue();
    setApplyError(null);
    onClose();
  }, [onClose]);

  const handleApply = useCallback(() => {
    const decisions: AddIngredientDecision[] = [];
    const rowErrors: string[] = [];

    for (const entry of entries) {
      const r = entry.state;
      if (r.action === "ignore") {
        decisions.push({ action: "ignore", rawLine: r.row.rawLine });
        continue;
      }

      const ingredientId = r.assignIngredientId
        ? Number(r.assignIngredientId)
        : null;
      const newName = r.createName.trim();

      if (!ingredientId && !newName) {
        rowErrors.push(
          `"${r.row.rawLine}": pick an ingredient or give a new one a name.`,
        );
        continue;
      }

      const parentId = r.parentIngredientId
        ? Number(r.parentIngredientId)
        : null;

      decisions.push({
        action: "create",
        rawLine: r.row.rawLine,
        assignIngredientId: ingredientId,
        newIngredientName: ingredientId ? null : newName,
        groceryCategory: r.groceryCategory || null,
        taxonomySubcategory: r.taxonomySubcategory || null,
        parentIngredientId:
          parentId != null && Number.isFinite(parentId) ? parentId : null,
        storageLocation: (r.storageLocation || null) as
          | AddStorageLocation
          | null,
        storageHints: r.storageHints.length ? r.storageHints : null,
      });
    }

    if (rowErrors.length > 0) {
      setApplyError(rowErrors.join(" "));
      return;
    }

    setApplyError(null);
    onClose();
    setInventoryBulkBusy("Adding ingredients…");
    void (async () => {
      try {
        const result = await applyAddIngredientsAction(decisions);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }

        const createdIds = result.created.map((c) => c.id);
        const existingIds = result.existing.map((c) => c.id);
        markApplied([...createdIds, ...existingIds]);

        const totalCreated = result.created.length;
        const totalExisting = result.existing.length;
        if (totalCreated > 0 && totalExisting > 0) {
          toast.success(
            `Added ${totalCreated} new; ${totalExisting} already existed.`,
          );
        } else if (totalCreated > 0) {
          toast.success(
            `Added ${totalCreated} new ingredient${totalCreated === 1 ? "" : "s"}.`,
          );
        } else if (totalExisting > 0) {
          toast.message(
            `${totalExisting} ingredient${
              totalExisting === 1 ? " already existed" : "s already existed"
            }.`,
          );
        } else {
          toast.message("Nothing to add.");
        }

        if (result.errors.length > 0) {
          toast.error(
            `${result.errors.length} item${
              result.errors.length === 1 ? "" : "s"
            } couldn't be added.`,
          );
        }

        clearAddIngredientsQueue();
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to add ingredients.",
        );
      } finally {
        setInventoryBulkBusy(null);
      }
    })();
  }, [entries, onClose, router]);

  return (
    <dialog
      ref={dialogRef}
      className="receipt-import-dialog"
      aria-label="Review new ingredients"
      onClick={onBackdropClick}
    >
      <div className="receipt-import-dialog-surface">
        <header className="receipt-import-dialog-header">
          <h2 className="receipt-import-dialog-title">Review new ingredients</h2>
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
              <span style={{ marginLeft: 8 }}>Classifying ingredients…</span>
            </p>
          ) : null}

          {!parsing && entries.length === 0 ? (
            <p className="receipt-import-empty">
              Nothing to review yet. Open the &quot;Add ingredient&quot;
              option from the + menu to start.
            </p>
          ) : null}

          {activeEntries.length > 0 ? (
            <section>
              <h3 className="receipt-import-subtitle">
                To create ({activeEntries.length})
              </h3>
              <p className="receipt-import-help">
                Each item below will create a new ingredient in your catalog
                with the chosen category, subcategory, parent, and storage
                location — and a stock-zero inventory row at that location.
                Existing ingredients (matched by name) are surfaced so you
                can confirm without duplicates.
              </p>
              <ul className="receipt-import-review-list">
                {activeEntries.map((entry) => (
                  <AddIngredientRowItem
                    key={entry.id}
                    entry={entry}
                    ingredients={knownIngredients}
                    rootIngredients={rootIngredients}
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
                These phrases didn&apos;t look like ingredients. Click
                Include to add them anyway.
              </p>
              <ul className="receipt-import-review-list">
                {ignoredEntries.map((entry) => (
                  <AddIngredientIgnoredRow key={entry.id} entry={entry} />
                ))}
              </ul>
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
            disabled={parsing || activeCount === 0}
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

function AddIngredientRowItem({
  entry,
  ingredients,
  rootIngredients,
}: {
  entry: AddIngredientRowEntry;
  ingredients: IngredientOption[];
  rootIngredients: IngredientOption[];
}) {
  const r = entry.state;
  const onChange = useCallback(
    (patch: Partial<AddIngredientRowState>) => patchAddRow(entry.id, patch),
    [entry.id],
  );

  const [isEditingMap, setIsEditingMap] = useState(false);
  const label = nameLabel(r);
  const isExisting = Boolean(r.assignIngredientId);

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
            ignoreAddRow(entry.id);
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
            aria-label={`Edit classification for ${label}`}
          >
            <span className="receipt-import-compact-main">
              <span className="receipt-import-compact-product">
                <span className="receipt-import-compact-name">{label}</span>
              </span>
              <span className="receipt-import-compact-price">
                {r.storageLocation || "—"}
              </span>
              <span className="receipt-import-compact-risk" title="AI summary">
                {[
                  r.groceryCategory || null,
                  r.taxonomySubcategory || null,
                  r.parentIngredientName ? `↳ ${r.parentIngredientName}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Uncategorised"}
              </span>
            </span>
          </button>
          <div className="receipt-import-compact-mapped-slot">
            {isEditingMap ? (
              <IngredientSearchControl
                knownIngredients={ingredients}
                disabled={false}
                placeholder="Search or create ingredient"
                ariaLabel="Map to"
                inputId={`add-inline-${entry.id}`}
                defaultQuery={label}
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
                  isExisting ? "" : " is-new"
                }`}
                onClick={() => setIsEditingMap(true)}
                aria-label={`Change ingredient name (currently ${label})`}
              >
                {isExisting ? label : `+ ${label}`}
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
              htmlFor={`add-name-${entry.id}`}
            >
              Ingredient
            </label>
            <IngredientSearchControl
              knownIngredients={ingredients}
              disabled={false}
              placeholder="Search or create ingredient"
              ariaLabel="Map to"
              inputId={`add-name-${entry.id}`}
              defaultQuery={label}
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
            {isExisting ? (
              <p className="receipt-import-help">
                Already in your catalog. Apply will just make sure an
                inventory row exists for the chosen storage location and
                won&apos;t change category / subcategory / parent.
              </p>
            ) : null}
          </div>
        </div>

        <div className="receipt-import-card-section">
          <div className="receipt-import-card-row receipt-import-card-row-3">
            <div className="receipt-import-field">
              <label
                className="receipt-import-field-label"
                htmlFor={`add-grocery-${entry.id}`}
              >
                Grocery category
              </label>
              <select
                id={`add-grocery-${entry.id}`}
                className="receipt-import-select"
                value={r.groceryCategory}
                onChange={(e) =>
                  onChange({ groceryCategory: e.target.value })
                }
                disabled={isExisting}
              >
                <option value="">—</option>
                {INGREDIENT_GROCERY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="receipt-import-field">
              <label
                className="receipt-import-field-label"
                htmlFor={`add-sub-${entry.id}`}
              >
                Subcategory
              </label>
              <select
                id={`add-sub-${entry.id}`}
                className="receipt-import-select"
                value={r.taxonomySubcategory}
                onChange={(e) =>
                  onChange({ taxonomySubcategory: e.target.value })
                }
                disabled={isExisting}
              >
                <option value="">—</option>
                {INGREDIENT_TAXONOMY_SUBCATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="receipt-import-card-row receipt-import-card-row-3">
            <div className="receipt-import-field">
              <label
                className="receipt-import-field-label"
                htmlFor={`add-parent-${entry.id}`}
              >
                Parent ingredient
              </label>
              <select
                id={`add-parent-${entry.id}`}
                className="receipt-import-select"
                value={r.parentIngredientId}
                onChange={(e) => {
                  const id = e.target.value;
                  const parent = rootIngredients.find(
                    (p) => String(p.id) === id,
                  );
                  onChange({
                    parentIngredientId: id,
                    parentIngredientName: parent?.name ?? "",
                  });
                }}
                disabled={isExisting}
              >
                <option value="">No parent (top-level)</option>
                {rootIngredients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="receipt-import-field">
              <label
                className="receipt-import-field-label"
                htmlFor={`add-storage-${entry.id}`}
              >
                Storage location
              </label>
              <select
                id={`add-storage-${entry.id}`}
                className="receipt-import-select"
                value={r.storageLocation}
                onChange={(e) =>
                  onChange({
                    storageLocation: e.target.value as
                      | AddStorageLocation
                      | "",
                  })
                }
              >
                <option value="">—</option>
                {ADD_STORAGE_LOCATIONS.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="receipt-import-card-actions">
          <button
            type="button"
            className="receipt-import-row-action receipt-import-row-action-danger"
            onClick={() => dismissAddRow(entry.id)}
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

function AddIngredientIgnoredRow({ entry }: { entry: AddIngredientRowEntry }) {
  const r = entry.state;
  const reason = r.row.skipReason ?? "Didn't look like an ingredient.";
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
          onClick={() => reviveIgnoredAddRow(entry.id)}
          aria-label={`Include ${r.row.rawLine}`}
        >
          <span>Include</span>
        </button>
      </div>
    </li>
  );
}
