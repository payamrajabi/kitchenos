"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import type { IngredientRow, InventoryItemRow } from "@/types/database";
import {
  getInventoryRowForIngredient,
  getInventoryStockValuesUnified,
  type UnifiedInventoryStock,
} from "@/lib/inventory-display";
import { IngredientDeleteButton } from "@/components/ingredient-delete-button";
import { RecipeUnitSelect } from "@/components/recipe-unit-select";
import { EditableIngredientName } from "@/components/editable-ingredient-name";
import { InventoryQtyField } from "@/components/inventory-qty-field";
import { InventoryStockUnitSelect } from "@/components/inventory-stock-unit-select";
import { addIngredientVariantAction, reorderVariantsAction } from "@/app/actions/inventory";

type IngredientWithVariants = IngredientRow & {
  variants: IngredientRow[];
};

function groupIngredients(
  ingredients: IngredientRow[],
): IngredientWithVariants[] {
  const parentMap = new Map<number, IngredientWithVariants>();
  const childIds = new Set<number>();

  for (const ing of ingredients) {
    if (ing.parent_ingredient_id) {
      childIds.add(ing.id);
    }
  }

  for (const ing of ingredients) {
    if (!ing.parent_ingredient_id) {
      parentMap.set(ing.id, { ...ing, variants: [] });
    }
  }

  for (const ing of ingredients) {
    if (ing.parent_ingredient_id) {
      const parent = parentMap.get(ing.parent_ingredient_id);
      if (parent) {
        parent.variants.push(ing);
      }
    }
  }

  for (const parent of parentMap.values()) {
    parent.variants.sort(
      (a, b) => (a.variant_sort_order ?? 0) - (b.variant_sort_order ?? 0),
    );
  }

  return Array.from(parentMap.values());
}

function VariantAddForm({
  parentId,
  onDone,
}: {
  parentId: number;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed || isPending) return;
    startTransition(async () => {
      await addIngredientVariantAction(parentId, trimmed);
      setName("");
      onDone();
    });
  }, [name, isPending, parentId, onDone]);

  return (
    <tr className="inventory-data-row variant-add-row">
      <td className="inventory-ingredient-name variant-name-cell" colSpan={6}>
        <div className="variant-add-form">
          <span className="variant-indent" aria-hidden="true" />
          <input
            type="text"
            className="inventory-name-input variant-add-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
              if (e.key === "Escape") onDone();
            }}
            placeholder="Variant name (e.g. Unsalted Butter)"
            disabled={isPending}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            className="variant-add-save"
            onClick={handleSubmit}
            disabled={!name.trim() || isPending}
          >
            {isPending ? "Adding…" : "Add"}
          </button>
          <button
            type="button"
            className="variant-add-cancel"
            onClick={onDone}
            disabled={isPending}
          >
            Cancel
          </button>
        </div>
      </td>
      <td />
    </tr>
  );
}

function VariantRow({
  ingredient,
  stock,
  index,
  total,
  parentId,
  allVariantIds,
}: {
  ingredient: IngredientRow;
  stock: UnifiedInventoryStock;
  index: number;
  total: number;
  parentId: number;
  allVariantIds: number[];
}) {
  const [isPending, startTransition] = useTransition();

  const moveUp = useCallback(() => {
    if (index === 0 || isPending) return;
    const next = [...allVariantIds];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    startTransition(async () => {
      await reorderVariantsAction(parentId, next);
    });
  }, [index, isPending, allVariantIds, parentId]);

  const moveDown = useCallback(() => {
    if (index === total - 1 || isPending) return;
    const next = [...allVariantIds];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    startTransition(async () => {
      await reorderVariantsAction(parentId, next);
    });
  }, [index, total, isPending, allVariantIds, parentId]);

  return (
    <tr className="inventory-data-row variant-row">
      <td className="inventory-ingredient-name variant-name-cell">
        <div className="variant-name-wrap">
          <span className="variant-indent" aria-hidden="true" />
          <span className="variant-connector" aria-hidden="true">└</span>
          <EditableIngredientName
            ingredientId={ingredient.id}
            initialName={ingredient.name || ""}
          />
          {total > 1 && (
            <span className="variant-reorder-btns">
              <button
                type="button"
                className="variant-reorder-btn"
                onClick={moveUp}
                disabled={index === 0 || isPending}
                aria-label="Move variant up"
              >
                ↑
              </button>
              <button
                type="button"
                className="variant-reorder-btn"
                onClick={moveDown}
                disabled={index === total - 1 || isPending}
                aria-label="Move variant down"
              >
                ↓
              </button>
            </span>
          )}
        </div>
      </td>
      <td className="inventory-qty-cell">
        <InventoryQtyField
          ingredientId={ingredient.id}
          inventoryId={stock.inventoryId}
          field="quantity"
          initialValue={stock.quantity}
          ariaLabel="Current quantity"
        />
      </td>
      <td className="inventory-unit-cell">
        <InventoryStockUnitSelect
          ingredientId={ingredient.id}
          inventoryId={stock.inventoryId}
          value={stock.unit}
        />
      </td>
      <td className="inventory-qty-cell">
        <InventoryQtyField
          ingredientId={ingredient.id}
          inventoryId={stock.inventoryId}
          field="min_quantity"
          initialValue={stock.min}
          maxBound={stock.max}
          ariaLabel="Minimum quantity"
        />
      </td>
      <td className="inventory-qty-cell">
        <InventoryQtyField
          ingredientId={ingredient.id}
          inventoryId={stock.inventoryId}
          field="max_quantity"
          initialValue={stock.max}
          minBound={stock.min}
          ariaLabel="Maximum quantity"
        />
      </td>
      <td className="inventory-unit-cell">
        <RecipeUnitSelect
          ingredientId={ingredient.id}
          inventoryId={stock.inventoryId}
          stockUnit={stock.unit}
          savedRecipeUnit={stock.recipeUnit}
        />
      </td>
      <td className="row-delete-cell">
        <IngredientDeleteButton
          ingredientId={ingredient.id}
          ingredientName={ingredient.name}
        />
      </td>
    </tr>
  );
}

