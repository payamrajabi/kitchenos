"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  PencilSimple,
  Plus,
  Trash,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import type { IngredientProductRow } from "@/types/database";
import {
  addIngredientProductAction,
  deleteIngredientProductAction,
  reorderIngredientProductsAction,
  updateIngredientProductAction,
  type IngredientProductInput,
} from "@/app/actions/ingredient-products";
import { INGREDIENT_UNITS } from "@/lib/unit-mapping";
import type { ProductPriceBasis } from "@/types/database";

type FormState = {
  name: string;
  brand: string;
  notes: string;
  price: string;
  priceBasis: ProductPriceBasis | "";
  priceBasisAmount: string;
  priceBasisUnit: string;
  unitSizeAmount: string;
  unitSizeUnit: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  brand: "",
  notes: "",
  price: "",
  priceBasis: "",
  priceBasisAmount: "",
  priceBasisUnit: "",
  unitSizeAmount: "",
  unitSizeUnit: "",
};

const DEFAULT_UNIT_SIZE_UNIT = "g";

/** Format a unit-size pair as a compact display string (e.g. "500 g"). */
export function formatUnitSize(
  amount: number | null | undefined,
  unit: string | null | undefined,
): string {
  if (amount == null || !Number.isFinite(Number(amount))) return "";
  if (!unit) return "";
  // Trim trailing zeros so "1.000" becomes "1".
  const n = Number(amount);
  const str = Number.isInteger(n) ? String(n) : String(n);
  // Weight/volume abbreviations look best without a space ("500g"); "count"
  // and word-length units read better with a space ("12 count", "2 pkg").
  const tight = new Set([
    "g",
    "kg",
    "mg",
    "oz",
    "lb",
    "ml",
    "l",
  ]);
  return tight.has(unit) ? `${str}${unit}` : `${str} ${unit}`;
}

function priceToString(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(Number(p))) return "";
  return String(p);
}

export function formatPrice(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(Number(p))) return "—";
  return Number(p).toFixed(2);
}

function formatProductPrice(p: IngredientProductRow): string {
  const price = formatPrice(p.price);
  if (price === "—") return price;
  if (p.price_basis === "weight" && p.price_basis_unit) {
    const amount = Number(p.price_basis_amount ?? 1);
    return !Number.isFinite(amount) || amount === 1
      ? `${price}/${p.price_basis_unit}`
      : `${price} per ${amount}${p.price_basis_unit}`;
  }
  if (p.price_basis === "unit") {
    return p.price_basis_unit && p.price_basis_unit !== "ea"
      ? `${price}/${p.price_basis_unit}`
      : `${price} each`;
  }
  return price;
}

function toFormState(p: IngredientProductRow): FormState {
  return {
    name: p.name ?? "",
    brand: p.brand ?? "",
    notes: p.notes ?? "",
    price: priceToString(p.price),
    priceBasis: p.price_basis ?? (p.price != null ? "package" : ""),
    priceBasisAmount:
      p.price_basis_amount != null && Number.isFinite(Number(p.price_basis_amount))
        ? String(p.price_basis_amount)
        : "",
    priceBasisUnit: p.price_basis_unit ?? "",
    unitSizeAmount:
      p.unit_size_amount != null && Number.isFinite(Number(p.unit_size_amount))
        ? String(p.unit_size_amount)
        : "",
    unitSizeUnit: p.unit_size_unit ?? "",
  };
}

function toInput(f: FormState): IngredientProductInput {
  // When the price basis is "Each/unit", the basis amount + unit already
  // describe the package size (e.g. "$3.19 per 1 bunch" → 1 bunch). We mirror
  // those values into unit size so downstream consumers (inventory display,
  // unit-cost math) don't need to know about this UI collapse.
  const mirrorFromBasis =
    f.priceBasis === "unit" && f.priceBasisAmount.trim() !== "";
  const unitSizeAmount = mirrorFromBasis
    ? f.priceBasisAmount
    : f.unitSizeAmount;
  const unitSizeUnit = mirrorFromBasis
    ? f.priceBasisUnit
    : f.unitSizeAmount.trim() && !f.unitSizeUnit
      ? DEFAULT_UNIT_SIZE_UNIT
      : f.unitSizeUnit;

  return {
    name: f.name,
    brand: f.brand,
    notes: f.notes,
    price: f.price,
    priceBasis: f.price ? f.priceBasis || "package" : null,
    priceBasisAmount: f.priceBasisAmount,
    priceBasisUnit: f.priceBasisUnit,
    unitSizeAmount,
    unitSizeUnit,
  };
}

