"use client";

import {
  useMemo,
  useState,
  useTransition,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  generateUnitCleanupSqlAction,
  saveUnitCleanupReviewAction,
} from "@/app/actions/inventory-unit-cleanup-review";
import {
  isInventoryRecipeUnitApproved,
  isInventoryStockUnitApproved,
  isProductPriceBasisApproved,
  isProductUnitSizeApproved,
  type InventoryReviewItem,
  type ProductPriceBasisSuggestion,
  type ProductReviewItem,
  type UnitCleanupReviewFile,
} from "@/lib/inventory-unit-cleanup/recommendations";
import { INGREDIENT_UNITS } from "@/lib/unit-mapping";

const PRICE_BASIS_OPTIONS: { value: ProductPriceBasisSuggestion | ""; label: string }[] = [
  { value: "", label: "-" },
  { value: "package", label: "package" },
  { value: "weight", label: "weight" },
  { value: "unit", label: "unit" },
];

type ActiveTab = "inventory" | "products";

type Props = {
  fileName: string;
  initialReview: UnitCleanupReviewFile;
};

export function UnitCleanupReviewTable({ fileName, initialReview }: Props) {
  const [review, setReview] = useState(initialReview);
  const [tab, setTab] = useState<ActiveTab>("inventory");
  const [query, setQuery] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [changesOnly, setChangesOnly] = useState(true);
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const inventoryRows = useMemo(
    () =>
      review.inventoryRecommendations.filter((row) =>
        includeInventoryRow(row, { query, reviewOnly, changesOnly, approvedOnly }),
      ),
    [
      review.inventoryRecommendations,
      query,
      reviewOnly,
      changesOnly,
      approvedOnly,
    ],
  );

  const productRows = useMemo(
    () =>
      review.productRecommendations.filter((row) =>
        includeProductRow(row, { query, reviewOnly, changesOnly, approvedOnly }),
      ),
    [review.productRecommendations, query, reviewOnly, changesOnly, approvedOnly],
  );

  const summary = useMemo(() => buildSummary(review), [review]);
  const visibleCount = tab === "inventory" ? inventoryRows.length : productRows.length;

  const save = () => {
    setStatus("Saving review file...");
    startTransition(async () => {
      const result = await saveUnitCleanupReviewAction(fileName, review);
      setStatus(result.ok ? "Saved." : result.error);
    });
  };

  const generateSql = () => {
    setStatus("Saving review and generating SQL...");
    startTransition(async () => {
      const result = await generateUnitCleanupSqlAction(fileName, review);
      setStatus(
        result.ok
          ? `SQL generated at ${result.outputPath}`
          : result.error,
      );
    });
  };

  const approveVisibleRows = () => {
    if (tab === "inventory") {
      const ids = new Set(inventoryRows.map((row) => row.inventoryItemId));
      setReview((current) => ({
        ...current,
        inventoryRecommendations: current.inventoryRecommendations.map((row) =>
          ids.has(row.inventoryItemId)
            ? {
                ...row,
                approved: true,
                approveStockUnit: false,
                approveRecipeUnit: false,
              }
            : row,
        ),
      }));
      return;
    }

    const ids = new Set(productRows.map((row) => row.productId));
    setReview((current) => ({
      ...current,
      productRecommendations: current.productRecommendations.map((row) =>
        ids.has(row.productId)
          ? {
              ...row,
              approved: true,
              approveUnitSize: false,
              approvePriceBasis: false,
            }
          : row,
      ),
    }));
  };

  const clearVisibleRows = () => {
    if (tab === "inventory") {
      const ids = new Set(inventoryRows.map((row) => row.inventoryItemId));
      setReview((current) => ({
        ...current,
        inventoryRecommendations: current.inventoryRecommendations.map((row) =>
          ids.has(row.inventoryItemId)
            ? {
                ...row,
                approved: false,
                approveStockUnit: false,
                approveRecipeUnit: false,
              }
            : row,
        ),
      }));
      return;
    }

    const ids = new Set(productRows.map((row) => row.productId));
    setReview((current) => ({
      ...current,
      productRecommendations: current.productRecommendations.map((row) =>
        ids.has(row.productId)
          ? {
              ...row,
              approved: false,
              approveUnitSize: false,
              approvePriceBasis: false,
            }
          : row,
      ),
    }));
  };

  return (
    <div style={shellStyle}>
      <section style={toolbarStyle}>
        <div style={statsGridStyle}>
          <Stat label="Inventory" value={review.inventoryRecommendations.length} />
          <Stat label="Products" value={review.productRecommendations.length} />
          <Stat label="Needs review" value={summary.needsReview} />
          <Stat label="Approved fields" value={summary.approvedFields} />
        </div>

        <div style={controlsStyle}>
          <div style={tabListStyle} aria-label="Review section">
            <button
              type="button"
              style={tab === "inventory" ? tabActiveStyle : tabButtonStyle}
              onClick={() => setTab("inventory")}
            >
              Inventory
            </button>
            <button
              type="button"
              style={tab === "products" ? tabActiveStyle : tabButtonStyle}
              onClick={() => setTab("products")}
            >
              Products
            </button>
          </div>

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search ingredient, unit, product, reason..."
            style={searchStyle}
            aria-label="Search recommendations"
          />

          <label style={toggleStyle}>
            <input
              type="checkbox"
              checked={reviewOnly}
              onChange={(event) => setReviewOnly(event.target.checked)}
            />
            Needs review
          </label>
          <label style={toggleStyle}>
            <input
              type="checkbox"
              checked={changesOnly}
              onChange={(event) => setChangesOnly(event.target.checked)}
            />
            Changes only
          </label>
          <label style={toggleStyle}>
            <input
              type="checkbox"
              checked={approvedOnly}
              onChange={(event) => setApprovedOnly(event.target.checked)}
            />
            Approved only
          </label>
        </div>

        <div style={actionBarStyle}>
          <span style={visibleStyle}>{visibleCount} visible</span>
          <button type="button" className="secondary" onClick={approveVisibleRows}>
            Approve visible rows
          </button>
          <button type="button" className="secondary" onClick={clearVisibleRows}>
            Clear visible
          </button>
          <button type="button" className="secondary" onClick={save} disabled={isPending}>
            Save review
          </button>
          <button type="button" onClick={generateSql} disabled={isPending}>
            Generate SQL
          </button>
        </div>

        {status ? <p style={statusStyle}>{status}</p> : null}
      </section>

      {tab === "inventory" ? (
        <InventoryTable
          rows={inventoryRows}
          onToggleRow={(id) => toggleInventoryRow(setReview, id)}
          onToggleStock={(id) => toggleInventoryField(setReview, id, "stock")}
          onToggleRecipe={(id) => toggleInventoryField(setReview, id, "recipe")}
          onEditStockUnit={(id, next) =>
            editInventoryUnit(setReview, id, "stock", next)
          }
          onEditRecipeUnit={(id, next) =>
            editInventoryUnit(setReview, id, "recipe", next)
          }
        />
      ) : (
        <ProductTable
          rows={productRows}
          onToggleRow={(id) => toggleProductRow(setReview, id)}
          onToggleUnitSize={(id) => toggleProductField(setReview, id, "unitSize")}
          onTogglePriceBasis={(id) =>
            toggleProductField(setReview, id, "priceBasis")
          }
          onEditUnitSize={(id, next) => editProductUnitSize(setReview, id, next)}
          onEditPriceBasis={(id, next) =>
            editProductPriceBasis(setReview, id, next)
          }
        />
      )}
    </div>
  );
}

