"use client";

import {
  addRecipeInstructionStepAction,
  deleteRecipeInstructionStepAction,
  reorderRecipeInstructionStepsAction,
  splitRecipeInstructionStepAction,
  updateRecipeInstructionStepAction,
} from "@/app/actions/recipes";
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
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, DotsSixVertical, DotsThree, Play, Stop, Timer } from "@phosphor-icons/react";
import type { RecipeInstructionStepRow } from "@/types/database";
import { splitInstructionIntro } from "@/lib/instruction-intro-split";
import {
  addOnTimerEvent,
  startTimer,
  stopTimer,
  formatRemaining,
} from "@/lib/step-timer-store";
import { useStepTimers } from "@/lib/use-step-timers";
import { useIsRecipeEditing } from "@/components/recipe-edit-mode";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";

type Props = {
  recipeId: number;
  recipeName: string;
  initialSteps: RecipeInstructionStepRow[];
};

const instructionRowCollisionDetection: CollisionDetection = (args) => {
  const pointerHit = pointerWithin(args);
  if (pointerHit.length > 0) return pointerHit;
  return closestCorners(args);
};

function sortSteps(rows: RecipeInstructionStepRow[]) {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order);
}

type TimerRange = { low: number; high: number };

/**
 * Parse user input like "30", "30-35", or "30 to 35" into seconds.
 * Returns null if the input is empty / invalid.
 */
function parseTimerInput(raw: string): TimerRange | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  const rangeMatch = trimmed.match(
    /^(\d+(?:\.\d+)?)\s*(?:-|–|—|\s+to\s+)\s*(\d+(?:\.\d+)?)$/i,
  );
  if (rangeMatch) {
    const a = Number(rangeMatch[1]);
    const b = Number(rangeMatch[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
    const low = Math.round(Math.min(a, b) * 60);
    const high = Math.round(Math.max(a, b) * 60);
    return { low, high };
  }

  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  const secs = Math.round(n * 60);
  return { low: secs, high: secs };
}

/** Convert stored low/high seconds back to the human-friendly input string. */
function timerToDisplayString(
  low: number | null | undefined,
  high: number | null | undefined,
): string {
  if (low == null && high == null) return "";
  const lo = low ?? 0;
  const hi = high ?? lo;
  if (lo <= 0 && hi <= 0) return "";
  const loMin = Math.round(lo / 60);
  const hiMin = Math.round(hi / 60);
  if (loMin === hiMin) return String(loMin);
  return `${loMin}-${hiMin}`;
}

function hasTimer(item: { timer_seconds_low?: number | null; timer_seconds_high?: number | null }): boolean {
  const lo = item.timer_seconds_low;
  const hi = item.timer_seconds_high;
  return (lo != null && lo > 0) || (hi != null && hi > 0);
}

/** The effective high-end seconds for countdown (or single value). */
function effectiveHigh(item: { timer_seconds_low?: number | null; timer_seconds_high?: number | null }): number {
  return item.timer_seconds_high ?? item.timer_seconds_low ?? 0;
}

function effectiveLow(item: { timer_seconds_low?: number | null; timer_seconds_high?: number | null }): number {
  return item.timer_seconds_low ?? item.timer_seconds_high ?? 0;
}

function RecipeInstructionsTableDnd({
  dndId,
  items,
  onReorder,
  children,
}: {
  dndId: string;
  items: RecipeInstructionStepRow[];
  onReorder: (nextItems: RecipeInstructionStepRow[]) => void;
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
        sort_order: i,
      }));
      onReorder(nextItems);
    },
    [items, onReorder],
  );

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={instructionRowCollisionDetection}
      onDragEnd={onDragEnd}
    >
      {children}
    </DndContext>
  );
}

