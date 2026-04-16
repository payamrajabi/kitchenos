"use client";

import { autofillIngredientNutritionAction } from "@/app/actions/ingredient-nutrition";
import { nutritionPer100gForDisplay } from "@/lib/inventory-nutrition-display";
import { NUTRITION_SOURCE_LLM_ESTIMATE } from "@/lib/nutrition/types";
import type { IngredientRow } from "@/types/database";
import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";
import { toast } from "sonner";
import { ArrowsClockwise } from "@phosphor-icons/react";

function fmt(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return String(v);
}

export function InventoryIngredientNutritionCells({
  ingredient,
  disabled = false,
}: {
  ingredient: IngredientRow;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const n = nutritionPer100gForDisplay(ingredient);

  const onCalculate = useCallback(() => {
    startTransition(async () => {
      try {
        const r = await autofillIngredientNutritionAction(ingredient.id, {
          force: true,
        });
        if (!r.ok) {
          toast.error("Nutrition lookup failed", {
            description: r.error,
            duration: 14_000,
            closeButton: true,
          });
        } else if ("skipped" in r && r.skipped) {
          toast.message("Nutrition skipped", {
            description: r.reason,
            duration: 8000,
            closeButton: true,
          });
        } else if (
          "result" in r &&
          r.result &&
          r.result.status === "no_match"
        ) {
          toast.error("No nutrition data found", {
            description:
              r.result.notes?.trim() ||
              "Nothing matched in USDA or Canadian reference data, and the AI estimate step did not return values. Check OPENAI_API_KEY, USDA_FDC_API_KEY, and your network.",
            duration: 16_000,
            closeButton: true,
          });
        }
      } catch {
        toast.error("Nutrition lookup failed", {
          description:
            "Something went wrong while calculating. Try again in a moment.",
          duration: 12_000,
          closeButton: true,
        });
      }
      router.refresh();
    });
  }, [ingredient.id, router]);

  const isLlmEstimate =
    ingredient.nutrition_source_name === NUTRITION_SOURCE_LLM_ESTIMATE;

  const nutritionHint =
    ingredient.nutrition_notes?.trim() ||
    (isLlmEstimate
      ? "Approximate AI estimate — not from USDA or CNF. Refresh to retry official sources."
      : ingredient.nutrition_needs_review
        ? "No confident match yet — try the refresh, or rename the ingredient to a simpler name (e.g. “salmon, raw”)."
        : null);

  return (
    <>
      <td
        className="inventory-nutrition-cell inventory-nutrition-num"
        title={
          isLlmEstimate
            ? "Approximate AI estimate — verify against a label when possible"
            : undefined
        }
      >
        {isLlmEstimate ? (
          <>
            <abbr
              className="inventory-nutrition-est-badge"
              title="Approximate — not from USDA or Canadian nutrient file"
            >
              Est.
            </abbr>{" "}
          </>
        ) : null}
        {fmt(n.kcal)}
      </td>
      <td className="inventory-nutrition-cell inventory-nutrition-num">
        {fmt(n.proteinG)}
      </td>
      <td className="inventory-nutrition-cell inventory-nutrition-num">
        {fmt(n.fatG)}
      </td>
      <td className="inventory-nutrition-cell inventory-nutrition-num">
        {fmt(n.carbsG)}
      </td>
      <td className="inventory-nutrition-cell inventory-nutrition-calc">
        <button
          type="button"
          className="inventory-nutrition-calc-btn"
          onClick={onCalculate}
          disabled={disabled || isPending}
          aria-label="Calculate nutrition"
          title={
            nutritionHint ??
            (isLlmEstimate
              ? "Recalculate — tries USDA/CNF first, then AI estimate if needed"
              : "Fetch nutrition from reference data (needs a USDA API key in production for best results)")
          }
        >
          <ArrowsClockwise
            size={16}
            weight="bold"
            className={isPending ? "inventory-icon-spin" : undefined}
            aria-hidden
          />
        </button>
      </td>
    </>
  );
}
