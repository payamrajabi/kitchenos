"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import type { IngredientRow, InventoryItemRow } from "@/types/database";
import {
  getInventoryRowForIngredient,
  getInventoryStockValuesUnified,
  type UnifiedInventoryStock,
} from "@/lib/inventory-display";
import { addIngredientVariantAction, reorderVariantsAction } from "@/app/actions/inventory";
import { InventoryQtyControl } from "@/components/inventory-qty-control";
import { CaretDown, CaretRight, DotsSixVertical, Plus } from "@phosphor-icons/react";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type IngredientWithVariants = IngredientRow & {
  variants: IngredientRow[];
};

function groupIngredients(
  ingredients: IngredientRow[],
): IngredientWithVariants[] {
  const parentMap = new Map<number, IngredientWithVariants>();

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

function StockCell({
  ingredient,
  stock,
  invRow,
}: {
  ingredient: IngredientRow;
  stock: UnifiedInventoryStock;
  invRow: InventoryItemRow | null | undefined;
}) {
  const qty = typeof stock.quantity === "number" ? stock.quantity : 0;
  const unit = stock.unit || "";

  return (
    <InventoryQtyControl
      ingredientId={ingredient.id}
      inventoryId={invRow?.id ?? ""}
      quantity={qty}
      unit={unit}
    />
  );
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
      <td className="inventory-ingredient-name variant-name-cell" colSpan={2}>
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
    </tr>
  );
}

function VariantRow({
  ingredient,
  stock,
  invRow,
  isSelected,
  onSelect,
  draggable,
}: {
  ingredient: IngredientRow;
  stock: UnifiedInventoryStock;
  invRow: InventoryItemRow | null | undefined;
  isSelected: boolean;
  onSelect: (id: number) => void;
  draggable: boolean;
}) {
  const sortable = useSortable({
    id: ingredient.id,
    disabled: !draggable,
  });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    sortable;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
  } as const;

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`inventory-data-row variant-row${isSelected ? " inventory-row-selected" : ""}${isDragging ? " variant-row--dragging" : ""}`}
      onClick={() => onSelect(ingredient.id)}
    >
      <td className="inventory-ingredient-name variant-name-cell">
        <div className="variant-name-wrap">
          <span className="variant-indent" aria-hidden="true" />
          {draggable ? (
            <button
              type="button"
              className="variant-drag-handle"
              aria-label={`Reorder ${ingredient.name}`}
              onClick={(e) => e.stopPropagation()}
              {...attributes}
              {...listeners}
            >
              <DotsSixVertical size={14} weight="bold" aria-hidden />
            </button>
          ) : (
            <span className="variant-connector" aria-hidden="true">•</span>
          )}
          <span className="inventory-name-text">{ingredient.name}</span>
        </div>
      </td>
      <td className="inventory-stock-display">
        <StockCell ingredient={ingredient} stock={stock} invRow={invRow} />
      </td>
    </tr>
  );
}

function IngredientGroup({
  ingredient,
  invList,
  selectedIngredientId,
  onSelectIngredient,
}: {
  ingredient: IngredientWithVariants;
  invList: InventoryItemRow[];
  selectedIngredientId: number | null;
  onSelectIngredient: (id: number) => void;
}) {
  const hasVariants = ingredient.variants.length > 0;
  const [expanded, setExpanded] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [, startTransition] = useTransition();
  const [localOrder, setLocalOrder] = useState<number[] | null>(null);

  const invRow = getInventoryRowForIngredient(invList, ingredient.id);
  const stock = getInventoryStockValuesUnified(ingredient, invRow);

  const isSelected = selectedIngredientId === ingredient.id;

  const variantIds = useMemo(
    () => ingredient.variants.map((v) => v.id),
    [ingredient.variants],
  );

  const orderedVariantIds = localOrder ?? variantIds;

  const variantsById = useMemo(() => {
    const map = new Map<number, IngredientRow>();
    for (const v of ingredient.variants) map.set(v.id, v);
    return map;
  }, [ingredient.variants]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const current = orderedVariantIds;
      const oldIndex = current.indexOf(Number(active.id));
      const newIndex = current.indexOf(Number(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      const next = arrayMove(current, oldIndex, newIndex);
      setLocalOrder(next);
      startTransition(async () => {
        const result = await reorderVariantsAction(ingredient.id, next);
        if (!result?.ok) setLocalOrder(null);
      });
    },
    [orderedVariantIds, ingredient.id],
  );

  return (
    <>
      <tr
        className={`inventory-data-row ingredient-parent-row${hasVariants ? " has-variants" : ""}${isSelected ? " inventory-row-selected" : ""}`}
        onClick={() => onSelectIngredient(ingredient.id)}
      >
        <td className="inventory-ingredient-name">
          <div className="ingredient-name-cell-layout">
            <div className="ingredient-name-with-caret">
              {hasVariants ? (
                <button
                  type="button"
                  className="variant-caret"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded(!expanded);
                  }}
                  aria-label={expanded ? "Collapse variants" : "Expand variants"}
                  aria-expanded={expanded}
                >
                  {expanded ? (
                    <CaretDown size={12} weight="bold" aria-hidden />
                  ) : (
                    <CaretRight size={12} weight="bold" aria-hidden />
                  )}
                </button>
              ) : (
                <span className="variant-caret-spacer" />
              )}
              <span className="inventory-name-text">{ingredient.name}</span>
            </div>
            <button
              type="button"
              className="variant-add-btn variant-add-btn--name-col"
              onClick={(e) => {
                e.stopPropagation();
                if (!expanded) setExpanded(true);
                setShowAddForm(true);
              }}
              aria-label={`Add variant to ${ingredient.name}`}
              title="Add variant"
            >
              <Plus size={14} weight="bold" aria-hidden />
            </button>
          </div>
        </td>
        <td className="inventory-stock-display">
          {hasVariants ? null : (
            <StockCell ingredient={ingredient} stock={stock} invRow={invRow} />
          )}
        </td>
      </tr>
      {expanded && hasVariants && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={orderedVariantIds}
            strategy={verticalListSortingStrategy}
          >
            {orderedVariantIds.map((id) => {
              const variant = variantsById.get(id);
              if (!variant) return null;
              const varInvRow = getInventoryRowForIngredient(invList, variant.id);
              const varStock = getInventoryStockValuesUnified(variant, varInvRow);
              return (
                <VariantRow
                  key={variant.id}
                  ingredient={variant}
                  stock={varStock}
                  invRow={varInvRow}
                  isSelected={selectedIngredientId === variant.id}
                  onSelect={onSelectIngredient}
                  draggable={orderedVariantIds.length > 1}
                />
              );
            })}
          </SortableContext>
        </DndContext>
      )}
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
  selectedIngredientId,
  onSelectIngredient,
}: {
  ingredients: IngredientRow[];
  inventory: InventoryItemRow[];
  selectedIngredientId: number | null;
  onSelectIngredient: (id: number) => void;
}) {
  const grouped = useMemo(() => groupIngredients(ingredients), [ingredients]);

  return (
    <tbody>
      {grouped.map((ingredient) => (
        <IngredientGroup
          key={ingredient.id}
          ingredient={ingredient}
          invList={inventory}
          selectedIngredientId={selectedIngredientId}
          onSelectIngredient={onSelectIngredient}
        />
      ))}
    </tbody>
  );
}
