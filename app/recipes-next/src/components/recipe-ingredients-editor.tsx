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
  IngredientSearchControl,
  sortIngredientOptions,
  type IngredientOption,
  type IngredientSuggestion as Suggestion,
} from "@/components/ingredient-search-control";
import { useIsRecipeEditing } from "@/components/recipe-edit-mode";
import { useRecipeServingsScale } from "@/components/recipe-servings-scale";
import {
  IngredientUnitDisplayToggle,
  useIngredientUnitDisplay,
} from "@/components/recipe-ingredient-unit-display";
import {
  displayAmountForUnit,
  displayAmountInGrams,
} from "@/lib/ingredient-gram-conversion";
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
import { DotsSixVertical, DotsThree, Trash } from "@phosphor-icons/react";
import { pluralizeUnit, RECIPE_UNITS } from "@/lib/unit-mapping";
import type { RecipeIngredientRow, RecipeIngredientSectionRow } from "@/types/database";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type CSSProperties,
  type Dispatch,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type Ref,
  type ReactNode,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";

const emptySubscribe = () => () => {};

type Props = {
  recipeId: number;
  initialItems: RecipeIngredientRow[];
  initialSections: RecipeIngredientSectionRow[];
  ingredientOptions: IngredientOption[];
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

// Unicode vulgar-fraction glyphs we may render in an amount string
// (e.g. "1¼", "¾", "⅛"). We wrap each one in a span so CSS can bump it
// slightly larger than the surrounding digits while keeping row alignment.
const FRACTION_GLYPH_PATTERN = /[\u00BC-\u00BE\u2150-\u215E]/g;

function renderAmountWithFractions(text: string): ReactNode {
  if (!text) return text;
  if (!FRACTION_GLYPH_PATTERN.test(text)) return text;
  FRACTION_GLYPH_PATTERN.lastIndex = 0;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = FRACTION_GLYPH_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(
      <span key={`frac-${key++}`} className="recipe-ingredient-amount-fraction">
        {match[0]}
      </span>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

function IngredientRowActionsMenu({
  disabled,
  ingredientLabel,
  isOptional,
  onToggleOptional,
  onRemove,
}: {
  disabled: boolean;
  ingredientLabel: string;
  isOptional: boolean;
  onToggleOptional: (next: boolean) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: globalThis.MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const panelOpen = open && !disabled;

  const stopMenuMouseDown = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  return (
    <div ref={rootRef} className="recipe-ingredient-actions-menu">
      <button
        type="button"
        className="recipe-ingredient-actions-trigger"
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={panelOpen}
        aria-label={`More options for ${ingredientLabel}`}
        onClick={() => setOpen((v) => !v)}
      >
        <DotsThree className="recipe-ingredient-actions-icon" size={16} weight="bold" aria-hidden />
      </button>
      {panelOpen ? (
        <div
          className="recipe-ingredient-actions-panel"
          role="menu"
          aria-label={`Options for ${ingredientLabel}`}
          onMouseDown={stopMenuMouseDown}
        >
          <label className="recipe-ingredient-actions-menu-option" role="menuitemcheckbox" aria-checked={isOptional}>
            <input
              type="checkbox"
              className="recipe-ingredient-actions-menu-checkbox"
              checked={isOptional}
              disabled={disabled}
              onChange={(e) => onToggleOptional(e.target.checked)}
              aria-label={`Optional for ${ingredientLabel}`}
            />
            <span>Optional</span>
          </label>
          <button
            type="button"
            className="recipe-ingredient-actions-menu-remove"
            role="menuitem"
            disabled={disabled}
            onClick={() => {
              setOpen(false);
              onRemove();
            }}
          >
            Remove
          </button>
        </div>
      ) : null}
    </div>
  );
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
          density_g_per_ml:
            typeof row.ingredients.density_g_per_ml === "number" &&
            Number.isFinite(row.ingredients.density_g_per_ml) &&
            row.ingredients.density_g_per_ml > 0
              ? row.ingredients.density_g_per_ml
              : null,
          canonical_unit_weight_g:
            typeof row.ingredients.canonical_unit_weight_g === "number" &&
            Number.isFinite(row.ingredients.canonical_unit_weight_g) &&
            row.ingredients.canonical_unit_weight_g > 0
              ? row.ingredients.canonical_unit_weight_g
              : null,
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
  prepared,
  onTogglePrepared,
  rowRef,
  rowStyle,
  rowClassName,
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
  prepared: boolean;
  onTogglePrepared: () => void;
  rowRef?: Ref<HTMLTableRowElement>;
  rowStyle?: CSSProperties;
  rowClassName?: string;
  dragHandleSlot?: ReactNode;
}) {
  const isEditing = useIsRecipeEditing();
  const servingsScale = useRecipeServingsScale();
  const { mode: unitDisplayMode } = useIngredientUnitDisplay();
  const [amount, setAmount] = useState(item.amount ?? "");
  const authoredUnit = item.unit || DEFAULT_UNIT;
  // Only rescale in view mode — in edit mode the author is editing the stored
  // amount, so it must render exactly as persisted.
  const effectiveScale = isEditing ? 1 : servingsScale;
  // In view mode + Grams, try to convert. Edit mode always renders the
  // authored amount/unit so the SearchableSelect stays in sync with storage.
  const gramsDisplay =
    !isEditing && unitDisplayMode === "grams"
      ? displayAmountInGrams(
          item.amount,
          item.unit,
          item.ingredients?.density_g_per_ml,
          effectiveScale,
          item.ingredients?.canonical_unit_weight_g,
        )
      : null;
  const displayedAmountText =
    gramsDisplay != null
      ? gramsDisplay.amount
      : displayAmountForUnit(item.amount, item.unit, effectiveScale) || "—";
  // Pluralization (cup/cups, tsp/tsps) should follow the *displayed* number,
  // so scaling 1 cup → 1.5 cups picks up the plural form.
  const unitPluralAmount =
    gramsDisplay != null
      ? gramsDisplay.amount
      : displayAmountForUnit(item.amount, item.unit, effectiveScale);
  // When we converted to grams, the unit label follows the conversion (g/kg).
  // Otherwise use the authored unit.
  const displayedUnit = gramsDisplay != null ? gramsDisplay.unit : authoredUnit;
  const [editingAmount, setEditingAmount] = useState(false);
  const [naming, setNaming] = useState(false);
  const amountInputRef = useRef<HTMLInputElement>(null);

  // Reset the controlled amount when the underlying item changes (e.g. after
  // ingredient swap). Intentional sync of local form state with prop.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAmount(item.amount ?? "");
  }, [item.amount]);

  useEffect(() => {
    if (focusAmountLineId !== item.id) return;
    const frame = requestAnimationFrame(() => {
      setEditingAmount(true);
      onConsumeFocusAmount();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusAmountLineId, item.id, onConsumeFocusAmount]);

  useEffect(() => {
    if (editingAmount && amountInputRef.current) {
      amountInputRef.current.focus();
      amountInputRef.current.select();
    }
  }, [editingAmount]);

  const commitAmount = useCallback(() => {
    const next = amount.trim();
    const prev = (item.amount ?? "").trim();
    setEditingAmount(false);
    if (next === prev) return;
    onSaveAmount(item.id, next);
  }, [amount, item.amount, item.id, onSaveAmount]);

  const displayName = item.ingredients?.name ?? "Untitled";

  const handleRowClick = useCallback(
    (e: ReactMouseEvent<HTMLTableRowElement>) => {
      // Only honour tap-to-toggle in view mode. In edit mode, row clicks
      // shouldn't accidentally mark ingredients prepared while authoring.
      if (isEditing) return;
      const target = e.target as HTMLElement;
      if (target.closest("button, input, textarea, select, a, [role=menu], [data-radix-collection-item]")) {
        return;
      }
      onTogglePrepared();
    },
    [isEditing, onTogglePrepared],
  );

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
    <tr
      ref={rowRef}
      style={rowStyle}
      onClick={handleRowClick}
      className={["recipe-ingredient-row", prepared ? "recipe-ingredient-row--prepared" : "", rowClassName, !isEditing ? "recipe-ingredient-row--tap-toggle" : ""].filter(Boolean).join(" ")}
    >
      <td className="recipe-ingredient-lead-cell">
        {isEditing && dragHandleSlot != null ? (
          dragHandleSlot
        ) : (
          <input
            type="checkbox"
            className="recipe-ingredient-prep-checkbox"
            checked={prepared}
            onChange={onTogglePrepared}
            aria-label={`Mark ${item.ingredients?.name ?? "ingredient"} as prepared`}
          />
        )}
      </td>
      <td className="recipe-ingredient-name-cell">
        {isEditing && naming ? (
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
        ) : isEditing ? (
          <button
            type="button"
            className="recipe-ingredient-name-button"
            disabled={namePickerDisabled}
            onClick={() => setNaming(true)}
          >
            <span className="recipe-ingredient-name">
              {displayName}
              {item.preparation ? (
                <span className="recipe-ingredient-preparation">
                  , {item.preparation}
                </span>
              ) : null}
              {item.is_optional ? (
                <span className="recipe-ingredient-optional-flag"> (optional)</span>
              ) : null}
            </span>
          </button>
        ) : (
          <span className="recipe-ingredient-name recipe-ingredient-name--static">
            {displayName}
            {item.preparation ? (
              <span className="recipe-ingredient-preparation">
                , {item.preparation}
              </span>
            ) : null}
            {item.is_optional ? (
              <span className="recipe-ingredient-optional-flag"> (optional)</span>
            ) : null}
          </span>
        )}
      </td>
      <td className="recipe-ingredient-value-cell">
        <span className="recipe-ingredient-value-inner">
          {isEditing && editingAmount ? (
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
                if (e.key === "Escape") {
                  e.preventDefault();
                  setAmount(item.amount ?? "");
                  setEditingAmount(false);
                }
              }}
              disabled={disabled}
              placeholder="—"
              aria-label={`Amount for ${item.ingredients?.name ?? "ingredient"}`}
            />
          ) : isEditing ? (
            <button
              type="button"
              className="recipe-ingredient-amount-display"
              disabled={disabled}
              onClick={() => setEditingAmount(true)}
              aria-label={`Edit amount for ${item.ingredients?.name ?? "ingredient"}`}
            >
              {renderAmountWithFractions(displayedAmountText)}
            </button>
          ) : (
            <span className="recipe-ingredient-amount-display recipe-ingredient-amount-display--static">
              {renderAmountWithFractions(displayedAmountText)}
            </span>
          )}
          {isEditing ? (
            <SearchableSelect
              className="inventory-unit-select recipe-ingredient-unit-select"
              bareInline
              options={UNIT_OPTIONS}
              value={item.unit || DEFAULT_UNIT}
              onChange={(unit) => onChangeUnit(item.id, unit || DEFAULT_UNIT)}
              disabled={disabled}
              aria-label={`Unit for ${item.ingredients?.name ?? "ingredient"}`}
              placeholder={DEFAULT_UNIT}
              triggerLabel={pluralizeUnit(item.unit || DEFAULT_UNIT, amount)}
            />
          ) : (
            <span className="recipe-ingredient-unit-text">
              {pluralizeUnit(displayedUnit, unitPluralAmount)}
            </span>
          )}
        </span>
      </td>
      <td className="recipe-ingredient-actions-cell">
        {isEditing ? (
          <IngredientRowActionsMenu
            disabled={disabled}
            ingredientLabel={item.ingredients?.name ?? "ingredient"}
            isOptional={item.is_optional}
            onToggleOptional={(v) => onToggleOptional(item.id, v)}
            onRemove={() => onRemove(item.id)}
          />
        ) : null}
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
  prepared,
  onTogglePrepared,
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
  prepared: boolean;
  onTogglePrepared: () => void;
  dragDisabled: boolean;
}) {
  const isEditing = useIsRecipeEditing();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(item.id),
    disabled: dragDisabled || !isEditing,
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
      prepared={prepared}
      onTogglePrepared={onTogglePrepared}
      rowRef={setNodeRef}
      rowStyle={rowStyle}
      rowClassName={isDragging ? "recipe-ingredient-row--dragging" : undefined}
      dragHandleSlot={
        isEditing ? (
          <button
            type="button"
            className="recipe-ingredient-drag-handle"
            {...attributes}
            {...listeners}
            disabled={dragDisabled}
            aria-label={`Reorder ${item.ingredients?.name ?? "ingredient"}`}
          >
            <DotsSixVertical className="recipe-ingredient-drag-icon" size={16} weight="bold" aria-hidden />
          </button>
        ) : null
      }
    />
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
  preparedIds,
  onTogglePrepared,
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
  preparedIds: Set<number>;
  onTogglePrepared: (lineId: number) => void;
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
              prepared={preparedIds.has(item.id)}
              onTogglePrepared={() => onTogglePrepared(item.id)}
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
  const isEditing = useIsRecipeEditing();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  useEffect(() => {
    setDraft(title);
  }, [title]);

  if (!isEditing) {
    return (
      <div className="recipe-ingredient-section-heading recipe-ingredient-section-heading--static">
        <h4 className="recipe-ingredient-section-static-title">
          {title.trim() || "Untitled component"}
        </h4>
      </div>
    );
  }

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
              setEditing(false);
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
            setEditing(false);
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
  const isEditing = useIsRecipeEditing();
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

  if (!isEditing) return null;

  return (
    <tr className="recipe-ingredients-add-row">
      <td
        className="recipe-ingredient-lead-cell recipe-ingredients-add-placeholder-cell"
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
      <td className="recipe-ingredient-value-cell recipe-ingredients-add-placeholder-cell" aria-hidden="true">
        —
      </td>
      <td className="recipe-ingredient-actions-cell recipe-ingredients-add-placeholder-cell" aria-hidden="true">
        —
      </td>
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
  const isEditing = useIsRecipeEditing();
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
  const [preparedIds, setPreparedIds] = useState(() => new Set<number>());
  const [sectionDeleteConfirm, setSectionDeleteConfirm] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const sectionDeleteTitleId = useId();
  const sectionDeleteCancelRef = useRef<HTMLButtonElement>(null);
  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false);

  const togglePrepared = useCallback((lineId: number) => {
    setPreparedIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }, []);

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

  const closeSectionDeleteModal = useCallback(() => {
    setSectionDeleteConfirm(null);
  }, []);

  const confirmDeleteSection = useCallback(() => {
    const target = sectionDeleteConfirm;
    if (!target) return;
    setSectionDeleteConfirm(null);
    removeSection(target.id);
  }, [sectionDeleteConfirm, removeSection]);

  useEffect(() => {
    if (!sectionDeleteConfirm) return;
    const id = requestAnimationFrame(() => sectionDeleteCancelRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [sectionDeleteConfirm]);

  useEffect(() => {
    if (!sectionDeleteConfirm) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") closeSectionDeleteModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sectionDeleteConfirm, closeSectionDeleteModal]);

  const sectionDeleteModal =
    isClient && sectionDeleteConfirm ? (
      <div className="modal open" aria-hidden="false" role="presentation">
        <button
          type="button"
          className="modal-backdrop"
          aria-label="Close delete confirmation"
          onClick={closeSectionDeleteModal}
        />
        <div
          className="modal-card modal-delete-recipe"
          role="dialog"
          aria-modal="true"
          aria-labelledby={sectionDeleteTitleId}
        >
          <button
            type="button"
            className="modal-close icon-ghost"
            aria-label="Close"
            onClick={closeSectionDeleteModal}
          >
            <i className="ph ph-x" aria-hidden="true" />
          </button>
          <div className="delete-ingredient-modal-body">
            <h2 id={sectionDeleteTitleId} className="delete-ingredient-modal-title">
              Delete component
            </h2>
            <p className="delete-ingredient-modal-warning">
              Delete <strong>{sectionDeleteConfirm.title}</strong>? Ingredients in this component stay on the recipe; they
              are only ungrouped from this heading.
            </p>
            <div className="delete-ingredient-modal-actions">
              <button
                ref={sectionDeleteCancelRef}
                type="button"
                className="delete-ingredient-modal-cancel"
                onClick={closeSectionDeleteModal}
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="delete-ingredient-modal-confirm"
                onClick={confirmDeleteSection}
                disabled={isPending}
              >
                Delete component
              </button>
            </div>
          </div>
        </div>
      </div>
    ) : null;

  const sectionIdSet = useMemo(() => new Set(sections.map((s) => s.id)), [sections]);
  const orphanItems = useMemo(
    () =>
      useGroupedLayout
        ? items.filter((i) => i.section_id == null || !sectionIdSet.has(i.section_id))
        : [],
    [items, sectionIdSet, useGroupedLayout],
  );

  return (
    <>
    <section className="section">
      <div className="recipe-ingredients-heading-row">
        <h3 className="recipe-ingredients-heading">Ingredients</h3>
        {!isEditing && items.length > 0 ? (
          <IngredientUnitDisplayToggle className="recipe-ingredients-heading-toggle" />
        ) : null}
      </div>
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
                  <caption className="visually-hidden">
                    Ingredients: reorder, name, amount, unit, row menu.
                  </caption>
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
                    preparedIds={preparedIds}
                    onTogglePrepared={togglePrepared}
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
                    title={sec.heading}
                    disabled={isPending}
                    onCommit={(t) => saveSectionTitle(sec.id, t)}
                    onDelete={() =>
                      setSectionDeleteConfirm({
                        id: sec.id,
                        title: sec.heading.trim() || "Untitled component",
                      })
                    }
                  />
                  <div className="table-container recipe-ingredients-table-wrap">
                    <RecipeIngredientsTableDndSection
                      dndId={`recipe-${recipeId}-section-${sec.id}`}
                      sectionId={sec.id}
                      segmentItems={blockItems}
                      onReorderSegment={reorderSegment}
                    >
                      <table className="ingredients-table recipe-ingredients-table">
                        <caption className="visually-hidden">
                          Ingredients: reorder, name, amount, unit, row menu.
                        </caption>
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
                          preparedIds={preparedIds}
                          onTogglePrepared={togglePrepared}
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
                {isEditing ? (
                  <p className="recipe-ingredients-orphan-hint">
                    These ingredients are not assigned to a component—you can still edit them here.
                  </p>
                ) : null}
                <div className="table-container recipe-ingredients-table-wrap">
                  <RecipeIngredientsTableDndSection
                    dndId={`recipe-${recipeId}-orphans`}
                    sectionId={null}
                    segmentItems={orphanItems}
                    onReorderSegment={reorderSegment}
                  >
                    <table className="ingredients-table recipe-ingredients-table">
                      <caption className="visually-hidden">
                        Ingredients: reorder, name, amount, unit, row menu.
                      </caption>
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
                        preparedIds={preparedIds}
                        onTogglePrepared={togglePrepared}
                      />
                    </table>
                  </RecipeIngredientsTableDndSection>
                </div>
              </section>
            ) : null}
          </div>
        )}

        {isEditing ? (
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
        ) : null}
      </div>
    </section>
    {sectionDeleteModal ? createPortal(sectionDeleteModal, document.body) : null}
    </>
  );
}