function StepTimerDisplay({
  item,
  recipeName,
  disabled,
  onTimerChange,
}: {
  item: RecipeInstructionStepRow;
  recipeName: string;
  disabled: boolean;
  onTimerChange?: (stepId: number, low: number | null, high: number | null) => void;
}) {
  const isEditing = useIsRecipeEditing();
  const timers = useStepTimers();
  const running = timers.get(item.id);
  const itemHasTimer = hasTimer(item);

  const [editingTimer, setEditingTimer] = useState(false);
  const [editValue, setEditValue] = useState(() =>
    timerToDisplayString(item.timer_seconds_low, item.timer_seconds_high),
  );

  useEffect(() => {
    if (!editingTimer) {
      setEditValue(timerToDisplayString(item.timer_seconds_low, item.timer_seconds_high));
    }
  }, [editingTimer, item.timer_seconds_low, item.timer_seconds_high]);

  if (!itemHasTimer && !running) return null;

  const toggle = () => {
    if (running) {
      stopTimer(item.id);
    } else {
      const low = effectiveLow(item);
      const high = effectiveHigh(item);
      const snippet = item.body.length > 50 ? item.body.slice(0, 47) + "…" : item.body;
      startTimer(item.id, low, high, recipeName, snippet);
    }
  };

  const display = running
    ? formatRemaining(running.remainingSeconds)
    : timerToDisplayString(item.timer_seconds_low, item.timer_seconds_high);

  // In view mode, hide the idle duration number — only the countdown (while
  // running) should take up screen real estate next to each step.
  const showDurationText = running || isEditing;
  // In edit mode, the duration number becomes clickable to open an inline
  // editor (in addition to the existing "Edit timer" menu option).
  const canClickToEdit =
    isEditing && !running && !!onTimerChange && itemHasTimer;

  const commitInlineEdit = () => {
    if (!onTimerChange) {
      setEditingTimer(false);
      return;
    }
    const parsed = parseTimerInput(editValue);
    const newLow = parsed?.low ?? null;
    const newHigh = parsed?.high ?? null;
    const currentLow = item.timer_seconds_low ?? null;
    const currentHigh = item.timer_seconds_high ?? null;
    if (newLow !== currentLow || newHigh !== currentHigh) {
      onTimerChange(item.id, newLow, newHigh);
    }
    setEditingTimer(false);
  };

  const radius = 11;
  const circumference = 2 * Math.PI * radius;
  const progress = running
    ? running.remainingSeconds / running.totalSeconds
    : 1;
  const dashOffset = circumference * (1 - progress);

  return (
    <span className="step-timer-block">
      <span className="step-timer-duration-slot">
        {showDurationText ? (
          editingTimer ? (
            <input
              type="text"
              className="step-timer-display step-timer-inline-input"
              value={editValue}
              autoFocus
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitInlineEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitInlineEdit();
                }
                if (e.key === "Escape") {
                  setEditValue(
                    timerToDisplayString(item.timer_seconds_low, item.timer_seconds_high),
                  );
                  setEditingTimer(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              aria-label="Edit timer minutes or range"
            />
          ) : canClickToEdit ? (
            <button
              type="button"
              className="step-timer-display step-timer-display--clickable"
              onClick={(e) => {
                e.stopPropagation();
                setEditValue(
                  timerToDisplayString(item.timer_seconds_low, item.timer_seconds_high),
                );
                setEditingTimer(true);
              }}
              disabled={disabled}
              aria-label="Edit timer"
            >
              {display}
            </button>
          ) : (
            <span
              className={`step-timer-display${running ? " step-timer-display--active" : ""}`}
            >
              {display}
            </span>
          )
        ) : (
          <span
            className="step-timer-display step-timer-duration-placeholder"
            aria-hidden
          >
            {display}
          </span>
        )}
      </span>
      <span className="step-timer-ring-wrap">
        {running && (
          <svg
            className="step-timer-ring"
            viewBox="0 0 26 26"
            aria-hidden
          >
            <circle
              className="step-timer-ring__track"
              cx="13"
              cy="13"
              r={radius}
              fill="none"
            />
            <circle
              className="step-timer-ring__progress"
              cx="13"
              cy="13"
              r={radius}
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
            />
          </svg>
        )}
        <button
          type="button"
          className={`step-timer-play-btn${running ? " step-timer-play-btn--active" : ""}`}
          onClick={toggle}
          disabled={disabled}
          aria-label={running ? "Stop timer" : "Start timer"}
        >
          {running ? (
            <Stop size={12} weight="fill" aria-hidden />
          ) : (
            <Play size={12} weight="fill" aria-hidden />
          )}
        </button>
      </span>
    </span>
  );
}

function InstructionActionsMenu({
  item,
  displayIndex,
  disabled,
  onRemove,
  onTimerChange,
}: {
  item: RecipeInstructionStepRow;
  displayIndex: number;
  disabled: boolean;
  onRemove: (stepId: number) => void;
  onTimerChange: (stepId: number, low: number | null, high: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingTimer, setEditingTimer] = useState(false);
  const [editValue, setEditValue] = useState(() =>
    timerToDisplayString(item.timer_seconds_low, item.timer_seconds_high),
  );

  useEffect(() => {
    setEditValue(timerToDisplayString(item.timer_seconds_low, item.timer_seconds_high));
  }, [item.timer_seconds_low, item.timer_seconds_high]);

  const commitTimer = useCallback(() => {
    const parsed = parseTimerInput(editValue);
    const newLow = parsed?.low ?? null;
    const newHigh = parsed?.high ?? null;
    if (newLow !== (item.timer_seconds_low ?? null) || newHigh !== (item.timer_seconds_high ?? null)) {
      onTimerChange(item.id, newLow, newHigh);
    }
    setEditingTimer(false);
  }, [editValue, item.id, item.timer_seconds_low, item.timer_seconds_high, onTimerChange]);

  return (
    <DropdownMenu.Root
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setEditingTimer(false);
      }}
    >
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="instruction-actions-trigger"
          disabled={disabled}
          aria-label={`More options for step ${displayIndex}`}
        >
          <DotsThree className="instruction-actions-icon" size={16} weight="bold" aria-hidden />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="instruction-actions-panel"
          align="end"
          sideOffset={4}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {editingTimer ? (
            <div className="instruction-actions-timer-edit" onKeyDown={(e) => e.stopPropagation()}>
              <label className="instruction-actions-timer-label">
                Timer (min or range, e.g. 30-35)
                <input
                  type="text"
                  className="instruction-actions-timer-input"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitTimer();
                      setOpen(false);
                    }
                    if (e.key === "Escape") {
                      setEditValue(timerToDisplayString(item.timer_seconds_low, item.timer_seconds_high));
                      setEditingTimer(false);
                    }
                  }}
                  autoFocus
                  aria-label="Timer minutes or range"
                />
              </label>
              <button
                type="button"
                className="instruction-actions-timer-save"
                onClick={() => {
                  commitTimer();
                  setOpen(false);
                }}
              >
                Save
              </button>
            </div>
          ) : (
            <DropdownMenu.Item
              className="instruction-actions-menu-option"
              onSelect={(e) => {
                e.preventDefault();
                setEditingTimer(true);
              }}
            >
              <Timer size={14} aria-hidden />
              {hasTimer(item) ? "Edit timer" : "Add timer"}
            </DropdownMenu.Item>
          )}

          <DropdownMenu.Separator className="instruction-actions-separator" />

          <DropdownMenu.Item
            className="instruction-actions-menu-remove"
            disabled={disabled}
            onSelect={() => onRemove(item.id)}
          >
            Remove step
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function SortableInstructionRow({
  item,
  body,
  displayIndex,
  disabled,
  completed,
  recipeName,
  onBodyChange,
  onCommitBody,
  onRemove,
  onTimerChange,
  onToggleComplete,
  onSplitAtCursor,
  focusInstructionStepId,
  onInstructionStepFocused,
}: {
  item: RecipeInstructionStepRow;
  body: string;
  displayIndex: number;
  disabled: boolean;
  completed: boolean;
  recipeName: string;
  onBodyChange: (stepId: number, value: string) => void;
  onCommitBody: (stepId: number, body: string) => void;
  onRemove: (stepId: number) => void;
  onTimerChange: (stepId: number, low: number | null, high: number | null) => void;
  onToggleComplete: (stepId: number) => void;
  onSplitAtCursor: (stepId: number, splitAt: number) => void;
  focusInstructionStepId: number | null;
  onInstructionStepFocused: () => void;
}) {
  const isEditing = useIsRecipeEditing();
  const stepTimers = useStepTimers();
  const runningTimer = stepTimers.get(item.id);
  /** When unchecked, the timer column is shown for stored timers or an active countdown. */
  const timerColumnWhenIncomplete = hasTimer(item) || !!runningTimer;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(item.id),
    disabled: disabled || !isEditing,
  });

  const bodyInputRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (focusInstructionStepId !== item.id) return;
    const el = bodyInputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(0, 0);
    onInstructionStepFocused();
  }, [focusInstructionStepId, item.id, onInstructionStepFocused]);

  const introSplit = useMemo(() => splitInstructionIntro(body), [body]);
  const [bodyFocused, setBodyFocused] = useState(false);
  const showIntroMirror = Boolean(introSplit) && !bodyFocused && !disabled && !completed;

  const rowStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : undefined,
    zIndex: isDragging ? 2 : undefined,
    position: isDragging ? "relative" : undefined,
  };

  const handleRowClick = useCallback(
    (e: React.MouseEvent<HTMLTableRowElement>) => {
      // Only honour click-to-complete in view mode. In edit mode, click events
      // on the row shouldn't accidentally cross out a step while authoring.
      if (isEditing) return;
      const target = e.target as HTMLElement;
      if (
        target.closest(
          "textarea, button, input, [role=menu], [data-radix-collection-item], .instruction-actions-row",
        )
      )
        return;
      onToggleComplete(item.id);
    },
    [isEditing, item.id, onToggleComplete],
  );

  const staticBody = !isEditing && body.trim();

  return (
    <tr
      ref={setNodeRef}
      style={rowStyle}
      onClick={handleRowClick}
      className={[
        "recipe-instruction-row",
        isDragging ? "recipe-instruction-row--dragging" : "",
        completed ? "recipe-instruction-row--completed" : "",
        !isEditing ? "recipe-instruction-row--static" : "",
        timerColumnWhenIncomplete ? "recipe-instruction-row--has-timer-column" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <td
        className="recipe-instruction-index-cell"
        aria-label={`Step ${displayIndex}`}
        {...(isEditing ? attributes : {})}
        {...(isEditing ? listeners : {})}
      >
        <span className="recipe-instruction-index-line">
          <span className="recipe-instruction-index-number">{displayIndex}.</span>
          {isEditing ? (
            <DotsSixVertical
              className="recipe-instruction-index-grip"
              size={14}
              weight="bold"
              aria-hidden
            />
          ) : (
            <span
              className={`recipe-instruction-check${completed ? " recipe-instruction-check--checked" : ""}`}
              aria-hidden
            >
              {completed ? <Check size={10} weight="bold" aria-hidden /> : null}
            </span>
          )}
        </span>
      </td>
      <td className="recipe-instruction-body-cell">
        <div className="recipe-instruction-body-stack">
          {isEditing ? (
            <>
              {showIntroMirror && introSplit ? (
                <div className="recipe-pre recipe-instruction-body-mirror" aria-hidden>
                  <span className="recipe-instruction-intro">{introSplit.intro}</span>
                  <span>{introSplit.rest}</span>
                </div>
              ) : null}
              <textarea
                ref={bodyInputRef}
                className={[
                  "recipe-pre recipe-instruction-body-input",
                  showIntroMirror ? "recipe-instruction-body-input--intro-mirror" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                value={body}
                onChange={(e) => onBodyChange(item.id, e.target.value)}
                onFocus={() => setBodyFocused(true)}
                onBlur={(e) => {
                  setBodyFocused(false);
                  onCommitBody(item.id, e.target.value);
                }}
                onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    (e.target as HTMLTextAreaElement).blur();
                    return;
                  }
                  if (e.key !== "Enter" || e.shiftKey) return;
                  if (e.nativeEvent.isComposing) return;
                  const ta = e.currentTarget;
                  if (ta.selectionStart !== ta.selectionEnd) return;
                  const pos = ta.selectionStart;
                  if (pos === ta.value.length) return;
                  const tail = ta.value.slice(pos);
                  if (tail.trim() === "") return;
                  e.preventDefault();
                  onSplitAtCursor(item.id, pos);
                }}
                disabled={disabled}
                rows={1}
                aria-label={`Instruction step ${displayIndex}`}
              />
            </>
          ) : staticBody ? (
            introSplit ? (
              <div className="recipe-pre recipe-instruction-body-static">
                <span className="recipe-instruction-intro">{introSplit.intro}</span>
                <span>{introSplit.rest}</span>
              </div>
            ) : (
              <div className="recipe-pre recipe-instruction-body-static">{body}</div>
            )
          ) : (
            <div
              className="recipe-pre recipe-instruction-body-static recipe-instruction-body-static--empty"
              aria-hidden
            >
              —
            </div>
          )}
        </div>
      </td>
      <td className="instruction-actions-cell">
        {completed && isEditing ? null : !completed ? (
          <div className="instruction-actions-row">
            <StepTimerDisplay
              item={item}
              recipeName={recipeName}
              disabled={disabled}
              onTimerChange={onTimerChange}
            />
            {isEditing ? (
              <InstructionActionsMenu
                item={item}
                displayIndex={displayIndex}
                disabled={disabled}
                onRemove={onRemove}
                onTimerChange={onTimerChange}
              />
            ) : null}
          </div>
        ) : timerColumnWhenIncomplete ? (
          <div
            className="instruction-actions-row instruction-actions-row--completed-cloak"
            aria-hidden
          >
            <StepTimerDisplay
              item={item}
              recipeName={recipeName}
              disabled={disabled}
              onTimerChange={onTimerChange}
            />
          </div>
        ) : null}
      </td>
    </tr>
  );
}

