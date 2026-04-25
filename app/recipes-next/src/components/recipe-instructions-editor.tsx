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
import { Menu } from "@base-ui/react/menu";
import { CheckCircle, Circle, DotsSixVertical, DotsThree, Play, Stop, Timer } from "@phosphor-icons/react";
import type { RecipeInstructionStepRow } from "@/types/database";
import {
  addOnTimerEvent,
  startTimer,
  stopTimer,
  formatRemaining,
} from "@/lib/step-timer-store";
import { useStepTimers } from "@/lib/use-step-timers";
import { useIsRecipeEditing } from "@/components/recipe-edit-mode";
import { useTopLayerHost } from "@/lib/top-layer-host";
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
  return [...rows].sort((a, b) => a.step_number - b.step_number);
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
        step_number: i + 1,
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

  // Sync the timer edit field with the underlying step when the user is not
  // mid-edit. Intentional sync of local form state with prop.
  useEffect(() => {
    if (!editingTimer) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
      const snippet = item.text.length > 50 ? item.text.slice(0, 47) + "…" : item.text;
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
      {showDurationText ? (
        <span className="step-timer-duration-slot">
          {editingTimer ? (
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
          )}
        </span>
      ) : null}
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
  // Portal the dropdown into the active top-layer host (the recipe detail
  // <dialog> when this editor is shown inside the intercepted-route modal)
  // so the menu stacks above the dialog. See `lib/top-layer-host.ts`.
  const topLayerHost = useTopLayerHost();

  // Sync the timer edit field when the underlying step's timer changes.
  // Intentional sync of local form state with prop.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    <Menu.Root
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setEditingTimer(false);
      }}
    >
      <Menu.Trigger
        render={
          <button
            type="button"
            className="instruction-actions-trigger"
            disabled={disabled}
            aria-label={`More options for step ${displayIndex}`}
          >
            <DotsThree className="instruction-actions-icon" size={16} weight="bold" aria-hidden />
          </button>
        }
      />

      <Menu.Portal container={topLayerHost ?? undefined}>
        <Menu.Positioner align="end" sideOffset={4}>
          <Menu.Popup
            className="instruction-actions-panel"
            finalFocus={false}
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
              <Menu.Item
                className="instruction-actions-menu-option"
                closeOnClick={false}
                onClick={() => setEditingTimer(true)}
              >
                <Timer size={14} aria-hidden />
                {hasTimer(item) ? "Edit timer" : "Add timer"}
              </Menu.Item>
            )}

            <Menu.Separator className="instruction-actions-separator" />

            <Menu.Item
              className="instruction-actions-menu-remove"
              disabled={disabled}
              onClick={() => onRemove(item.id)}
            >
              Remove step
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function SortableInstructionRow({
  item,
  heading,
  body,
  displayIndex,
  disabled,
  completed,
  recipeName,
  onHeadingChange,
  onCommitHeading,
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
  heading: string;
  body: string;
  displayIndex: number;
  disabled: boolean;
  completed: boolean;
  recipeName: string;
  onHeadingChange: (stepId: number, value: string) => void;
  onCommitHeading: (stepId: number, value: string) => void;
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

  const rowStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : undefined,
    zIndex: isDragging ? 2 : undefined,
    position: isDragging ? "relative" : undefined,
  };

  const handleRowClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only honour click-to-complete in view mode. In edit mode, click events
      // on the row shouldn't accidentally cross out a step while authoring.
      if (isEditing) return;
      const target = e.target as HTMLElement;
      if (
        target.closest(
          "textarea, button, input, [role=menu], [role=menuitem]",
        )
      )
        return;
      onToggleComplete(item.id);
    },
    [isEditing, item.id, onToggleComplete],
  );

  const trimmedHeading = heading.trim();
  const hasHeading = trimmedHeading.length > 0;
  const staticBody = !isEditing && body.trim();
  // When checked off, hide the full instruction text but keep the heading
  // visible so a cook can still see what they just did.
  const showBodyBlock = !completed;

  // When there's nothing to render in the actions column (no timer, no menu,
  // not editing), let the body cell span both columns so the text can flow
  // into the space that would otherwise be reserved by the actions column.
  const showActionsCell = !completed && (isEditing || timerColumnWhenIncomplete);

  return (
    <div
      ref={setNodeRef}
      style={rowStyle}
      onClick={handleRowClick}
      className={[
        "recipe-instruction-row",
        isDragging ? "recipe-instruction-row--dragging" : "",
        completed ? "recipe-instruction-row--completed" : "",
        !isEditing ? "recipe-instruction-row--static" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className="recipe-instruction-lead-cell"
        aria-label={`Step ${displayIndex}`}
        {...(isEditing ? attributes : {})}
        {...(isEditing ? listeners : {})}
      >
        {isEditing ? (
          <DotsSixVertical
            className="recipe-instruction-drag-icon"
            size={20}
            weight="bold"
            aria-hidden
          />
        ) : (
          <span className="recipe-instruction-lead-icon" aria-hidden>
            {completed ? (
              <CheckCircle
                className="recipe-instruction-prep-icon recipe-instruction-prep-icon--done"
                size={20}
                weight="fill"
              />
            ) : (
              <Circle className="recipe-instruction-prep-icon" size={20} weight="regular" />
            )}
          </span>
        )}
      </div>
      <div
        className={[
          "recipe-instruction-body-cell",
          !showActionsCell ? "recipe-instruction-body-cell--span-actions" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="recipe-instruction-body-stack">
          {isEditing ? (
            <>
              <input
                type="text"
                className="recipe-instruction-heading-input"
                value={heading}
                onChange={(e) => onHeadingChange(item.id, e.target.value)}
                onBlur={(e) => onCommitHeading(item.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                disabled={disabled}
                placeholder="Step heading"
                aria-label={`Step ${displayIndex} heading`}
                maxLength={60}
              />
              <textarea
                ref={bodyInputRef}
                className="recipe-pre recipe-instruction-body-input"
                value={body}
                onChange={(e) => onBodyChange(item.id, e.target.value)}
                onBlur={(e) => onCommitBody(item.id, e.target.value)}
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
          ) : (
            <>
              {hasHeading ? (
                <div className="recipe-instruction-heading">{trimmedHeading}</div>
              ) : null}
              {showBodyBlock ? (
                staticBody ? (
                  <div className="recipe-pre recipe-instruction-body-static">{body}</div>
                ) : !hasHeading ? (
                  <div
                    className="recipe-pre recipe-instruction-body-static recipe-instruction-body-static--empty"
                    aria-hidden
                  >
                    —
                  </div>
                ) : null
              ) : null}
            </>
          )}
        </div>
      </div>
      {showActionsCell ? (
        <div className="instruction-actions-cell">
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
        </div>
      ) : null}
    </div>
  );
}

function InstructionSortableRows({
  sortableListId,
  items,
  disabled,
  completedSteps,
  recipeName,
  onHeadingChange,
  onCommitHeading,
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
  onHeadingChange: (stepId: number, value: string) => void;
  onCommitHeading: (stepId: number, value: string) => void;
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
      <div className="recipe-instructions-line-list">
        {items.map((item, index) => (
          <SortableInstructionRow
            key={item.id}
            item={item}
            heading={item.heading ?? ""}
            body={item.text}
            displayIndex={index + 1}
            disabled={disabled}
            completed={completedSteps.has(item.id)}
            recipeName={recipeName}
            onHeadingChange={onHeadingChange}
            onCommitHeading={onCommitHeading}
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
      </div>
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
      const patched = nextRows.map((r, i) => ({ ...r, step_number: i + 1 }));
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
    setItems((cur) => cur.map((s) => (s.id === stepId ? { ...s, text: value } : s)));
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

  const changeHeading = useCallback((stepId: number, value: string) => {
    setItems((cur) => cur.map((s) => (s.id === stepId ? { ...s, heading: value } : s)));
  }, []);

  const commitHeading = useCallback(
    (stepId: number, raw: string) => {
      const trimmed = raw.trim();
      const next = trimmed.length > 0 ? trimmed.slice(0, 60) : null;
      runAction(`heading-${stepId}`, async () => {
        const r = await updateRecipeInstructionStepAction(recipeId, stepId, {
          heading: next,
        });
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
      const full = step.text;
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
          <div
            className="ingredients-table recipe-ingredients-table recipe-instructions-table recipe-instructions-line-stack"
            aria-label="Instructions: reorder, heading, body, timer, row menu."
          >
            <InstructionSortableRows
              sortableListId={`recipe-${recipeId}-instruction-steps`}
              items={items}
              disabled={disabled}
              completedSteps={completedSteps}
              recipeName={recipeName}
              onHeadingChange={changeHeading}
              onCommitHeading={commitHeading}
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
              <div className="recipe-ingredients-add-row recipe-instruction-add-row recipe-instruction-row">
                <div
                  className="recipe-instruction-lead-cell recipe-ingredients-add-placeholder-cell"
                  aria-hidden
                />
                <div className="recipe-instruction-body-cell recipe-instruction-add-cell recipe-instruction-body-cell--span-actions">
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
                </div>
              </div>
            ) : null}
          </div>
        </RecipeInstructionsTableDnd>
      </div>
    </div>
  );
}