function IngredientGroup({
  ingredient,
  invList,
}: {
  ingredient: IngredientWithVariants;
  invList: InventoryItemRow[];
}) {
  const hasVariants = ingredient.variants.length > 0;
  const [expanded, setExpanded] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const firstVariant = hasVariants ? ingredient.variants[0] : null;

  const displayIngredient = hasVariants ? firstVariant! : ingredient;
  const invRow = getInventoryRowForIngredient(invList, displayIngredient.id);
  const stock = getInventoryStockValuesUnified(displayIngredient, invRow);

  const isLocked = hasVariants;

  const allVariantIds = useMemo(
    () => ingredient.variants.map((v) => v.id),
    [ingredient.variants],
  );

  return (
    <>
      <tr
        className={`inventory-data-row ingredient-parent-row${hasVariants ? " has-variants" : ""}${isLocked ? " locked-parent" : ""}`}
      >
        <td className="inventory-ingredient-name">
          <div className="ingredient-name-with-caret">
            {hasVariants ? (
              <button
                type="button"
                className={`variant-caret${expanded ? " variant-caret-open" : ""}`}
                onClick={() => setExpanded(!expanded)}
                aria-label={expanded ? "Collapse variants" : "Expand variants"}
                aria-expanded={expanded}
              >
                ›
              </button>
            ) : (
              <span className="variant-caret-spacer" />
            )}
            <EditableIngredientName
              ingredientId={ingredient.id}
              initialName={ingredient.name || ""}
            />
          </div>
        </td>
        <td className="inventory-qty-cell">
          <InventoryQtyField
            ingredientId={displayIngredient.id}
            inventoryId={stock.inventoryId}
            field="quantity"
            initialValue={stock.quantity}
            ariaLabel="Current quantity"
            disabled={isLocked}
          />
        </td>
        <td className="inventory-unit-cell">
          <InventoryStockUnitSelect
            ingredientId={displayIngredient.id}
            inventoryId={stock.inventoryId}
            value={stock.unit}
            disabled={isLocked}
          />
        </td>
        <td className="inventory-qty-cell">
          <InventoryQtyField
            ingredientId={displayIngredient.id}
            inventoryId={stock.inventoryId}
            field="min_quantity"
            initialValue={stock.min}
            maxBound={stock.max}
            ariaLabel="Minimum quantity"
            disabled={isLocked}
          />
        </td>
        <td className="inventory-qty-cell">
          <InventoryQtyField
            ingredientId={displayIngredient.id}
            inventoryId={stock.inventoryId}
            field="max_quantity"
            initialValue={stock.max}
            minBound={stock.min}
            ariaLabel="Maximum quantity"
            disabled={isLocked}
          />
        </td>
        <td className="inventory-unit-cell">
          <RecipeUnitSelect
            ingredientId={displayIngredient.id}
            inventoryId={stock.inventoryId}
            stockUnit={stock.unit}
            savedRecipeUnit={stock.recipeUnit}
            disabled={isLocked}
          />
        </td>
        <td className="row-delete-cell">
          <div className="row-actions-wrap">
            <button
              type="button"
              className="variant-add-btn"
              onClick={() => {
                if (!expanded) setExpanded(true);
                setShowAddForm(true);
              }}
              aria-label={`Add variant to ${ingredient.name}`}
              title="Add variant"
            >
              +
            </button>
            <IngredientDeleteButton
              ingredientId={ingredient.id}
              ingredientName={ingredient.name}
            />
          </div>
        </td>
      </tr>
      {expanded &&
        hasVariants &&
        ingredient.variants.map((variant, i) => {
          const varInvRow = getInventoryRowForIngredient(invList, variant.id);
          const varStock = getInventoryStockValuesUnified(variant, varInvRow);
          return (
            <VariantRow
              key={variant.id}
              ingredient={variant}
              stock={varStock}
              index={i}
              total={ingredient.variants.length}
              parentId={ingredient.id}
              allVariantIds={allVariantIds}
            />
          );
        })}
      {expanded && showAddForm && (
        <VariantAddForm
          parentId={ingredient.id}
          onDone={() => setShowAddForm(false)}
        />
      )}
    </>
  );
}

export function InventoryTableBody({
  ingredients,
  inventory,
}: {
  ingredients: IngredientRow[];
  inventory: InventoryItemRow[];
}) {
  const grouped = useMemo(() => groupIngredients(ingredients), [ingredients]);

  return (
    <tbody>
      {grouped.map((ingredient) => (
        <IngredientGroup
          key={ingredient.id}
          ingredient={ingredient}
          invList={inventory}
        />
      ))}
    </tbody>
  );
}