function InstructionSortableRows({
  sortableListId,
  items,
  disabled,
  completedSteps,
  recipeName,
  onBodyChange,
  onCommitBody,
  onRemove,
  onTimerChange,
  onToggleComplete,
  onSplitAtCursor,
  focusInstructionStepId,
  onInstructionStepFocused,
}: {
  sortableListId: string;
  items: RecipeInstructionStepRow[];
  disabled: boolean;
  completedSteps: Set<number>;
  recipeName: string;
  onBodyChange: (stepId: number, value: string) => void;
  onCommitBody: (stepId: number, body: string) => void;
  onRemove: (stepId: number) => void;
  onTimerChange: (stepId: number, low: number | null, high: number | null) => void;
  onToggleComplete: (stepId: number) => void;
  onSplitAtCursor: (stepId: number, splitAt: number) => void;
  focusInstructionStepId: number | null;
  onInstructionStepFocused: () => void;
}) {
  const ids = useMemo(() => items.map((i) => String(i.id)), [items]);

  if (!items.length) {
    return null;
  }

  return (
    <SortableContext id={sortableListId} items={ids} strategy={verticalListSortingStrategy}>
      <tbody>
        {items.map((item, index) => (
          <SortableInstructionRow
            key={item.id}
            item={item}
            body={item.body}
            displayIndex={index + 1}
            disabled={disabled}
            completed={completedSteps.has(item.id)}
            recipeName={recipeName}
            onBodyChange={onBodyChange}
            onCommitBody={onCommitBody}
            onRemove={onRemove}
            onTimerChange={onTimerChange}
            onToggleComplete={onToggleComplete}
            onSplitAtCursor={onSplitAtCursor}
            focusInstructionStepId={focusInstructionStepId}
            onInstructionStepFocused={onInstructionStepFocused}
          />
        ))}
      </tbody>
    </SortableContext>
  );
}