export function IngredientProductsEditor({
  ingredientId,
  ingredientName,
  products,
  onProductsChange,
}: {
  ingredientId: number;
  ingredientName: string;
  products: IngredientProductRow[];
  /** Called after any server mutation. Parent should refetch the list. */
  onProductsChange: () => Promise<void> | void;
}) {
  const [isPending, startTransition] = useTransition();

  const [isAdding, setIsAdding] = useState(false);
  const [addForm, setAddForm] = useState<FormState>(EMPTY_FORM);
  const addNameRef = useRef<HTMLInputElement | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    if (isAdding && addNameRef.current) {
      addNameRef.current.focus();
    }
  }, [isAdding]);

  const startAdd = useCallback(() => {
    setEditingId(null);
    setAddForm(EMPTY_FORM);
    setIsAdding(true);
  }, []);

  const cancelAdd = useCallback(() => {
    setIsAdding(false);
    setAddForm(EMPTY_FORM);
  }, []);

  const submitAdd = useCallback(() => {
    const name = addForm.name.trim();
    if (!name) {
      toast.error("Product name is required.");
      return;
    }
    startTransition(async () => {
      const r = await addIngredientProductAction(ingredientId, toInput(addForm));
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setIsAdding(false);
      setAddForm(EMPTY_FORM);
      await onProductsChange();
    });
  }, [addForm, ingredientId, onProductsChange]);

  const startEdit = useCallback((p: IngredientProductRow) => {
    setIsAdding(false);
    setEditForm(toFormState(p));
    setEditingId(p.id);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditForm(EMPTY_FORM);
  }, []);

  const submitEdit = useCallback(() => {
    if (editingId == null) return;
    const name = editForm.name.trim();
    if (!name) {
      toast.error("Product name is required.");
      return;
    }
    const id = editingId;
    startTransition(async () => {
      const r = await updateIngredientProductAction(id, toInput(editForm));
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setEditingId(null);
      setEditForm(EMPTY_FORM);
      await onProductsChange();
    });
  }, [editForm, editingId, onProductsChange]);

  const handleDelete = useCallback(
    (p: IngredientProductRow) => {
      const ok = window.confirm(
        `Remove “${p.name}” from preferred products for ${ingredientName}?`,
      );
      if (!ok) return;
      startTransition(async () => {
        const r = await deleteIngredientProductAction(p.id);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        await onProductsChange();
      });
    },
    [ingredientName, onProductsChange],
  );

  const move = useCallback(
    (index: number, direction: -1 | 1) => {
      const next = index + direction;
      if (next < 0 || next >= products.length) return;
      const reordered = [...products];
      const [moved] = reordered.splice(index, 1);
      reordered.splice(next, 0, moved);
      const ids = reordered.map((p) => p.id);
      startTransition(async () => {
        const r = await reorderIngredientProductsAction(ingredientId, ids);
        if (!r.ok) {
          toast.error(r.error);
        }
        await onProductsChange();
      });
    },
    [ingredientId, products, onProductsChange],
  );

  const empty = products.length === 0 && !isAdding;

  return (
    <div className="ingredient-products">
      {empty ? (
        <p className="detail-sheet-empty">No preferred products yet.</p>
      ) : null}

      {products.length > 0 ? (
        <ol className="ingredient-products-list">
          {products.map((p, index) => {
            const isEditing = editingId === p.id;
            if (isEditing) {
              return (
                <li
                  key={p.id}
                  className="ingredient-products-item ingredient-products-item--editing"
                >
                  <ProductForm
                    form={editForm}
                    setForm={setEditForm}
                    onSubmit={submitEdit}
                    onCancel={cancelEdit}
                    submitLabel="Save"
                    disabled={isPending}
                  />
                </li>
              );
            }
            return (
              <li key={p.id} className="ingredient-products-item">
                <div className="ingredient-products-rank" aria-hidden>
                  {index + 1}.
                </div>
                <div className="ingredient-products-body">
                  <div className="ingredient-products-name-row">
                    <span className="ingredient-products-name">{p.name}</span>
                  </div>
                  {(() => {
                    const size = formatUnitSize(
                      p.unit_size_amount,
                      p.unit_size_unit,
                    );
                    const parts = [p.brand, size].filter(
                      (v): v is string => Boolean(v),
                    );
                    return parts.length > 0 ? (
                      <div className="ingredient-products-meta">
                        {parts.join(" · ")}
                      </div>
                    ) : null;
                  })()}
                  {p.notes ? (
                    <div className="ingredient-products-notes">{p.notes}</div>
                  ) : null}
                </div>
                <div className="ingredient-products-side">
                  {p.price != null ? (
                    <span
                      className="ingredient-products-price"
                      title="Product price"
                    >
                      {formatProductPrice(p)}
                    </span>
                  ) : null}
                  <div className="ingredient-products-actions">
                    <button
                      type="button"
                      className="ingredient-products-action"
                      aria-label="Move up"
                      title="Move up"
                      disabled={index === 0 || isPending}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp size={14} weight="bold" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="ingredient-products-action"
                      aria-label="Move down"
                      title="Move down"
                      disabled={index === products.length - 1 || isPending}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown size={14} weight="bold" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="ingredient-products-action"
                      aria-label={`Edit ${p.name}`}
                      title="Edit"
                      disabled={isPending}
                      onClick={() => startEdit(p)}
                    >
                      <PencilSimple size={14} weight="bold" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="ingredient-products-action ingredient-products-action--danger"
                      aria-label={`Remove ${p.name}`}
                      title="Remove"
                      disabled={isPending}
                      onClick={() => handleDelete(p)}
                    >
                      <Trash size={14} weight="bold" aria-hidden />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}

      {isAdding ? (
        <div className="ingredient-products-add">
          <ProductForm
            form={addForm}
            setForm={setAddForm}
            onSubmit={submitAdd}
            onCancel={cancelAdd}
            submitLabel="Add"
            disabled={isPending}
            nameRef={addNameRef}
          />
        </div>
      ) : (
        <button
          type="button"
          className="ingredient-products-add-btn"
          onClick={startAdd}
          disabled={isPending}
        >
          <Plus size={14} weight="bold" aria-hidden />
          Add product
        </button>
      )}
    </div>
  );
}

function ProductForm({
  form,
  setForm,
  onSubmit,
  onCancel,
  submitLabel,
  disabled,
  nameRef,
}: {
  form: FormState;
  setForm: (updater: (prev: FormState) => FormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  disabled?: boolean;
  nameRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <form
      className="ingredient-products-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label className="ingredient-products-field">
        <span className="ingredient-products-field-label">Brand</span>
        <input
          ref={nameRef}
          type="text"
          className="ingredient-products-input"
          value={form.brand}
          onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
          placeholder="e.g. Rumford"
          disabled={disabled}
        />
      </label>
      <label className="ingredient-products-field">
        <span className="ingredient-products-field-label">Product name</span>
        <input
          type="text"
          className="ingredient-products-input"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Rumford Baking Powder"
          disabled={disabled}
        />
      </label>
      <div className="ingredient-products-field-row">
        <label className="ingredient-products-field ingredient-products-field--price">
          <span className="ingredient-products-field-label">Price</span>
          <input
            type="text"
            inputMode="decimal"
            className="ingredient-products-input"
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            placeholder="12.99"
            disabled={disabled}
          />
        </label>
        <label className="ingredient-products-field ingredient-products-field--price">
          <span className="ingredient-products-field-label">Price basis</span>
          <select
            className="ingredient-products-input"
            value={form.priceBasis}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                priceBasis: e.target.value as ProductPriceBasis | "",
                priceBasisAmount:
                  e.target.value === "weight" || e.target.value === "unit"
                    ? f.priceBasisAmount || "1"
                    : "",
                priceBasisUnit:
                  e.target.value === "weight"
                    ? f.priceBasisUnit || "lb"
                    : e.target.value === "unit"
                      ? f.priceBasisUnit || "ea"
                      : "",
              }))
            }
            disabled={disabled}
          >
            <option value="">—</option>
            <option value="package">Package</option>
            <option value="weight">By weight</option>
            <option value="unit">Each/unit</option>
          </select>
        </label>
      </div>
      {form.priceBasis === "weight" || form.priceBasis === "unit" ? (
        <div className="ingredient-products-field">
          <span className="ingredient-products-field-label">
            {form.priceBasis === "unit" ? "Sold as" : "Basis amount"}
          </span>
          <div className="ingredient-products-unit-size">
            <input
              type="text"
              inputMode="decimal"
              className="ingredient-products-input ingredient-products-unit-size-amount"
              value={form.priceBasisAmount}
              onChange={(e) =>
                setForm((f) => ({ ...f, priceBasisAmount: e.target.value }))
              }
              placeholder="1"
              aria-label="Price basis amount"
              disabled={disabled}
            />
            <select
              className="ingredient-products-input ingredient-products-unit-size-unit"
              value={form.priceBasisUnit}
              onChange={(e) =>
                setForm((f) => ({ ...f, priceBasisUnit: e.target.value }))
              }
              aria-label="Price basis unit"
              disabled={disabled}
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
      ) : null}
      {form.priceBasis !== "unit" ? (
        <div className="ingredient-products-field">
          <span className="ingredient-products-field-label">Unit size</span>
          <div className="ingredient-products-unit-size">
            <input
              type="text"
              inputMode="decimal"
              className="ingredient-products-input ingredient-products-unit-size-amount"
              value={form.unitSizeAmount}
              onChange={(e) =>
                setForm((f) => ({ ...f, unitSizeAmount: e.target.value }))
              }
              placeholder="500"
              aria-label="Unit size amount"
              disabled={disabled}
            />
            <select
              className="ingredient-products-input ingredient-products-unit-size-unit"
              value={form.unitSizeUnit}
              onChange={(e) =>
                setForm((f) => ({ ...f, unitSizeUnit: e.target.value }))
              }
              aria-label="Unit size unit"
              disabled={disabled}
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
      ) : null}
      <label className="ingredient-products-field">
        <span className="ingredient-products-field-label">Notes</span>
        <textarea
          className="ingredient-products-input ingredient-products-textarea"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Why you prefer this, size, where to find it…"
          disabled={disabled}
          rows={2}
        />
      </label>
      <div className="ingredient-products-form-actions">
        <button
          type="button"
          className="ingredient-products-form-cancel"
          onClick={onCancel}
          disabled={disabled}
        >
          <X size={14} weight="bold" aria-hidden />
          Cancel
        </button>
        <button
          type="submit"
          className="ingredient-products-form-submit"
          disabled={disabled}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
