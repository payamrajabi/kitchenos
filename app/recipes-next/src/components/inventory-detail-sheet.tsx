"use client";

import { useEffect, useMemo, useRef, useState, useTransition, useCallback } from "react";
import type { IngredientRow, InventoryItemRow, IngredientNutrientRow, IngredientPortionRow } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { nutritionPer100gForDisplay } from "@/lib/inventory-nutrition-display";
import { NUTRITION_SOURCE_LLM_ESTIMATE } from "@/lib/nutrition/types";
import { autofillIngredientNutritionAction } from "@/app/actions/ingredient-nutrition";
import {
  updateInventoryQuantityFieldAction,
  updateInventoryStockUnitAction,
  updateInventoryStorageLocationAction,
  updateIngredientNameAction,
  updateRecipeUnitAction,
} from "@/app/actions/inventory";
import { normalizeInventoryId } from "@/lib/inventory-display";
import {
  canonicalIngredientUnit,
  defaultRecipeUnitForStockUnit,
  INGREDIENT_UNIT_VALUES,
  RECIPE_UNITS,
} from "@/lib/unit-mapping";
import { STOCK_UNIT_OPTIONS, STOCK_UNIT_VALUES } from "@/lib/stock-units";
import { SearchableSelect, type SelectOption } from "@/components/searchable-select";
import { IngredientDeleteButton } from "@/components/ingredient-delete-button";
import { ArrowsClockwise, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const STORAGE_LOCATION_OPTIONS: SelectOption[] = [
  { value: "Fridge", label: "Fridge" },
  { value: "Freezer", label: "Freezer" },
  { value: "Shallow Pantry", label: "Shallow Pantry" },
  { value: "Deep Pantry", label: "Deep Pantry" },
];

function fmt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return String(Math.round(v * 10) / 10);
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="detail-sheet-row">
      <dt className="detail-sheet-label">{label}</dt>
      <dd className="detail-sheet-value">{value ?? "—"}</dd>
    </div>
  );
}

function EditableRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="detail-sheet-row">
      <dt className="detail-sheet-label">{label}</dt>
      <dd className="detail-sheet-value detail-sheet-value--editable">{children}</dd>
    </div>
  );
}

function EditableQty({
  ingredientId,
  inventoryId,
  field,
  initialValue,
  ariaLabel,
  suffix,
  minBound,
  maxBound,
}: {
  ingredientId: number;
  inventoryId: number | "";
  field: "quantity" | "min_quantity" | "max_quantity";
  initialValue: number | null;
  ariaLabel: string;
  suffix?: string | null;
  minBound?: number | null;
  maxBound?: number | null;
}) {
  const resolvedInventoryId = useMemo(
    () => normalizeInventoryId(inventoryId),
    [inventoryId],
  );
  const toText = (n: number | null) =>
    n === null || n === undefined || Number.isNaN(Number(n))
      ? ""
      : String(Math.trunc(Number(n)));
  const [text, setText] = useState(() => toText(initialValue));
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resync local input buffer when the server-derived initialValue changes (e.g. router refresh or switching ingredient)
    setText(toText(initialValue));
  }, [initialValue]);

  const persist = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      const parsed = trimmed === "" ? 0 : Math.trunc(Number(trimmed));
      if (!Number.isFinite(parsed) || parsed < 0) {
        setText(toText(initialValue));
        return;
      }
      if (field === "min_quantity" && maxBound != null && parsed > maxBound) {
        toast.error("Minimum cannot be greater than maximum.");
        setText(toText(initialValue));
        return;
      }
      if (field === "max_quantity" && minBound != null && parsed < minBound) {
        toast.error("Maximum cannot be less than minimum.");
        setText(toText(initialValue));
        return;
      }
      const prev = initialValue == null ? null : Math.trunc(Number(initialValue));
      if (prev !== null && parsed === prev) return;
      startTransition(async () => {
        const r = await updateInventoryQuantityFieldAction(
          ingredientId,
          resolvedInventoryId,
          field,
          parsed,
        );
        if (!r.ok) {
          toast.error(r.error);
          setText(toText(initialValue));
        }
      });
    },
    [ingredientId, resolvedInventoryId, field, initialValue, minBound, maxBound],
  );

  return (
    <span className="detail-sheet-editable-number">
      <input
        type="text"
        inputMode="numeric"
        className="detail-sheet-input"
        value={text}
        aria-label={ariaLabel}
        disabled={isPending}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => persist(text)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setText(toText(initialValue));
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {suffix ? <span className="detail-sheet-input-suffix">{suffix}</span> : null}
    </span>
  );
}

