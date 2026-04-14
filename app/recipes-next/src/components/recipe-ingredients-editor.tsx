"use client";

import {
  addRecipeIngredientAction,
  addRecipeIngredientSectionAction,
  createIngredientAndAddToRecipeAction,
  createIngredientAndAssignToRecipeLineAction,
  deleteRecipeIngredientAction,
  deleteRecipeIngredientSectionAction,
  reorderRecipeIngredientsFlatLayoutAction,
  reorderRecipeIngredientsInSectionAction,
  updateRecipeIngredientAction,
  updateRecipeIngredientSectionAction,
} from "@/app/actions/recipes";
import { SearchableSelect, type SelectOption } from "@/components/searchable-select";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DotsSixVertical, Trash } from "@phosphor-icons/react";
import { RECIPE_UNITS } from "@/lib/unit-mapping";
import type { RecipeIngredientRow, RecipeIngredientSectionRow } from "@/types/database";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type Dispatch,
  type KeyboardEvent,
  type Ref,
  type ReactNode,
  type SetStateAction,
} from "react";

type IngredientOption = {
  id: number;
  name: string;
  parentIngredientId?: number | null;
  variantSortOrder?: number;
};

type Props = {
  recipeId: number;
  initialItems: RecipeIngredientRow[];
  initialSections: RecipeIngredientSectionRow[];
  ingredientOptions: IngredientOption[];
};

type Suggestion =
  | {
      kind: "existing";
      key: string;
      label: string;
      ingredient: IngredientOption;
    }
  | {
      kind: "create";
      key: string;
      label: string;
      name: string;
    };

const DEFAULT_UNIT = "g";
const UNIT_OPTIONS: SelectOption[] = RECIPE_UNITS.map((unit) => ({
  value: unit,
  label: unit,
}));

/** Prefer pointer-inside hit targets; fall back so drops near the last row still resolve. */
const ingredientRowCollisionDetection: CollisionDetection = (args) => {
  const pointerHit = pointerWithin(args);
  if (pointerHit.length > 0) return pointerHit;
  return closestCorners(args);
};

function coalesceIsOptional(raw: unknown): boolean {
  return raw === true || raw === 1 || raw === "true" || raw === "t";
}

function sortIngredientOptions(options: IngredientOption[]) {
  return [...options].sort((a, b) => a.name.localeCompare(b.name));
}

function sortSectionsCopy(sections: RecipeIngredientSectionRow[]) {
  return [...sections].sort((a, b) => a.sort_order - b.sort_order);
}

function normalizeRow(row: RecipeIngredientRow): RecipeIngredientRow {
  const sid = row.section_id;
  return {
    ...row,
    amount: row.amount == null ? null : String(row.amount),
    unit: row.unit == null || String(row.unit).trim() === "" ? DEFAULT_UNIT : String(row.unit),
    is_optional: coalesceIsOptional(row.is_optional),
    line_sort_order: Number.isFinite(row.line_sort_order) ? row.line_sort_order : 0,
    section_id:
      sid === null || sid === undefined || String(sid).trim() === "" ? null : String(sid),
    ingredients: row.ingredients
      ? {
          id: Number(row.ingredients.id),
          name: String(row.ingredients.name ?? ""),
        }
      : null,
  };
}

function sortItemsForDisplay(
  rows: RecipeIngredientRow[],
  sections: RecipeIngredientSectionRow[],
): RecipeIngredientRow[] {
  const rank = new Map<string | null, number>();
  rank.set(null, -1);
  for (const s of sortSectionsCopy(sections)) {
    rank.set(s.id, s.sort_order);
  }
  return [...rows].sort((a, b) => {
    const ra = rank.get(a.section_id) ?? 9999;
    const rb = rank.get(b.section_id) ?? 9999;
    if (ra !== rb) return ra - rb;
    const lo = a.line_sort_order - b.line_sort_order;
    if (lo !== 0) return lo;
    return (a.ingredients?.name ?? "").localeCompare(b.ingredients?.name ?? "");
  });
}

/**
 * DndContext injects accessibility nodes that must not sit inside <table>.
 * Keep one context per table, wrapping the whole <table> (not each <tbody>).
 */
function RecipeIngredientsTableDndFlat({
  dndId,
  items,
  onReorderFlat,
  children,
}: {
  dndId: string;
  items: RecipeIngredientRow[];
  /** Full visual list after drag — may mix section_id until server assigns orphans to the sole section. */
  onReorderFlat: (nextItems: RecipeIngredientRow[]) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const activeNum = Number(active.id);
      const overNum = Number(over.id);
      const oldIndex = items.findIndex((i) => i.id === activeNum);
      const newIndex = items.findIndex((i) => i.id === overNum);
      if (oldIndex < 0 || newIndex < 0) return;
      const nextItems = arrayMove(items, oldIndex, newIndex).map((row, i) => ({
        ...row,
        line_sort_order: i,
      }));
      onReorderFlat(nextItems);
    },
    [items, onReorderFlat],
  );

  return (
    <DndContext id={dndId} sensors={sensors} collisionDetection={ingredientRowCollisionDetection} onDragEnd={onDragEnd}>
      {children}
    </DndContext>
  );
}

