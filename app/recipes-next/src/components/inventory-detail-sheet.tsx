"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
import type { IngredientRow, InventoryItemRow, IngredientNutrientRow, IngredientPortionRow } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { nutritionPer100gForDisplay } from "@/lib/inventory-nutrition-display";
import { NUTRITION_SOURCE_LLM_ESTIMATE } from "@/lib/nutrition/types";
import { autofillIngredientNutritionAction } from "@/app/actions/ingredient-nutrition";
import { ArrowsClockwise, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

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

  const qty = inventoryItem?.quantity;
  const unit = inventoryItem?.unit;
  const stockDisplay =
    qty != null
      ? `${Number.isInteger(qty) ? qty : Math.round(Number(qty) * 100) / 100}${unit ? ` ${unit}` : ""}`
      : "—";

  return (
    <div className="detail-sheet-backdrop" onClick={onClose}>
      <aside
        className="detail-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Details for ${ingredient.name}`}
      >
        <header className="detail-sheet-header">
          <h2 className="detail-sheet-title">{ingredient.name}</h2>
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
              <DetailRow label="Current Stock" value={stockDisplay} />
              <DetailRow label="Stock Unit" value={inventoryItem?.unit || "—"} />
              <DetailRow label="Min Quantity" value={fmt(inventoryItem?.min_quantity)} />
              <DetailRow label="Max Quantity" value={fmt(inventoryItem?.max_quantity)} />
              <DetailRow label="Recipe Unit" value={inventoryItem?.recipe_unit || "—"} />
              <DetailRow label="Storage Location" value={inventoryItem?.storage_location || "—"} />
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
        </div>
      </aside>
    </div>
  );
}