function EditableStockUnit({
  ingredientId,
  inventoryId,
  value,
}: {
  ingredientId: number;
  inventoryId: number | "";
  value: string;
}) {
  const resolvedInventoryId = normalizeInventoryId(inventoryId);
  const [isPending, startTransition] = useTransition();
  const normalized = canonicalIngredientUnit(value);
  const options: SelectOption[] = useMemo(() => {
    const v = normalized.trim();
    if (v && !STOCK_UNIT_VALUES.has(v)) {
      return [{ value: v, label: v }, ...STOCK_UNIT_OPTIONS];
    }
    return STOCK_UNIT_OPTIONS;
  }, [normalized]);
  return (
    <SearchableSelect
      className="detail-sheet-select"
      options={options}
      value={normalized}
      onChange={(next) => {
        startTransition(async () => {
          const r = await updateInventoryStockUnitAction(
            ingredientId,
            resolvedInventoryId,
            next,
          );
          if (!r.ok) toast.error(r.error);
        });
      }}
      disabled={isPending}
      aria-label="Stock unit"
      bareInline
      placeholder="—"
    />
  );
}

function EditableRecipeUnit({
  ingredientId,
  inventoryId,
  stockUnit,
  savedRecipeUnit,
}: {
  ingredientId: number;
  inventoryId: number | "";
  stockUnit: string;
  savedRecipeUnit: string;
}) {
  const resolvedInventoryId = normalizeInventoryId(inventoryId);
  const [isPending, startTransition] = useTransition();
  const effective = useMemo(() => {
    const savedNorm = canonicalIngredientUnit(savedRecipeUnit);
    if (savedNorm) return savedNorm;
    return defaultRecipeUnitForStockUnit(stockUnit);
  }, [savedRecipeUnit, stockUnit]);
  const options: SelectOption[] = useMemo(() => {
    const v = effective.trim();
    const base = RECIPE_UNITS.map((u) => ({ value: u, label: u }));
    if (v && !INGREDIENT_UNIT_VALUES.has(v)) {
      return [{ value: v, label: v }, ...base];
    }
    return base;
  }, [effective]);
  return (
    <SearchableSelect
      className="detail-sheet-select"
      options={options}
      value={effective}
      onChange={(next) => {
        startTransition(async () => {
          const r = await updateRecipeUnitAction(
            next,
            resolvedInventoryId,
            ingredientId,
          );
          if (!r.ok) toast.error(r.error);
        });
      }}
      disabled={isPending}
      aria-label="Recipe unit"
      bareInline
      placeholder="—"
    />
  );
}

function EditableStorageLocation({
  ingredientId,
  inventoryId,
  value,
}: {
  ingredientId: number;
  inventoryId: number | "";
  value: string;
}) {
  const resolvedInventoryId = normalizeInventoryId(inventoryId);
  const [isPending, startTransition] = useTransition();
  return (
    <SearchableSelect
      className="detail-sheet-select"
      options={STORAGE_LOCATION_OPTIONS}
      value={value || ""}
      onChange={(next) => {
        startTransition(async () => {
          const r = await updateInventoryStorageLocationAction(
            ingredientId,
            resolvedInventoryId,
            next,
          );
          if (!r.ok) toast.error(r.error);
        });
      }}
      disabled={isPending}
      aria-label="Storage location"
      bareInline
      placeholder="—"
    />
  );
}

function EditableTitle({
  ingredientId,
  name,
}: {
  ingredientId: number;
  name: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  // Mirror the server-truth `name` prop into the local draft when we're
  // not actively editing. Legitimate prop-to-state sync, so the
  // set-state-in-effect rule is suppressed here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!isEditing) setDraft(name);
  }, [name, isEditing]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const commit = useCallback(
    (raw: string) => {
      const next = raw.trim();
      if (!next) {
        setDraft(name);
        setIsEditing(false);
        return;
      }
      if (next === name) {
        setIsEditing(false);
        return;
      }
      startTransition(async () => {
        const r = await updateIngredientNameAction(ingredientId, next);
        if (!r.ok) {
          toast.error(r.error);
          setDraft(name);
        } else {
          router.refresh();
        }
        setIsEditing(false);
      });
    },
    [ingredientId, name, router],
  );

  if (!isEditing) {
    return (
      <h2
        className="detail-sheet-title detail-sheet-title--editable"
        onDoubleClick={() => setIsEditing(true)}
        title="Double-click to rename"
      >
        {name}
      </h2>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      className="detail-sheet-title-input"
      value={draft}
      aria-label="Ingredient name"
      disabled={isPending}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setDraft(name);
          setIsEditing(false);
        }
      }}
    />
  );
}