function RecipeIngredientsTableDndSection({
  dndId,
  sectionId,
  segmentItems,
  onReorderSegment,
  children,
}: {
  dndId: string;
  sectionId: string | null;
  segmentItems: RecipeIngredientRow[];
  onReorderSegment: (sectionId: string | null, nextSegment: RecipeIngredientRow[]) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const activeNum = Number(active.id);
      const overNum = Number(over.id);
      const oldIndex = segmentItems.findIndex((i) => i.id === activeNum);
      const newIndex = segmentItems.findIndex((i) => i.id === overNum);
      if (oldIndex < 0 || newIndex < 0) return;
      const nextSegment = arrayMove(segmentItems, oldIndex, newIndex).map((row, i) => ({
        ...row,
        line_sort_order: i,
      }));
      onReorderSegment(sectionId, nextSegment);
    },
    [segmentItems, onReorderSegment, sectionId],
  );

  return (
    <DndContext id={dndId} sensors={sensors} collisionDetection={ingredientRowCollisionDetection} onDragEnd={onDragEnd}>
      {children}
    </DndContext>
  );
}

/**
 * Replaces one contiguous block of rows (identified by id set) with a new order.
 * Must not use the "first row after reorder" to find the slice — that breaks when
 * the previous first row was moved away (e.g. dragging the top line to the bottom).
 */
function replaceSegmentInFullList(
  full: RecipeIngredientRow[],
  segmentIds: Set<number>,
  reorderedSegment: RecipeIngredientRow[],
): RecipeIngredientRow[] {
  if (segmentIds.size !== reorderedSegment.length) return full;
  const next: RecipeIngredientRow[] = [];
  let inserted = false;
  for (const row of full) {
    if (!segmentIds.has(row.id)) {
      next.push(row);
      continue;
    }
    if (!inserted) {
      for (const r of reorderedSegment) next.push(r);
      inserted = true;
    }
  }
  return inserted ? next : full;
}