function InventoryTable({
  rows,
  onToggleRow,
  onToggleStock,
  onToggleRecipe,
  onEditStockUnit,
  onEditRecipeUnit,
}: {
  rows: InventoryReviewItem[];
  onToggleRow: (id: number) => void;
  onToggleStock: (id: number) => void;
  onToggleRecipe: (id: number) => void;
  onEditStockUnit: (id: number, nextUnit: string) => void;
  onEditRecipeUnit: (id: number, nextUnit: string) => void;
}) {
  return (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <Th>Approve</Th>
            <Th>Ingredient</Th>
            <Th>Stock unit</Th>
            <Th>Recipe unit</Th>
            <Th>Confidence</Th>
            <Th>Reason</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const stockApproved = isInventoryStockUnitApproved(row);
            const recipeApproved = isInventoryRecipeUnitApproved(row);
            return (
              <tr key={row.inventoryItemId} style={rowStyle(row.needsReview)}>
                <Td>
                  <button
                    type="button"
                    style={row.approved ? approveActiveStyle : approveButtonStyle}
                    aria-pressed={row.approved}
                    onClick={() => onToggleRow(row.inventoryItemId)}
                  >
                    Row
                  </button>
                </Td>
                <Td>
                  <strong>{row.ingredientName}</strong>
                  <div style={mutedStyle}>#{row.inventoryItemId} · {row.storageLocation}</div>
                </Td>
                <Td>
                  <EditableUnitDiff
                    before={row.currentStockUnit}
                    after={row.suggestedStockUnit}
                    approved={stockApproved}
                    onChange={(next) =>
                      onEditStockUnit(row.inventoryItemId, next)
                    }
                    onToggle={() => onToggleStock(row.inventoryItemId)}
                  />
                </Td>
                <Td>
                  <EditableUnitDiff
                    before={row.currentRecipeUnit}
                    after={row.suggestedRecipeUnit}
                    approved={recipeApproved}
                    onChange={(next) =>
                      onEditRecipeUnit(row.inventoryItemId, next)
                    }
                    onToggle={() => onToggleRecipe(row.inventoryItemId)}
                  />
                </Td>
                <Td>
                  <Confidence value={row.confidence} needsReview={row.needsReview} />
                </Td>
                <Td>
                  <span style={reasonStyle}>{row.reason}</span>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProductTable({
  rows,
  onToggleRow,
  onToggleUnitSize,
  onTogglePriceBasis,
  onEditUnitSize,
  onEditPriceBasis,
}: {
  rows: ProductReviewItem[];
  onToggleRow: (id: number) => void;
  onToggleUnitSize: (id: number) => void;
  onTogglePriceBasis: (id: number) => void;
  onEditUnitSize: (
    id: number,
    next: { amount: number | null; unit: string | null },
  ) => void;
  onEditPriceBasis: (
    id: number,
    next: {
      basis: ProductPriceBasisSuggestion | null;
      amount: number | null;
      unit: string | null;
    },
  ) => void;
}) {
  return (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <Th>Approve</Th>
            <Th>Product</Th>
            <Th>Package size</Th>
            <Th>Price basis</Th>
            <Th>Confidence</Th>
            <Th>Reason</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const unitSizeApproved = isProductUnitSizeApproved(row);
            const priceBasisApproved = isProductPriceBasisApproved(row);
            return (
              <tr key={row.productId} style={rowStyle(row.needsReview)}>
                <Td>
                  <button
                    type="button"
                    style={row.approved ? approveActiveStyle : approveButtonStyle}
                    aria-pressed={row.approved}
                    onClick={() => onToggleRow(row.productId)}
                  >
                    Row
                  </button>
                </Td>
                <Td>
                  <strong>{row.productName}</strong>
                  <div style={mutedStyle}>
                    #{row.productId} · {row.ingredientName}
                    {row.brand ? ` · ${row.brand}` : ""}
                  </div>
                </Td>
                <Td>
                  <EditableUnitSize
                    beforeLabel={formatAmountUnit(
                      row.currentUnitSizeAmount,
                      row.currentUnitSizeUnit,
                    )}
                    amount={row.suggestedUnitSizeAmount}
                    unit={row.suggestedUnitSizeUnit}
                    approved={unitSizeApproved}
                    onChange={(next) => onEditUnitSize(row.productId, next)}
                    onToggle={() => onToggleUnitSize(row.productId)}
                  />
                </Td>
                <Td>
                  <EditablePriceBasis
                    beforeLabel={formatPriceBasis(
                      row.currentPriceBasis,
                      row.currentPriceBasisAmount,
                      row.currentPriceBasisUnit,
                    )}
                    basis={row.suggestedPriceBasis}
                    amount={row.suggestedPriceBasisAmount}
                    unit={row.suggestedPriceBasisUnit}
                    approved={priceBasisApproved}
                    onChange={(next) => onEditPriceBasis(row.productId, next)}
                    onToggle={() => onTogglePriceBasis(row.productId)}
                  />
                </Td>
                <Td>
                  <Confidence value={row.confidence} needsReview={row.needsReview} />
                </Td>
                <Td>
                  <span style={reasonStyle}>{row.reason}</span>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EditableUnitDiff({
  before,
  after,
  approved,
  onChange,
  onToggle,
}: {
  before: string | null;
  after: string;
  approved: boolean;
  onChange: (nextUnit: string) => void;
  onToggle: () => void;
}) {
  const changed = (before ?? null) !== after;
  return (
    <div style={unitDiffStyle}>
      <div style={unitLineStyle}>
        <span style={beforeStyle}>{before || "-"}</span>
        <span aria-hidden="true">→</span>
        <select
          value={after}
          onChange={(event) => onChange(event.target.value)}
          style={changed ? editSelectChangedStyle : editSelectStyle}
          aria-label="Suggested unit"
        >
          {INGREDIENT_UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        style={approved ? approveActiveStyle : approveButtonStyle}
        aria-pressed={approved}
        onClick={onToggle}
      >
        {approved ? "Approved" : "Approve field"}
      </button>
    </div>
  );
}

function EditableUnitSize({
  beforeLabel,
  amount,
  unit,
  approved,
  onChange,
  onToggle,
}: {
  beforeLabel: string | null;
  amount: number | null;
  unit: string | null;
  approved: boolean;
  onChange: (next: { amount: number | null; unit: string | null }) => void;
  onToggle: () => void;
}) {
  const afterLabel = formatAmountUnit(amount, unit);
  const changed = (beforeLabel ?? null) !== (afterLabel ?? null);
  const wrapStyle = changed ? editSelectChangedStyle : editSelectStyle;
  return (
    <div style={unitDiffStyle}>
      <div style={unitLineStyle}>
        <span style={beforeStyle}>{beforeLabel || "-"}</span>
        <span aria-hidden="true">→</span>
        <div style={inlineEditGroupStyle}>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={amount == null ? "" : amount}
            placeholder="-"
            onChange={(event) =>
              onChange({
                amount: parsePositiveNumber(event.target.value),
                unit,
              })
            }
            style={{ ...wrapStyle, width: 80 }}
            aria-label="Suggested package amount"
          />
          <select
            value={unit ?? ""}
            onChange={(event) =>
              onChange({ amount, unit: event.target.value || null })
            }
            style={wrapStyle}
            aria-label="Suggested package unit"
          >
            <option value="">-</option>
            {INGREDIENT_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button
        type="button"
        style={approved ? approveActiveStyle : approveButtonStyle}
        aria-pressed={approved}
        onClick={onToggle}
      >
        {approved ? "Approved" : "Approve field"}
      </button>
    </div>
  );
}

function EditablePriceBasis({
  beforeLabel,
  basis,
  amount,
  unit,
  approved,
  onChange,
  onToggle,
}: {
  beforeLabel: string | null;
  basis: ProductPriceBasisSuggestion | null;
  amount: number | null;
  unit: string | null;
  approved: boolean;
  onChange: (next: {
    basis: ProductPriceBasisSuggestion | null;
    amount: number | null;
    unit: string | null;
  }) => void;
  onToggle: () => void;
}) {
  const afterLabel = formatPriceBasis(basis, amount, unit);
  const changed = (beforeLabel ?? null) !== (afterLabel ?? null);
  const wrapStyle = changed ? editSelectChangedStyle : editSelectStyle;
  const showDetails = basis === "weight" || basis === "unit";
  return (
    <div style={unitDiffStyle}>
      <div style={unitLineStyle}>
        <span style={beforeStyle}>{beforeLabel || "-"}</span>
        <span aria-hidden="true">→</span>
        <div style={inlineEditGroupStyle}>
          <select
            value={basis ?? ""}
            onChange={(event) => {
              const nextBasis =
                (event.target.value as ProductPriceBasisSuggestion | "") || null;
              onChange({
                basis: nextBasis,
                amount: nextBasis ? amount : null,
                unit: nextBasis ? unit : null,
              });
            }}
            style={wrapStyle}
            aria-label="Suggested price basis"
          >
            {PRICE_BASIS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {showDetails ? (
            <>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={amount == null ? "" : amount}
                placeholder="1"
                onChange={(event) =>
                  onChange({
                    basis,
                    amount: parsePositiveNumber(event.target.value),
                    unit,
                  })
                }
                style={{ ...wrapStyle, width: 72 }}
                aria-label="Suggested price basis amount"
              />
              <select
                value={unit ?? ""}
                onChange={(event) =>
                  onChange({
                    basis,
                    amount,
                    unit: event.target.value || null,
                  })
                }
                style={wrapStyle}
                aria-label="Suggested price basis unit"
              >
                <option value="">-</option>
                {INGREDIENT_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        style={approved ? approveActiveStyle : approveButtonStyle}
        aria-pressed={approved}
        onClick={onToggle}
      >
        {approved ? "Approved" : "Approve field"}
      </button>
    </div>
  );
}

function Confidence({
  value,
  needsReview,
}: {
  value: number;
  needsReview: boolean;
}) {
  return (
    <span style={needsReview ? confidenceReviewStyle : confidenceStyle}>
      {Math.round(value * 100)}%
    </span>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={statStyle}>
      <span style={statValueStyle}>{value}</span>
      <span style={statLabelStyle}>{label}</span>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th style={thStyle}>{children}</th>;
}

function Td({ children }: { children: ReactNode }) {
  return <td style={tdStyle}>{children}</td>;
}

function toggleInventoryRow(
  setReview: Dispatch<SetStateAction<UnitCleanupReviewFile>>,
  id: number,
) {
  setReview((current) => ({
    ...current,
    inventoryRecommendations: current.inventoryRecommendations.map((row) =>
      row.inventoryItemId === id
        ? {
            ...row,
            approved: !row.approved,
            approveStockUnit: false,
            approveRecipeUnit: false,
          }
        : row,
    ),
  }));
}

function toggleInventoryField(
  setReview: Dispatch<SetStateAction<UnitCleanupReviewFile>>,
  id: number,
  field: "stock" | "recipe",
) {
  setReview((current) => ({
    ...current,
    inventoryRecommendations: current.inventoryRecommendations.map((row) => {
      if (row.inventoryItemId !== id) return row;
      if (field === "stock") {
        return {
          ...row,
          approved: false,
          approveStockUnit: !row.approveStockUnit,
        };
      }
      return {
        ...row,
        approved: false,
        approveRecipeUnit: !row.approveRecipeUnit,
      };
    }),
  }));
}

function toggleProductRow(
  setReview: Dispatch<SetStateAction<UnitCleanupReviewFile>>,
  id: number,
) {
  setReview((current) => ({
    ...current,
    productRecommendations: current.productRecommendations.map((row) =>
      row.productId === id
        ? {
            ...row,
            approved: !row.approved,
            approveUnitSize: false,
            approvePriceBasis: false,
          }
        : row,
    ),
  }));
}

function toggleProductField(
  setReview: Dispatch<SetStateAction<UnitCleanupReviewFile>>,
  id: number,
  field: "unitSize" | "priceBasis",
) {
  setReview((current) => ({
    ...current,
    productRecommendations: current.productRecommendations.map((row) => {
      if (row.productId !== id) return row;
      if (field === "unitSize") {
        return {
          ...row,
          approved: false,
          approveUnitSize: !row.approveUnitSize,
        };
      }
      return {
        ...row,
        approved: false,
        approvePriceBasis: !row.approvePriceBasis,
      };
    }),
  }));
}

function editInventoryUnit(
  setReview: Dispatch<SetStateAction<UnitCleanupReviewFile>>,
  id: number,
  field: "stock" | "recipe",
  nextUnit: string,
) {
  setReview((current) => ({
    ...current,
    inventoryRecommendations: current.inventoryRecommendations.map((row) => {
      if (row.inventoryItemId !== id) return row;
      if (field === "stock") {
        return { ...row, suggestedStockUnit: nextUnit };
      }
      return { ...row, suggestedRecipeUnit: nextUnit };
    }),
  }));
}

function editProductUnitSize(
  setReview: Dispatch<SetStateAction<UnitCleanupReviewFile>>,
  id: number,
  next: { amount: number | null; unit: string | null },
) {
  setReview((current) => ({
    ...current,
    productRecommendations: current.productRecommendations.map((row) =>
      row.productId === id
        ? {
            ...row,
            suggestedUnitSizeAmount: next.amount,
            suggestedUnitSizeUnit: next.unit,
          }
        : row,
    ),
  }));
}

function editProductPriceBasis(
  setReview: Dispatch<SetStateAction<UnitCleanupReviewFile>>,
  id: number,
  next: {
    basis: ProductPriceBasisSuggestion | null;
    amount: number | null;
    unit: string | null;
  },
) {
  setReview((current) => ({
    ...current,
    productRecommendations: current.productRecommendations.map((row) =>
      row.productId === id
        ? {
            ...row,
            suggestedPriceBasis: next.basis,
            suggestedPriceBasisAmount: next.amount,
            suggestedPriceBasisUnit: next.unit,
          }
        : row,
    ),
  }));
}

function parsePositiveNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function includeInventoryRow(
  row: InventoryReviewItem,
  filters: {
    query: string;
    reviewOnly: boolean;
    changesOnly: boolean;
    approvedOnly: boolean;
  },
): boolean {
  if (filters.reviewOnly && !row.needsReview) return false;
  if (filters.changesOnly && !inventoryChanged(row)) return false;
  if (
    filters.approvedOnly &&
    !isInventoryStockUnitApproved(row) &&
    !isInventoryRecipeUnitApproved(row)
  ) {
    return false;
  }
  return matchesQuery(
    filters.query,
    row.ingredientName,
    row.currentStockUnit,
    row.currentRecipeUnit,
    row.suggestedStockUnit,
    row.suggestedRecipeUnit,
    row.reason,
  );
}

function includeProductRow(
  row: ProductReviewItem,
  filters: {
    query: string;
    reviewOnly: boolean;
    changesOnly: boolean;
    approvedOnly: boolean;
  },
): boolean {
  if (filters.reviewOnly && !row.needsReview) return false;
  if (filters.changesOnly && !productChanged(row)) return false;
  if (
    filters.approvedOnly &&
    !isProductUnitSizeApproved(row) &&
    !isProductPriceBasisApproved(row)
  ) {
    return false;
  }
  return matchesQuery(
    filters.query,
    row.ingredientName,
    row.productName,
    row.brand,
    row.currentUnitSizeUnit,
    row.suggestedUnitSizeUnit,
    row.currentPriceBasis,
    row.suggestedPriceBasis,
    row.reason,
  );
}

function matchesQuery(query: string, ...parts: Array<string | null>): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return parts.some((part) => part?.toLowerCase().includes(q));
}

function inventoryChanged(row: InventoryReviewItem): boolean {
  return (
    row.currentStockUnit !== row.suggestedStockUnit ||
    row.currentRecipeUnit !== row.suggestedRecipeUnit
  );
}

function productChanged(row: ProductReviewItem): boolean {
  return (
    row.currentUnitSizeAmount !== row.suggestedUnitSizeAmount ||
    row.currentUnitSizeUnit !== row.suggestedUnitSizeUnit ||
    row.currentPriceBasis !== row.suggestedPriceBasis ||
    row.currentPriceBasisAmount !== row.suggestedPriceBasisAmount ||
    row.currentPriceBasisUnit !== row.suggestedPriceBasisUnit
  );
}

function buildSummary(review: UnitCleanupReviewFile) {
  const inventoryApproved = review.inventoryRecommendations.reduce(
    (count, row) =>
      count +
      (isInventoryStockUnitApproved(row) ? 1 : 0) +
      (isInventoryRecipeUnitApproved(row) ? 1 : 0),
    0,
  );
  const productApproved = review.productRecommendations.reduce(
    (count, row) =>
      count +
      (isProductUnitSizeApproved(row) ? 1 : 0) +
      (isProductPriceBasisApproved(row) ? 1 : 0),
    0,
  );
  const needsReview =
    review.inventoryRecommendations.filter((row) => row.needsReview).length +
    review.productRecommendations.filter((row) => row.needsReview).length;
  return {
    approvedFields: inventoryApproved + productApproved,
    needsReview,
  };
}

function formatAmountUnit(amount: number | null, unit: string | null): string | null {
  if (amount == null && unit == null) return null;
  if (amount == null) return unit;
  return unit ? `${amount} ${unit}` : String(amount);
}

function formatPriceBasis(
  basis: string | null,
  amount: number | null,
  unit: string | null,
): string | null {
  if (!basis) return null;
  if (basis === "package") return "package";
  return [basis, formatAmountUnit(amount, unit)].filter(Boolean).join(" ");
}

const shellStyle = {
  display: "grid",
  gap: "var(--space-16)",
} satisfies CSSProperties;

const toolbarStyle = {
  display: "grid",
  gap: "var(--space-12)",
  position: "sticky",
  top: "calc(var(--topbar-sticky-offset) + var(--space-8))",
  zIndex: 10,
  background: "var(--paper)",
  border: "1px solid var(--hair)",
  padding: "var(--space-12)",
} satisfies CSSProperties;

const statsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "var(--space-8)",
} satisfies CSSProperties;

const statStyle = {
  display: "grid",
  gap: "var(--space-2)",
  background: "var(--fog)",
  padding: "var(--space-8)",
  border: "1px solid var(--hair)",
} satisfies CSSProperties;

const statValueStyle = {
  fontSize: 22,
  fontWeight: 700,
  lineHeight: 1,
} satisfies CSSProperties;

const statLabelStyle = {
  fontSize: 11,
  color: "var(--ink-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
} satisfies CSSProperties;

const controlsStyle = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "var(--space-8)",
} satisfies CSSProperties;

const tabListStyle = {
  display: "flex",
  border: "1px solid var(--hair)",
} satisfies CSSProperties;

const tabButtonStyle = {
  height: "var(--control-height)",
  border: 0,
  borderRight: "1px solid var(--hair)",
  background: "var(--paper)",
  color: "var(--ink)",
  padding: "0 var(--space-12)",
  cursor: "pointer",
} satisfies CSSProperties;

const tabActiveStyle = {
  ...tabButtonStyle,
  background: "var(--ink)",
  color: "var(--paper)",
} satisfies CSSProperties;

const searchStyle = {
  flex: "1 1 360px",
  height: "var(--control-height)",
  border: "1px solid var(--control-border-rest)",
  background: "var(--paper)",
  color: "var(--ink)",
  padding: "0 var(--space-12)",
} satisfies CSSProperties;

const toggleStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--space-6)",
  color: "var(--ink-soft)",
  fontSize: 13,
} satisfies CSSProperties;

const actionBarStyle = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "end",
  gap: "var(--space-8)",
} satisfies CSSProperties;

const visibleStyle = {
  marginRight: "auto",
  color: "var(--ink-muted)",
  fontSize: 12,
} satisfies CSSProperties;

const statusStyle = {
  margin: 0,
  color: "var(--ink-soft)",
  fontSize: 12,
} satisfies CSSProperties;

const tableWrapStyle = {
  overflow: "auto",
  border: "1px solid var(--hair)",
  maxHeight: "calc(100vh - 320px)",
} satisfies CSSProperties;

const tableStyle = {
  width: "100%",
  minWidth: 1120,
  borderCollapse: "collapse",
  fontSize: 13,
} satisfies CSSProperties;

const thStyle = {
  position: "sticky",
  top: 0,
  zIndex: 2,
  textAlign: "left",
  background: "var(--mist)",
  borderBottom: "1px solid var(--hair)",
  padding: "var(--space-8)",
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--ink-muted)",
} satisfies CSSProperties;

const tdStyle = {
  verticalAlign: "top",
  padding: "var(--space-8)",
  borderBottom: "1px solid var(--hair)",
} satisfies CSSProperties;

function rowStyle(needsReview: boolean): CSSProperties {
  return {
    background: needsReview
      ? "color-mix(in srgb, #facc15 12%, var(--paper))"
      : "var(--paper)",
  };
}

const mutedStyle = {
  color: "var(--ink-muted)",
  fontSize: 12,
  marginTop: "var(--space-2)",
} satisfies CSSProperties;

const unitDiffStyle = {
  display: "grid",
  gap: "var(--space-6)",
} satisfies CSSProperties;

const unitLineStyle = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-6)",
  whiteSpace: "nowrap",
} satisfies CSSProperties;

const beforeStyle = {
  color: "var(--ink-muted)",
} satisfies CSSProperties;

const editSelectStyle = {
  height: 28,
  border: "1px solid var(--control-border-rest)",
  background: "var(--paper)",
  color: "var(--ink)",
  padding: "0 var(--space-6)",
  fontSize: 13,
} satisfies CSSProperties;

const editSelectChangedStyle = {
  ...editSelectStyle,
  background: "color-mix(in srgb, #fde047 55%, var(--paper))",
  fontWeight: 600,
} satisfies CSSProperties;

const inlineEditGroupStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--space-4)",
} satisfies CSSProperties;

const approveButtonStyle = {
  border: "1px solid var(--hair)",
  background: "var(--paper)",
  color: "var(--ink)",
  padding: "var(--space-4) var(--space-8)",
  fontSize: 12,
  cursor: "pointer",
} satisfies CSSProperties;

const approveActiveStyle = {
  ...approveButtonStyle,
  borderColor: "var(--ink)",
  background: "var(--ink)",
  color: "var(--paper)",
} satisfies CSSProperties;

const confidenceStyle = {
  display: "inline-block",
  minWidth: 42,
  fontVariantNumeric: "tabular-nums",
  color: "var(--ink-soft)",
} satisfies CSSProperties;

const confidenceReviewStyle = {
  ...confidenceStyle,
  color: "#9a3412",
  fontWeight: 700,
} satisfies CSSProperties;

const reasonStyle = {
  display: "inline-block",
  maxWidth: 420,
  color: "var(--ink-soft)",
} satisfies CSSProperties;