function NutrientGrid({ nutrients }: { nutrients: IngredientNutrientRow[] }) {
  if (!nutrients.length) {
    return <p className="detail-sheet-empty">No micronutrient data available.</p>;
  }
  return (
    <div className="detail-sheet-nutrient-grid">
      {nutrients.map((n) => (
        <div key={n.nutrient_id} className="detail-sheet-nutrient-item">
          <span className="detail-sheet-nutrient-name">{n.nutrient_name}</span>
          <span className="detail-sheet-nutrient-value">
            {fmt(n.value)} {n.unit}
          </span>
        </div>
      ))}
    </div>
  );
}

function PortionList({ portions }: { portions: IngredientPortionRow[] }) {
  if (!portions.length) {
    return <p className="detail-sheet-empty">No portion data available.</p>;
  }
  return (
    <ul className="detail-sheet-portions">
      {portions.map((p) => (
        <li key={p.id} className="detail-sheet-portion-item">
          {p.description} = <strong>{fmt(p.gram_weight)}g</strong>
          {p.source ? (
            <span className="detail-sheet-portion-source"> ({p.source})</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function InventoryDetailSheet({
  ingredient,
  inventoryItem,
  onClose,
}: {
  ingredient: IngredientRow;
  inventoryItem: InventoryItemRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [nutrients, setNutrients] = useState<IngredientNutrientRow[]>([]);
  const [portions, setPortions] = useState<IngredientPortionRow[]>([]);
  const [isCalcPending, startCalcTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const [nutRes, portRes] = await Promise.all([
        supabase
          .from("ingredient_nutrients")
          .select("*")
          .eq("ingredient_id", ingredient.id)
          .order("nutrient_name"),
        supabase
          .from("ingredient_portions")
          .select("*")
          .eq("ingredient_id", ingredient.id)
          .order("is_default", { ascending: false }),
      ]);
      if (cancelled) return;
      setNutrients((nutRes.data ?? []) as IngredientNutrientRow[]);
      setPortions((portRes.data ?? []) as IngredientPortionRow[]);
    }
    load();
    return () => { cancelled = true; };
  }, [ingredient.id]);

  const onCalculate = useCallback(() => {
    startCalcTransition(async () => {
      try {
        const r = await autofillIngredientNutritionAction(ingredient.id, {
          force: true,
        });
        if (!r.ok) {
          toast.error("Nutrition lookup failed", { description: r.error });
        } else if ("result" in r && r.result?.status === "no_match") {
          toast.error("No nutrition data found", {
            description: r.result.notes?.trim() || "No match from reference databases.",
          });
        }
      } catch {
        toast.error("Nutrition lookup failed");
      }
      router.refresh();
    });
  }, [ingredient.id, router]);

  const n = nutritionPer100gForDisplay(ingredient);
  const isLlmEstimate = ingredient.nutrition_source_name === NUTRITION_SOURCE_LLM_ESTIMATE;

  const inventoryId = inventoryItem?.id ?? "";
  const unit = inventoryItem?.unit ?? "";
  const currentQty =
    inventoryItem?.quantity != null ? Number(inventoryItem.quantity) : null;
  const currentMin =
    inventoryItem?.min_quantity != null ? Number(inventoryItem.min_quantity) : null;
  const currentMax =
    inventoryItem?.max_quantity != null ? Number(inventoryItem.max_quantity) : null;

  return (
    <div className="detail-sheet-backdrop" onClick={onClose}>
      <aside
        className="detail-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Details for ${ingredient.name}`}
      >
        <header className="detail-sheet-header">
          <EditableTitle ingredientId={ingredient.id} name={ingredient.name} />
          <button
            type="button"
            className="detail-sheet-close"
            onClick={onClose}
            aria-label="Close detail sheet"
          >
            <X size={20} weight="bold" aria-hidden />
          </button>
        </header>

        <div className="detail-sheet-body">
          <section className="detail-sheet-section">
            <h3 className="detail-sheet-section-title">Inventory</h3>
            <dl className="detail-sheet-dl">
              <EditableRow label="Current Stock">
                <EditableQty
                  ingredientId={ingredient.id}
                  inventoryId={inventoryId}
                  field="quantity"
                  initialValue={currentQty}
                  ariaLabel="Current stock"
                  suffix={unit || null}
                />
              </EditableRow>
              <EditableRow label="Stock Unit">
                <EditableStockUnit
                  ingredientId={ingredient.id}
                  inventoryId={inventoryId}
                  value={unit}
                />
              </EditableRow>
              <EditableRow label="Min Quantity">
                <EditableQty
                  ingredientId={ingredient.id}
                  inventoryId={inventoryId}
                  field="min_quantity"
                  initialValue={currentMin}
                  ariaLabel="Minimum quantity"
                  maxBound={currentMax}
                />
              </EditableRow>
              <EditableRow label="Max Quantity">
                <EditableQty
                  ingredientId={ingredient.id}
                  inventoryId={inventoryId}
                  field="max_quantity"
                  initialValue={currentMax}
                  ariaLabel="Maximum quantity"
                  minBound={currentMin}
                />
              </EditableRow>
              <EditableRow label="Recipe Unit">
                <EditableRecipeUnit
                  ingredientId={ingredient.id}
                  inventoryId={inventoryId}
                  stockUnit={unit}
                  savedRecipeUnit={inventoryItem?.recipe_unit ?? ""}
                />
              </EditableRow>
              <EditableRow label="Storage Location">
                <EditableStorageLocation
                  ingredientId={ingredient.id}
                  inventoryId={inventoryId}
                  value={inventoryItem?.storage_location ?? ""}
                />
              </EditableRow>
            </dl>
          </section>

          <section className="detail-sheet-section">
            <h3 className="detail-sheet-section-title">Ingredient Details</h3>
            <dl className="detail-sheet-dl">
              <DetailRow label="Category" value={ingredient.grocery_category || ingredient.category || "—"} />
              <DetailRow label="Food Type" value={ingredient.food_type || "generic"} />
              <DetailRow label="Brand" value={ingredient.brand_or_manufacturer || "—"} />
              <DetailRow label="Barcode" value={ingredient.barcode || "—"} />
              {ingredient.notes ? <DetailRow label="Notes" value={ingredient.notes} /> : null}
            </dl>
          </section>

          <section className="detail-sheet-section">
            <div className="detail-sheet-section-header">
              <h3 className="detail-sheet-section-title">
                Macronutrients
                <span className="detail-sheet-per100g">per 100g</span>
              </h3>
              <button
                type="button"
                className="detail-sheet-calc-btn"
                onClick={onCalculate}
                disabled={isCalcPending}
                title={isLlmEstimate ? "Recalculate — tries USDA/CNF first" : "Fetch nutrition from reference data"}
              >
                <ArrowsClockwise
                  size={16}
                  weight="bold"
                  className={isCalcPending ? "inventory-icon-spin" : undefined}
                  aria-hidden
                />
                {isCalcPending ? "Calculating…" : "Recalculate"}
              </button>
            </div>
            <dl className="detail-sheet-dl detail-sheet-macros">
              <DetailRow label="Calories" value={fmt(n.kcal)} />
              <DetailRow label="Protein" value={n.proteinG != null ? `${fmt(n.proteinG)}g` : "—"} />
              <DetailRow label="Fat" value={n.fatG != null ? `${fmt(n.fatG)}g` : "—"} />
              <DetailRow label="Carbs" value={n.carbsG != null ? `${fmt(n.carbsG)}g` : "—"} />
            </dl>
            {isLlmEstimate && (
              <p className="detail-sheet-estimate-badge">
                Approximate AI estimate — not from USDA or CNF
              </p>
            )}
            {ingredient.nutrition_source_name && (
              <p className="detail-sheet-source">
                Source: {ingredient.nutrition_source_name}
                {ingredient.nutrition_confidence != null && (
                  <> · Confidence: {Math.round(ingredient.nutrition_confidence * 100)}%</>
                )}
              </p>
            )}
            {ingredient.nutrition_notes && (
              <p className="detail-sheet-notes">{ingredient.nutrition_notes}</p>
            )}
          </section>

          <section className="detail-sheet-section">
            <h3 className="detail-sheet-section-title">
              Micronutrients
              <span className="detail-sheet-per100g">per 100g</span>
            </h3>
            <NutrientGrid nutrients={nutrients} />
          </section>

          <section className="detail-sheet-section">
            <h3 className="detail-sheet-section-title">Known Portions</h3>
            <PortionList portions={portions} />
          </section>

          <div className="detail-sheet-footer">
            <IngredientDeleteButton
              ingredientId={ingredient.id}
              ingredientName={ingredient.name}
              variant="sheet-footer"
              onDeleted={onClose}
            />
          </div>
        </div>
      </aside>
    </div>
  );
}