function IngredientSearchControl({
  knownIngredients,
  disabled,
  placeholder,
  ariaLabel,
  inputId,
  labelHidden,
  defaultQuery = "",
  autoFocus,
  onPickSuggestion,
  onCancel,
}: {
  knownIngredients: IngredientOption[];
  disabled: boolean;
  placeholder: string;
  ariaLabel: string;
  inputId: string;
  labelHidden?: string;
  defaultQuery?: string;
  autoFocus?: boolean;
  onPickSuggestion: (suggestion: Suggestion) => void;
  onCancel?: () => void;
}) {
  const [query, setQuery] = useState(defaultQuery);
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery(defaultQuery);
  }, [defaultQuery]);

  const trimmedQuery = query.trim();
  const loweredQuery = trimmedQuery.toLowerCase();

  const variantsByParent = useMemo(() => {
    const map = new Map<number, IngredientOption[]>();
    for (const ing of knownIngredients) {
      if (ing.parentIngredientId) {
        const list = map.get(ing.parentIngredientId) ?? [];
        list.push(ing);
        map.set(ing.parentIngredientId, list);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.variantSortOrder ?? 0) - (b.variantSortOrder ?? 0));
    }
    return map;
  }, [knownIngredients]);

  const parentNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const ing of knownIngredients) {
      if (!ing.parentIngredientId) {
        map.set(ing.id, ing.name);
      }
    }
    return map;
  }, [knownIngredients]);

  const matchingIngredients = useMemo(() => {
    if (!loweredQuery) return knownIngredients.slice(0, 12);
    return knownIngredients.filter((ingredient) =>
      ingredient.name.toLowerCase().includes(loweredQuery),
    );
  }, [knownIngredients, loweredQuery]);

  const exactMatchExists = useMemo(
    () =>
      loweredQuery !== "" &&
      knownIngredients.some(
        (ingredient) => ingredient.name.trim().toLowerCase() === loweredQuery,
      ),
    [knownIngredients, loweredQuery],
  );

  const suggestions = useMemo<Suggestion[]>(() => {
    const next: Suggestion[] = matchingIngredients.map((ingredient) => {
      const isVariant = !!ingredient.parentIngredientId;
      const parentName = isVariant
        ? parentNameById.get(ingredient.parentIngredientId!) ?? null
        : null;

      const hasVariants = !isVariant && variantsByParent.has(ingredient.id);
      let resolvedIngredient = ingredient;
      if (hasVariants) {
        const firstVariant = variantsByParent.get(ingredient.id)?.[0];
        if (firstVariant) resolvedIngredient = firstVariant;
      }

      const label = isVariant && parentName
        ? `${ingredient.name}  ‹${parentName}›`
        : ingredient.name;

      return {
        kind: "existing" as const,
        key: `ingredient-${ingredient.id}`,
        label,
        ingredient: resolvedIngredient,
      };
    });
    if (trimmedQuery && !exactMatchExists) {
      next.push({
        kind: "create",
        key: `create-${trimmedQuery.toLowerCase()}`,
        label: `Create "${trimmedQuery}"`,
        name: trimmedQuery,
      });
    }
    return next;
  }, [exactMatchExists, matchingIngredients, trimmedQuery, variantsByParent, parentNameById]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [autoFocus]);

  const closePicker = useCallback(() => {
    setOpen(false);
    setQuery(defaultQuery);
    setHighlightIdx(0);
  }, [defaultQuery]);

  const pickSuggestion = useCallback(
    (suggestion: Suggestion) => {
      onPickSuggestion(suggestion);
    },
    [onPickSuggestion],
  );

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (!open && event.key === "ArrowDown") {
        event.preventDefault();
        setOpen(true);
        return;
      }

      if (!open) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightIdx((current) => Math.min(current + 1, suggestions.length - 1));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightIdx((current) => Math.max(current - 1, 0));
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const suggestion = suggestions[highlightIdx];
        if (suggestion) {
          pickSuggestion(suggestion);
        }
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closePicker();
        onCancel?.();
      }
    },
    [closePicker, highlightIdx, onCancel, open, pickSuggestion, suggestions],
  );

  return (
    <div ref={rootRef} className="recipe-ingredients-add-cell-inner">
      {labelHidden ? (
        <label htmlFor={inputId} className="visually-hidden">
          {labelHidden}
        </label>
      ) : null}
      <div className="recipe-ingredients-add-input-wrap">
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          className="ss-input recipe-ingredients-add-input"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlightIdx(0);
            setOpen(true);
          }}
          onFocus={() => {
            setHighlightIdx(0);
            setOpen(true);
          }}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          aria-label={ariaLabel}
        />
      </div>
      {open ? (
        <ul className="ss-list recipe-ingredients-suggestions" role="listbox">
          {suggestions.length ? (
            suggestions.map((suggestion, index) => (
              <li
                key={suggestion.key}
                role="option"
                aria-selected={index === highlightIdx}
                className={`ss-option${index === highlightIdx ? " ss-option-highlight" : ""}${suggestion.kind === "create" ? " recipe-ingredients-create-option" : ""}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pickSuggestion(suggestion);
                }}
                onMouseEnter={() => setHighlightIdx(index)}
              >
                {suggestion.label}
              </li>
            ))
          ) : (
            <li className="ss-empty">No ingredients found.</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

function RecipeIngredientItemRow({
  recipeId,
  item,
  disabled,
  namePickerDisabled,
  knownIngredients,
  setKnownIngredients,
  upsertLocalRow,
  runAction,
  setError,
  onSaveAmount,
  onChangeUnit,
  onToggleOptional,
  onRemove,
  focusAmountLineId,
  onConsumeFocusAmount,
  addIngredientInputId,
  rowRef,
  rowStyle,
  dragHandleSlot,
}: {
  recipeId: number;
  item: RecipeIngredientRow;
  disabled: boolean;
  namePickerDisabled: boolean;
  knownIngredients: IngredientOption[];
  setKnownIngredients: Dispatch<SetStateAction<IngredientOption[]>>;
  upsertLocalRow: (row: RecipeIngredientRow) => void;
  runAction: (key: string, fn: () => Promise<void>) => void;
  setError: (msg: string | null) => void;
  onSaveAmount: (lineId: number, amount: string) => void;
  onChangeUnit: (lineId: number, unit: string) => void;
  onToggleOptional: (lineId: number, isOptional: boolean) => void;
  onRemove: (lineId: number) => void;
  focusAmountLineId: number | null;
  onConsumeFocusAmount: () => void;
  addIngredientInputId: string | null;
  rowRef?: Ref<HTMLTableRowElement>;
  rowStyle?: CSSProperties;
  dragHandleSlot?: ReactNode;
}) {
  const [amount, setAmount] = useState(item.amount ?? "");
  const [naming, setNaming] = useState(false);
  const amountInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusAmountLineId !== item.id) return;
    const frame = requestAnimationFrame(() => {
      const el = amountInputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
      onConsumeFocusAmount();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusAmountLineId, item.id, onConsumeFocusAmount]);

  const commitAmount = useCallback(() => {
    const next = amount.trim();
    const prev = (item.amount ?? "").trim();
    if (next === prev) return;
    onSaveAmount(item.id, next);
  }, [amount, item.amount, item.id, onSaveAmount]);

  const displayName = item.ingredients?.name ?? "Untitled";
  const pickLineIngredient = useCallback(
    (suggestion: Suggestion) => {
      if (suggestion.kind === "existing") {
        if (suggestion.ingredient.id === item.ingredient_id) {
          setNaming(false);
          return;
        }
        runAction(`ingredient-${item.id}-${suggestion.ingredient.id}`, async () => {
          const result = await updateRecipeIngredientAction(recipeId, item.id, {
            ingredient_id: suggestion.ingredient.id,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          upsertLocalRow(result.row);
          setNaming(false);
        });
        return;
      }

      runAction(`ingredient-create-${item.id}`, async () => {
        const result = await createIngredientAndAssignToRecipeLineAction(
          recipeId,
          item.id,
          suggestion.name,
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
        upsertLocalRow(result.row);
        setKnownIngredients((current) =>
          sortIngredientOptions(
            current.some((ingredient) => ingredient.id === result.row.ingredient_id)
              ? current
              : [
                  ...current,
                  {
                    id: result.row.ingredient_id,
                    name: result.row.ingredients?.name ?? suggestion.name,
                  },
                ],
          ),
        );
        setNaming(false);
      });
    },
    [item.id, item.ingredient_id, recipeId, runAction, setError, setKnownIngredients, upsertLocalRow],
  );

  return (
    <tr ref={rowRef} style={rowStyle}>
      {dragHandleSlot != null ? (
        <td className="recipe-ingredient-drag-cell">{dragHandleSlot}</td>
      ) : null}
      <td className="recipe-ingredient-name-cell">
        {naming ? (
          <IngredientSearchControl
            key={`${item.id}-${item.ingredient_id}`}
            knownIngredients={knownIngredients}
            disabled={namePickerDisabled}
            placeholder="Search or create…"
            ariaLabel={`Change ingredient (currently ${displayName})`}
            inputId={`recipe-ingredient-rename-${item.id}`}
            defaultQuery={displayName}
            autoFocus
            onPickSuggestion={pickLineIngredient}
            onCancel={() => setNaming(false)}
          />
        ) : (
          <button
            type="button"
            className="recipe-ingredient-name-button"
            disabled={namePickerDisabled}
            onClick={() => setNaming(true)}
          >
            <span className="recipe-ingredient-name">{displayName}</span>
          </button>
        )}
      </td>
      <td className="recipe-ingredient-amount-cell">
        <input
          ref={amountInputRef}
          type="text"
          className="recipe-ingredient-amount-input"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onBlur={commitAmount}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (addIngredientInputId) {
                document.getElementById(addIngredientInputId)?.focus();
              } else {
                (e.target as HTMLInputElement).blur();
              }
            }
          }}
          disabled={disabled}
          placeholder="Amount"
          aria-label={`Amount for ${item.ingredients?.name ?? "ingredient"}`}
        />
      </td>
      <td className="recipe-ingredient-unit-cell">
        <SearchableSelect
          className="inventory-unit-select recipe-ingredient-unit-select"
          options={UNIT_OPTIONS}
          value={item.unit || DEFAULT_UNIT}
          onChange={(unit) => onChangeUnit(item.id, unit || DEFAULT_UNIT)}
          disabled={disabled}
          aria-label={`Unit for ${item.ingredients?.name ?? "ingredient"}`}
          placeholder={DEFAULT_UNIT}
        />
      </td>
      <td className="recipe-ingredient-optional-cell">
        <label className="recipe-ingredient-optional-label">
          <input
            type="checkbox"
            className="recipe-ingredient-optional-input"
            checked={item.is_optional}
            onChange={(e) => onToggleOptional(item.id, e.target.checked)}
            disabled={disabled}
            aria-label={`Mark ${item.ingredients?.name ?? "ingredient"} as optional`}
          />
        </label>
      </td>
      <td className="recipe-ingredient-remove-cell">
        <button
          type="button"
          className="recipe-ingredient-remove-button"
          onClick={() => onRemove(item.id)}
          disabled={disabled}
          aria-label={`Remove ${item.ingredients?.name ?? "ingredient"}`}
        >
          Remove
        </button>
      </td>
    </tr>
  );
}

function SortableRecipeIngredientRow({
  recipeId,
  item,
  disabled,
  namePickerDisabled,
  knownIngredients,
  setKnownIngredients,
  upsertLocalRow,
  runAction,
  setError,
  onSaveAmount,
  onChangeUnit,
  onToggleOptional,
  onRemove,
  focusAmountLineId,
  onConsumeFocusAmount,
  addIngredientInputId,
  dragDisabled,
}: {
  recipeId: number;
  item: RecipeIngredientRow;
  disabled: boolean;
  namePickerDisabled: boolean;
  knownIngredients: IngredientOption[];
  setKnownIngredients: Dispatch<SetStateAction<IngredientOption[]>>;
  upsertLocalRow: (row: RecipeIngredientRow) => void;
  runAction: (key: string, fn: () => Promise<void>) => void;
  setError: (msg: string | null) => void;
  onSaveAmount: (lineId: number, amount: string) => void;
  onChangeUnit: (lineId: number, unit: string) => void;
  onToggleOptional: (lineId: number, isOptional: boolean) => void;
  onRemove: (lineId: number) => void;
  focusAmountLineId: number | null;
  onConsumeFocusAmount: () => void;
  addIngredientInputId: string | null;
  dragDisabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(item.id),
    disabled: dragDisabled,
  });
  const rowStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : undefined,
    zIndex: isDragging ? 2 : undefined,
    position: isDragging ? "relative" : undefined,
  };

  return (
    <RecipeIngredientItemRow
      recipeId={recipeId}
      item={item}
      disabled={disabled}
      namePickerDisabled={namePickerDisabled}
      knownIngredients={knownIngredients}
      setKnownIngredients={setKnownIngredients}
      upsertLocalRow={upsertLocalRow}
      runAction={runAction}
      setError={setError}
      onSaveAmount={onSaveAmount}
      onChangeUnit={onChangeUnit}
      onToggleOptional={onToggleOptional}
      onRemove={onRemove}
      focusAmountLineId={focusAmountLineId}
      onConsumeFocusAmount={onConsumeFocusAmount}
      addIngredientInputId={addIngredientInputId}
      rowRef={setNodeRef}
      rowStyle={rowStyle}
      dragHandleSlot={
        <button
          type="button"
          className="recipe-ingredient-drag-handle"
          {...attributes}
          {...listeners}
          disabled={dragDisabled}
          aria-label={`Reorder ${item.ingredients?.name ?? "ingredient"}`}
        >
          <DotsSixVertical className="recipe-ingredient-drag-icon" size={20} weight="bold" aria-hidden />
        </button>
      }
    />
  );
}

function IngredientsTableHeadRow() {
  return (
    <thead>
      <tr>
        <th className="recipe-ingredient-drag-header" scope="col">
          <span className="visually-hidden">Reorder</span>
        </th>
        <th>Name</th>
        <th>Amount</th>
        <th>Unit</th>
        <th className="recipe-ingredient-optional-header" scope="col" title="Optional ingredient">
          Opt.
        </th>
        <th className="recipe-ingredient-remove-header">
          <span className="visually-hidden">Remove ingredient</span>
        </th>
      </tr>
    </thead>
  );
}

function IngredientLinesSortable({
  recipeId,
  sortableListId,
  items,
  isPending,
  busyKey,
  knownIngredients,
  setKnownIngredients,
  upsertLocalRow,
  runAction,
  setError,
  onSaveAmount,
  onChangeUnit,
  onToggleOptional,
  onRemove,
  focusAmountLineId,
  onConsumeFocusAmount,
  addIngredientInputId,
}: {
  recipeId: number;
  /** Distinct SortableContext id when one DndContext hosts multiple tbodys (flat layout). */
  sortableListId: string;
  items: RecipeIngredientRow[];
  isPending: boolean;
  busyKey: string | null;
  knownIngredients: IngredientOption[];
  setKnownIngredients: Dispatch<SetStateAction<IngredientOption[]>>;
  upsertLocalRow: (row: RecipeIngredientRow) => void;
  runAction: (key: string, fn: () => Promise<void>) => void;
  setError: (msg: string | null) => void;
  onSaveAmount: (lineId: number, amount: string) => void;
  onChangeUnit: (lineId: number, unit: string) => void;
  onToggleOptional: (lineId: number, isOptional: boolean) => void;
  onRemove: (lineId: number) => void;
  focusAmountLineId: number | null;
  onConsumeFocusAmount: () => void;
  addIngredientInputId: string | null;
}) {
  const ids = useMemo(() => items.map((i) => String(i.id)), [items]);

  if (!items.length) {
    return null;
  }

  return (
    <SortableContext id={sortableListId} items={ids} strategy={verticalListSortingStrategy}>
      <tbody>
        {items.map((item) => {
          const rowBusy =
            busyKey === `amount-${item.id}` ||
            busyKey === `unit-${item.id}` ||
            busyKey === `optional-${item.id}` ||
            busyKey === `remove-${item.id}` ||
            busyKey === `ingredient-create-${item.id}` ||
            (busyKey != null && busyKey.startsWith(`ingredient-${item.id}-`));
          return (
            <SortableRecipeIngredientRow
              key={item.id}
              recipeId={recipeId}
              item={item}
              disabled={isPending && rowBusy}
              namePickerDisabled={isPending && rowBusy}
              knownIngredients={knownIngredients}
              setKnownIngredients={setKnownIngredients}
              upsertLocalRow={upsertLocalRow}
              runAction={runAction}
              setError={setError}
              onSaveAmount={onSaveAmount}
              onChangeUnit={onChangeUnit}
              onToggleOptional={onToggleOptional}
              onRemove={onRemove}
              focusAmountLineId={focusAmountLineId}
              onConsumeFocusAmount={onConsumeFocusAmount}
              addIngredientInputId={addIngredientInputId}
              dragDisabled={isPending}
            />
          );
        })}
      </tbody>
    </SortableContext>
  );
}

function ComponentSectionHeading({
  title,
  disabled,
  onCommit,
  onDelete,
}: {
  title: string;
  disabled: boolean;
  onCommit: (nextTitle: string) => void;
  onDelete?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  useEffect(() => {
    setDraft(title);
  }, [title]);

  if (editing) {
    return (
      <div className="recipe-ingredient-section-heading recipe-ingredient-section-heading--editing">
        <input
          type="text"
          className="recipe-ingredient-section-title-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false);
            const next = draft.trim();
            if (next !== title.trim()) onCommit(next);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === "Escape") {
              setDraft(title);
              setEditing(false);
            }
          }}
          autoFocus
          disabled={disabled}
          aria-label="Component name"
        />
        {onDelete ? (
          <button
            type="button"
            className="recipe-ingredient-section-delete"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onDelete();
              setEditing(false);
            }}
            disabled={disabled}
            aria-label="Delete component"
          >
            <Trash className="recipe-ingredient-section-delete-icon" size={18} aria-hidden />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="recipe-ingredient-section-heading">
      <button
        type="button"
        className="recipe-ingredient-section-title-button"
        onClick={() => setEditing(true)}
        disabled={disabled}
      >
        {title.trim() || "Untitled component"}
      </button>
      {onDelete ? (
        <button
          type="button"
          className="recipe-ingredient-section-delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          disabled={disabled}
          aria-label="Delete component"
        >
          <Trash className="recipe-ingredient-section-delete-icon" size={18} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

function IngredientAddTableRow({
  recipeId,
  sectionId,
  label,
  knownIngredients,
  setKnownIngredients,
  upsertLocalRow,
  runAction,
  isPending,
  setError,
  onLineAdded,
}: {
  recipeId: number;
  sectionId: string | null;
  label: string;
  knownIngredients: IngredientOption[];
  setKnownIngredients: Dispatch<SetStateAction<IngredientOption[]>>;
  upsertLocalRow: (row: RecipeIngredientRow) => void;
  runAction: (key: string, fn: () => Promise<void>) => void;
  isPending: boolean;
  setError: (msg: string | null) => void;
  onLineAdded?: (lineId: number) => void;
}) {
  const [fieldKey, setFieldKey] = useState(0);

  const pickSuggestion = useCallback(
    (suggestion: Suggestion) => {
      if (suggestion.kind === "existing") {
        runAction(`add-${sectionId ?? "flat"}-${suggestion.ingredient.id}-${Date.now()}`, async () => {
          const result = await addRecipeIngredientAction(
            recipeId,
            suggestion.ingredient.id,
            sectionId,
          );
          if (!result.ok) {
            setError(result.error);
            return;
          }
          upsertLocalRow(result.row);
          onLineAdded?.(result.row.id);
          setFieldKey((k) => k + 1);
        });
        return;
      }

      runAction(`create-${sectionId ?? "flat"}-${suggestion.name}`, async () => {
        const result = await createIngredientAndAddToRecipeAction(
          recipeId,
          suggestion.name,
          sectionId,
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
        upsertLocalRow(result.row);
        onLineAdded?.(result.row.id);
        setKnownIngredients((current) =>
          sortIngredientOptions(
            current.some((ingredient) => ingredient.id === result.row.ingredient_id)
              ? current
              : [
                  ...current,
                  {
                    id: result.row.ingredient_id,
                    name: result.row.ingredients?.name ?? suggestion.name,
                  },
                ],
          ),
        );
        setFieldKey((k) => k + 1);
      });
    },
    [onLineAdded, recipeId, runAction, sectionId, setError, setKnownIngredients, upsertLocalRow],
  );

  return (
    <tr className="recipe-ingredients-add-row">
      <td
        className="recipe-ingredient-drag-cell recipe-ingredients-add-placeholder-cell"
        aria-hidden="true"
      />
      <td className="recipe-ingredient-name-cell recipe-ingredients-add-name-cell">
        <IngredientSearchControl
          key={`${sectionId ?? "flat"}-${fieldKey}`}
          knownIngredients={knownIngredients}
          disabled={isPending}
          placeholder="Add ingredient…"
          ariaLabel={label}
          inputId={`recipe-ingredient-add-${sectionId ?? "flat"}`}
          labelHidden={label}
          defaultQuery=""
          onPickSuggestion={pickSuggestion}
        />
      </td>
      <td className="recipe-ingredient-amount-cell recipe-ingredients-add-placeholder-cell" aria-hidden="true">
        —
      </td>
      <td className="recipe-ingredient-unit-cell recipe-ingredients-add-placeholder-cell" aria-hidden="true">
        —
      </td>
      <td
        className="recipe-ingredient-optional-cell recipe-ingredients-add-placeholder-cell"
        aria-hidden="true"
      >
        —
      </td>
      <td className="recipe-ingredient-remove-cell" />
    </tr>
  );
}

export function RecipeIngredientsEditor({
  recipeId,
  initialItems,
  initialSections,
  ingredientOptions,
}: Props) {
  const router = useRouter();
  const [sections, setSections] = useState(() => sortSectionsCopy(initialSections));
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const [items, setItems] = useState(() =>
    sortItemsForDisplay(initialItems.map(normalizeRow), initialSections),
  );
  const [knownIngredients, setKnownIngredients] = useState(() =>
    sortIngredientOptions(ingredientOptions),
  );
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [focusAmountLineId, setFocusAmountLineId] = useState<number | null>(null);

  const consumeFocusAmount = useCallback(() => {
    setFocusAmountLineId(null);
  }, []);

  useEffect(() => {
    setSections(sortSectionsCopy(initialSections));
  }, [initialSections]);

  useEffect(() => {
    setItems(sortItemsForDisplay(initialItems.map(normalizeRow), initialSections));
  }, [initialItems, initialSections]);

  useEffect(() => {
    setKnownIngredients(sortIngredientOptions(ingredientOptions));
  }, [ingredientOptions]);

  const useGroupedLayout = sections.length >= 2;

  const runAction = useCallback((nextBusyKey: string, fn: () => Promise<void>) => {
    setError(null);
    setBusyKey(nextBusyKey);
    startTransition(() => {
      void (async () => {
        try {
          await fn();
        } finally {
          setBusyKey(null);
        }
      })();
    });
  }, []);

  const upsertLocalRow = useCallback((row: RecipeIngredientRow) => {
    const normalized = normalizeRow(row);
    setItems((current) =>
      sortItemsForDisplay(
        current.some((item) => item.id === normalized.id)
          ? current.map((item) => (item.id === normalized.id ? normalized : item))
          : [...current, normalized],
        sectionsRef.current,
      ),
    );
  }, []);

  const saveAmount = useCallback(
    (lineId: number, amount: string) => {
      runAction(`amount-${lineId}`, async () => {
        const result = await updateRecipeIngredientAction(recipeId, lineId, {
          amount,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        upsertLocalRow(result.row);
      });
    },
    [recipeId, runAction, upsertLocalRow],
  );

  const changeUnit = useCallback(
    (lineId: number, unit: string) => {
      runAction(`unit-${lineId}`, async () => {
        const result = await updateRecipeIngredientAction(recipeId, lineId, {
          unit: unit || DEFAULT_UNIT,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        upsertLocalRow(result.row);
      });
    },
    [recipeId, runAction, upsertLocalRow],
  );

  const toggleOptional = useCallback(
    (lineId: number, isOptional: boolean) => {
      runAction(`optional-${lineId}`, async () => {
        const result = await updateRecipeIngredientAction(recipeId, lineId, {
          is_optional: isOptional,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        upsertLocalRow(result.row);
      });
    },
    [recipeId, runAction, upsertLocalRow],
  );

  const removeIngredient = useCallback(
    (lineId: number) => {
      runAction(`remove-${lineId}`, async () => {
        const result = await deleteRecipeIngredientAction(recipeId, lineId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setItems((current) => current.filter((item) => item.id !== lineId));
      });
    },
    [recipeId, runAction],
  );

  const reorderSegment = useCallback(
    (sectionId: string | null, nextSegment: RecipeIngredientRow[]) => {
      if (nextSegment.length === 0) return;
      const orderedLineIds = nextSegment.map((r) => r.id);
      const idSet = new Set(orderedLineIds);
      setItems((prev) => replaceSegmentInFullList(prev, idSet, nextSegment));
      runAction(`reorder-${sectionId ?? "null"}-${orderedLineIds[0]}`, async () => {
        const result = await reorderRecipeIngredientsInSectionAction(recipeId, sectionId, orderedLineIds);
        if (!result.ok) {
          setError(result.error);
          router.refresh();
        }
      });
    },
    [recipeId, router, runAction],
  );

  const reorderFlatLayout = useCallback(
    (nextRows: RecipeIngredientRow[]) => {
      if (nextRows.length === 0) return;
      const orderedLineIds = nextRows.map((r) => r.id);
      let patched = nextRows.map((r, i) => ({ ...r, line_sort_order: i }));
      if (sections.length === 1) {
        const sole = sections[0]!.id;
        patched = patched.map((r) => (r.section_id == null ? { ...r, section_id: sole } : r));
      }
      setItems(sortItemsForDisplay(patched, sections));
      runAction(`reorder-flat-${orderedLineIds[0]}`, async () => {
        const result = await reorderRecipeIngredientsFlatLayoutAction(recipeId, orderedLineIds);
        if (!result.ok) {
          setError(result.error);
          router.refresh();
        }
      });
    },
    [recipeId, router, runAction, sections],
  );

  const saveSectionTitle = useCallback(
    (sectionId: string, title: string) => {
      runAction(`section-title-${sectionId}`, async () => {
        const result = await updateRecipeIngredientSectionAction(sectionId, title);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setSections((cur) =>
          sortSectionsCopy(cur.map((s) => (s.id === sectionId ? { ...s, title } : s))),
        );
      });
    },
    [runAction],
  );

  const addComponent = useCallback(() => {
    runAction("add-component", async () => {
      const result = await addRecipeIngredientSectionAction(recipeId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }, [recipeId, router, runAction]);

  const removeSection = useCallback(
    (sectionId: string) => {
      runAction(`delete-section-${sectionId}`, async () => {
        const result = await deleteRecipeIngredientSectionAction(recipeId, sectionId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setSections((cur) => {
          const nextSecs = sortSectionsCopy(cur.filter((s) => s.id !== sectionId));
          setItems((current) =>
            sortItemsForDisplay(
              current.map((row) =>
                row.section_id === sectionId ? { ...row, section_id: null } : row,
              ),
              nextSecs,
            ),
          );
          return nextSecs;
        });
      });
    },
    [recipeId, runAction],
  );

  const sectionIdSet = useMemo(() => new Set(sections.map((s) => s.id)), [sections]);
  const orphanItems = useMemo(
    () =>
      useGroupedLayout
        ? items.filter((i) => i.section_id == null || !sectionIdSet.has(i.section_id))
        : [],
    [items, sectionIdSet, useGroupedLayout],
  );

  return (
    <section className="section">
      <h3>Ingredients</h3>
      <div className="recipe-ingredients-editor">
        {error ? (
          <p className="recipe-ingredients-message" role="status">
            {error}
          </p>
        ) : null}

        {!useGroupedLayout ? (
          <>
            <div className="table-container recipe-ingredients-table-wrap">
              <RecipeIngredientsTableDndFlat
                dndId={`recipe-${recipeId}-ingredients-flat`}
                items={items}
                onReorderFlat={reorderFlatLayout}
              >
                <table className="ingredients-table recipe-ingredients-table">
                  <IngredientsTableHeadRow />
                  <IngredientLinesSortable
                    recipeId={recipeId}
                    sortableListId={`recipe-${recipeId}-flat-all`}
                    items={items}
                    isPending={isPending}
                    busyKey={busyKey}
                    knownIngredients={knownIngredients}
                    setKnownIngredients={setKnownIngredients}
                    upsertLocalRow={upsertLocalRow}
                    runAction={runAction}
                    setError={setError}
                    onSaveAmount={saveAmount}
                    onChangeUnit={changeUnit}
                    onToggleOptional={toggleOptional}
                    onRemove={removeIngredient}
                    focusAmountLineId={focusAmountLineId}
                    onConsumeFocusAmount={consumeFocusAmount}
                    addIngredientInputId="recipe-ingredient-add-flat"
                  />
                  <tbody>
                    <IngredientAddTableRow
                      recipeId={recipeId}
                      sectionId={null}
                      label="Add ingredient"
                      knownIngredients={knownIngredients}
                      setKnownIngredients={setKnownIngredients}
                      upsertLocalRow={upsertLocalRow}
                      runAction={runAction}
                      isPending={isPending}
                      setError={setError}
                      onLineAdded={setFocusAmountLineId}
                    />
                  </tbody>
                </table>
              </RecipeIngredientsTableDndFlat>
            </div>
          </>
        ) : (
          <div className="recipe-ingredient-sections">
            {sortSectionsCopy(sections).map((sec) => {
              const blockItems = items.filter((i) => i.section_id === sec.id);
              return (
                <section key={sec.id} className="recipe-ingredient-section-block">
                  <ComponentSectionHeading
                    title={sec.title}
                    disabled={isPending}
                    onCommit={(t) => saveSectionTitle(sec.id, t)}
                    onDelete={() => removeSection(sec.id)}
                  />
                  <div className="table-container recipe-ingredients-table-wrap">
                    <RecipeIngredientsTableDndSection
                      dndId={`recipe-${recipeId}-section-${sec.id}`}
                      sectionId={sec.id}
                      segmentItems={blockItems}
                      onReorderSegment={reorderSegment}
                    >
                      <table className="ingredients-table recipe-ingredients-table">
                        <IngredientsTableHeadRow />
                        <IngredientLinesSortable
                          recipeId={recipeId}
                          sortableListId={`grouped-${sec.id}`}
                          items={blockItems}
                          isPending={isPending}
                          busyKey={busyKey}
                          knownIngredients={knownIngredients}
                          setKnownIngredients={setKnownIngredients}
                          upsertLocalRow={upsertLocalRow}
                          runAction={runAction}
                          setError={setError}
                          onSaveAmount={saveAmount}
                          onChangeUnit={changeUnit}
                          onToggleOptional={toggleOptional}
                          onRemove={removeIngredient}
                          focusAmountLineId={focusAmountLineId}
                          onConsumeFocusAmount={consumeFocusAmount}
                          addIngredientInputId={`recipe-ingredient-add-${sec.id}`}
                        />
                        <tbody>
                          <IngredientAddTableRow
                            recipeId={recipeId}
                            sectionId={sec.id}
                            label="Add ingredient"
                            knownIngredients={knownIngredients}
                            setKnownIngredients={setKnownIngredients}
                            upsertLocalRow={upsertLocalRow}
                            runAction={runAction}
                            isPending={isPending}
                            setError={setError}
                            onLineAdded={setFocusAmountLineId}
                          />
                        </tbody>
                      </table>
                    </RecipeIngredientsTableDndSection>
                  </div>
                </section>
              );
            })}

            {orphanItems.length ? (
              <section className="recipe-ingredient-section-block recipe-ingredient-section-orphan">
                <h4 className="recipe-ingredient-section-static-title">Other ingredients</h4>
                <p className="recipe-ingredients-orphan-hint">
                  These ingredients are not assigned to a component—you can still edit them here.
                </p>
                <div className="table-container recipe-ingredients-table-wrap">
                  <RecipeIngredientsTableDndSection
                    dndId={`recipe-${recipeId}-orphans`}
                    sectionId={null}
                    segmentItems={orphanItems}
                    onReorderSegment={reorderSegment}
                  >
                    <table className="ingredients-table recipe-ingredients-table">
                      <IngredientsTableHeadRow />
                      <IngredientLinesSortable
                        recipeId={recipeId}
                        sortableListId="orphan"
                        items={orphanItems}
                        isPending={isPending}
                        busyKey={busyKey}
                        knownIngredients={knownIngredients}
                        setKnownIngredients={setKnownIngredients}
                        upsertLocalRow={upsertLocalRow}
                        runAction={runAction}
                        setError={setError}
                        onSaveAmount={saveAmount}
                        onChangeUnit={changeUnit}
                        onToggleOptional={toggleOptional}
                        onRemove={removeIngredient}
                        focusAmountLineId={focusAmountLineId}
                        onConsumeFocusAmount={consumeFocusAmount}
                        addIngredientInputId={null}
                      />
                    </table>
                  </RecipeIngredientsTableDndSection>
                </div>
              </section>
            ) : null}
          </div>
        )}

        <div className="recipe-ingredients-add-component-wrap">
          <button
            type="button"
            className="recipe-ingredients-add-component"
            onClick={addComponent}
            disabled={isPending}
          >
            Add component
          </button>
        </div>
      </div>
    </section>
  );
}