export function RecipeInstructionsEditor({ recipeId, recipeName, initialSteps }: Props) {
  const router = useRouter();
  const dndId = useId();
  const isEditing = useIsRecipeEditing();
  const [items, setItems] = useState(() => sortSteps(initialSteps));
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(() => new Set());

  const toggleComplete = useCallback((stepId: number) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  }, []);

  useEffect(() => {
    return addOnTimerEvent((event) => {
      if (event.kind === "done") {
        setCompletedSteps((prev) => new Set(prev).add(event.entry.stepId));
      }
    });
  }, []);

  useEffect(() => {
    setItems(sortSteps(initialSteps));
  }, [initialSteps]);

  const runAction = useCallback((key: string, fn: () => Promise<void>) => {
    setError(null);
    setBusyKey(key);
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

  const upsertRow = useCallback((row: RecipeInstructionStepRow) => {
    setItems((cur) =>
      sortSteps(
        cur.some((s) => s.id === row.id) ? cur.map((s) => (s.id === row.id ? row : s)) : [...cur, row],
      ),
    );
  }, []);

  const reorderSteps = useCallback(
    (nextRows: RecipeInstructionStepRow[]) => {
      if (nextRows.length === 0) return;
      const orderedLineIds = nextRows.map((r) => r.id);
      const patched = nextRows.map((r, i) => ({ ...r, sort_order: i }));
      setItems(sortSteps(patched));
      runAction(`reorder-steps-${orderedLineIds[0]}`, async () => {
        const r = await reorderRecipeInstructionStepsAction(recipeId, orderedLineIds);
        if (!r.ok) {
          setError(r.error);
          router.refresh();
        }
      });
    },
    [recipeId, router, runAction],
  );

  const changeBody = useCallback((stepId: number, value: string) => {
    setItems((cur) => cur.map((s) => (s.id === stepId ? { ...s, body: value } : s)));
  }, []);

  const commitBody = useCallback(
    (stepId: number, body: string) => {
      runAction(`body-${stepId}`, async () => {
        const r = await updateRecipeInstructionStepAction(recipeId, stepId, { body });
        if (!r.ok) {
          setError(r.error);
          return;
        }
        upsertRow(r.row);
        router.refresh();
      });
    },
    [recipeId, router, runAction, upsertRow],
  );

  const [focusInstructionStepId, setFocusInstructionStepId] = useState<number | null>(null);
  const consumeInstructionFocus = useCallback(() => {
    setFocusInstructionStepId(null);
  }, []);

  const splitStepAt = useCallback(
    (stepId: number, splitAt: number) => {
      const step = items.find((s) => s.id === stepId);
      if (!step) return;
      const full = step.body;
      const before = full.slice(0, splitAt);
      const after = full.slice(splitAt);
      if (after.trim() === "") return;
      changeBody(stepId, before);
      runAction(`split-${stepId}`, async () => {
        const r = await splitRecipeInstructionStepAction(recipeId, stepId, splitAt);
        if (!r.ok) {
          setError(r.error);
          router.refresh();
          return;
        }
        upsertRow(r.firstRow);
        upsertRow(r.newRow);
        setFocusInstructionStepId(r.newRow.id);
        router.refresh();
      });
    },
    [items, changeBody, recipeId, router, runAction, upsertRow],
  );

  const commitTimer = useCallback(
    (stepId: number, low: number | null, high: number | null) => {
      setItems((cur) =>
        cur.map((s) =>
          s.id === stepId ? { ...s, timer_seconds_low: low, timer_seconds_high: high } : s,
        ),
      );
      runAction(`timer-${stepId}`, async () => {
        const r = await updateRecipeInstructionStepAction(recipeId, stepId, {
          timer_seconds_low: low,
          timer_seconds_high: high,
        });
        if (!r.ok) {
          setError(r.error);
          return;
        }
        upsertRow(r.row);
      });
    },
    [recipeId, runAction, upsertRow],
  );

  const removeStep = useCallback(
    (stepId: number) => {
      runAction(`del-${stepId}`, async () => {
        const r = await deleteRecipeInstructionStepAction(recipeId, stepId);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setItems((cur) => sortSteps(cur.filter((s) => s.id !== stepId)));
        router.refresh();
      });
    },
    [recipeId, router, runAction],
  );

  const [addDraft, setAddDraft] = useState("");

  const tryAddStep = useCallback(() => {
    const next = addDraft.trim();
    if (!next) return;
    runAction(`add-${Date.now()}`, async () => {
      const r = await addRecipeInstructionStepAction(recipeId, next);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      upsertRow(r.row);
      setAddDraft("");
      router.refresh();
    });
  }, [addDraft, recipeId, router, runAction, upsertRow]);

  const disabled = isPending || busyKey != null;

  return (
    <div className="recipe-instructions-editor">
      {error ? (
        <p className="recipe-ingredients-message" role="alert">
          {error}
        </p>
      ) : null}

      <div className="table-container recipe-ingredients-table-wrap">
        <RecipeInstructionsTableDnd
          dndId={`${dndId}-instructions`}
          items={items}
          onReorder={reorderSteps}
        >
          <table className="ingredients-table recipe-ingredients-table recipe-instructions-table">
            <InstructionSortableRows
              sortableListId={`recipe-${recipeId}-instruction-steps`}
              items={items}
              disabled={disabled}
              completedSteps={completedSteps}
              recipeName={recipeName}
              onBodyChange={changeBody}
              onCommitBody={commitBody}
              onRemove={removeStep}
              onTimerChange={commitTimer}
              onToggleComplete={toggleComplete}
              onSplitAtCursor={splitStepAt}
              focusInstructionStepId={focusInstructionStepId}
              onInstructionStepFocused={consumeInstructionFocus}
            />
            {isEditing ? (
              <tbody>
                <tr className="recipe-ingredients-add-row recipe-instruction-add-row">
                  <td
                    className="recipe-instruction-index-cell recipe-ingredients-add-placeholder-cell"
                    aria-hidden
                  />
                  <td className="recipe-instruction-body-cell recipe-instruction-add-cell">
                    <input
                      type="text"
                      className="recipe-instruction-add-input"
                      value={addDraft}
                      onChange={(e) => setAddDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          tryAddStep();
                        }
                      }}
                      onBlur={() => {
                        if (addDraft.trim()) tryAddStep();
                      }}
                      disabled={disabled}
                      placeholder="Add step…"
                      aria-label="Add instruction step"
                      id={`recipe-instruction-add-${recipeId}`}
                    />
                  </td>
                  <td className="instruction-actions-cell" />
                </tr>
              </tbody>
            ) : null}
          </table>
        </RecipeInstructionsTableDnd>
      </div>
    </div>
  );
}
