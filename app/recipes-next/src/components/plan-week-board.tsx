"use client";

import {
  addMealPlanEntryAction,
  deleteMealPlanEntryAction,
} from "@/app/actions/meal-plan";
import { SearchableSelect, type SelectOption } from "@/components/searchable-select";
import {
  classifyStoredMealEntry,
  planSlotOrder,
  type PlanSlotKey,
} from "@/lib/meal-plan";
import type { MealPlanEntryRow } from "@/types/database";
import { X } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

/** Match `weekDayStrings` / DB plan_date keys (local calendar day at noon → ISO date). */
function planDateKeyForLocalToday(): string {
  const t = new Date();
  const noon = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 12, 0, 0, 0);
  return noon.toISOString().slice(0, 10);
}

type DayColumn = {
  date: string;
  label: string;
};

type RecipeOption = {
  id: number;
  name: string;
};

type IngredientOption = {
  id: number;
  name: string;
};

type Props = {
  days: DayColumn[];
  entries: MealPlanEntryRow[];
  recipes: RecipeOption[];
  ingredients: IngredientOption[];
};

function parsePlanPick(raw: string):
  | { kind: "recipe"; id: number }
  | { kind: "ingredient"; id: number }
  | null {
  const m = raw.match(/^(r|i):(\d+)$/);
  if (!m) return null;
  const id = Number(m[2]);
  if (!Number.isFinite(id)) return null;
  return m[1] === "r" ? { kind: "recipe", id } : { kind: "ingredient", id };
}

type ComposerState = {
  planDate: string;
  slotKey: PlanSlotKey;
} | null;

type SlotBuckets = Record<PlanSlotKey, MealPlanEntryRow[]>;

function createEmptyBuckets(): SlotBuckets {
  return {
    breakfast: [],
    snack_am: [],
    lunch: [],
    snack_pm: [],
    dinner: [],
    dessert: [],
  };
}

function dayParts(dateStr: string) {
  const date = new Date(`${dateStr}T12:00:00`);
  return {
    weekday: date.toLocaleDateString(undefined, { weekday: "short" }),
    monthDay: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  };
}

export function PlanWeekBoard({ days, entries, recipes, ingredients }: Props) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const todayHeadRef = useRef<HTMLDivElement | null>(null);
  const planOpenCellRef = useRef<HTMLDivElement | null>(null);
  const [composer, setComposer] = useState<ComposerState>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const weekKey = days[0]?.date ?? "";
  const todayPlanDate = planDateKeyForLocalToday();
  const todayInWeek = days.some((d) => d.date === todayPlanDate);

  useLayoutEffect(() => {
    const applyScroll = () => {
      const scrollEl = scrollRef.current;
      if (!scrollEl) return;
      const headEl = todayHeadRef.current;
      const cornerEl = scrollEl.querySelector(".plan-board-corner");
      if (!todayInWeek || !headEl || !(cornerEl instanceof HTMLElement)) {
        scrollEl.scrollLeft = 0;
        return;
      }
      const desired = headEl.offsetLeft - cornerEl.offsetWidth;
      scrollEl.scrollLeft = Math.max(0, desired);
    };

    applyScroll();
    const id = requestAnimationFrame(applyScroll);
    return () => cancelAnimationFrame(id);
  }, [weekKey, todayPlanDate, todayInWeek]);

  const closeComposer = useCallback(() => {
    setComposer(null);
  }, []);

  useEffect(() => {
    if (!composer) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      closeComposer();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [composer, closeComposer]);

  useEffect(() => {
    if (!composer) return;
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (planOpenCellRef.current?.contains(t)) return;
      if (t instanceof Element && t.closest(".ss-popover-anchor")) return;
      closeComposer();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [composer, closeComposer]);

  const planPickerOptions: SelectOption[] = useMemo(() => {
    const recipeOpts: SelectOption[] = recipes.map((recipe) => ({
      value: `r:${recipe.id}`,
      label: recipe.name,
      tier: 0,
    }));
    const ingredientOpts: SelectOption[] = ingredients.map((ing) => ({
      value: `i:${ing.id}`,
      label: ing.name,
      tier: 1,
    }));
    return [...recipeOpts, ...ingredientOpts];
  }, [recipes, ingredients]);

  const grouped = useMemo(() => {
    const byDay = new Map<string, SlotBuckets>();
    for (const day of days) {
      byDay.set(day.date, createEmptyBuckets());
    }

    const sortedEntries = [...entries].sort((a, b) => {
      const dateCmp = String(a.plan_date).localeCompare(String(b.plan_date));
      if (dateCmp !== 0) return dateCmp;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });

    for (const entry of sortedEntries) {
      const dateKey = String(entry.plan_date).slice(0, 10);
      const buckets = byDay.get(dateKey);
      if (!buckets) continue;

      const slotName = String(entry.meal_slot ?? "").toLowerCase();
      const explicitBucket = classifyStoredMealEntry(entry.meal_slot, entry.sort_order);

      if (explicitBucket) {
        buckets[explicitBucket].push(entry);
        continue;
      }

      if (slotName === "snack") {
        const fallbackBucket: PlanSlotKey =
          buckets.snack_am.length === 0 ? "snack_am" : "snack_pm";
        buckets[fallbackBucket].push(entry);
        continue;
      }

      if (slotName === "other") {
        buckets.dessert.push(entry);
      }
    }

    return byDay;
  }, [days, entries]);

  const openComposer = (planDate: string, slotKey: PlanSlotKey) => {
    setComposer({ planDate, slotKey });
    setFeedback(null);
  };

  const commitPick = (value: string) => {
    if (!composer || !value) return;
    const parsed = parsePlanPick(value);
    if (!parsed) return;

    setFeedback(null);
    startTransition(async () => {
      const result = await addMealPlanEntryAction({
        planDate: composer.planDate,
        slotKey: composer.slotKey,
        ...(parsed.kind === "recipe"
          ? { recipeId: parsed.id }
          : { ingredientId: parsed.id }),
      });

      if (!result.ok) {
        setFeedback(result.error);
        return;
      }

      closeComposer();
      router.refresh();
    });
  };

  const removeEntry = (entryId: number) => {
    setFeedback(null);
    startTransition(async () => {
      const result = await deleteMealPlanEntryAction(entryId);
      if (!result.ok) {
        setFeedback(result.error);
        return;
      }

      router.refresh();
    });
  };

  const handleCellKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    planDate: string,
    slotKey: PlanSlotKey,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openComposer(planDate, slotKey);
  };

  return (
    <div className="plan-board-shell">
      {feedback ? (
        <p className="plan-board-feedback" role="status">
          {feedback}
        </p>
      ) : null}

      <div className="plan-board-scroll" ref={scrollRef}>
        <div className="plan-board-grid">
          <div className="plan-board-corner">Meals</div>

          {days.map((day) => {
            const parts = dayParts(day.date);
            const isToday = day.date === todayPlanDate;
            return (
              <div
                key={day.date}
                ref={isToday ? todayHeadRef : undefined}
                className="plan-board-dayhead"
              >
                <div className="plan-board-dayname">{parts.weekday}</div>
                <div className="plan-board-daydate">{parts.monthDay}</div>
              </div>
            );
          })}

          {planSlotOrder.flatMap((slot) => [
            <div key={`${slot.key}-label`} className="plan-board-rowlabel">
              {slot.label}
            </div>,
            ...days.map((day) => {
              const dayBuckets = grouped.get(day.date) ?? createEmptyBuckets();
              const cellEntries = dayBuckets[slot.key];
              const isOpen =
                composer?.planDate === day.date && composer?.slotKey === slot.key;

              return (
                <div
                  key={`${day.date}-${slot.key}`}
                  ref={
                    isOpen
                      ? (el) => {
                          planOpenCellRef.current = el;
                        }
                      : undefined
                  }
                  className={`plan-board-cell${isOpen ? " is-open" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${slot.label.toLowerCase()} for ${day.label}`}
                  onClick={() => openComposer(day.date, slot.key)}
                  onKeyDown={(event) => handleCellKeyDown(event, day.date, slot.key)}
                >
                  {cellEntries.length ? (
                    <div className="plan-board-stack">
                      {cellEntries.map((entry) => {
                        const titleText = entry.label || "Recipe";
                        return (
                        <article
                          key={entry.id}
                          className="plan-board-card"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {entry.recipe_id ? (
                            <Link
                              href={`/recipes/${entry.recipe_id}`}
                              className="plan-board-cardlink"
                              title={titleText}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <span className="plan-board-cardtitle">
                                {titleText}
                              </span>
                              {entry.notes ? (
                                <span className="plan-board-cardnotes">{entry.notes}</span>
                              ) : null}
                            </Link>
                          ) : (
                            <div className="plan-board-cardlink" title={titleText}>
                              <span className="plan-board-cardtitle">
                                {titleText}
                              </span>
                              {entry.notes ? (
                                <span className="plan-board-cardnotes">{entry.notes}</span>
                              ) : null}
                            </div>
                          )}

                          <button
                            type="button"
                            className="plan-board-remove"
                            aria-label={`Remove ${entry.label || "planned item"}`}
                            disabled={pending}
                            onClick={(event) => {
                              event.stopPropagation();
                              removeEntry(entry.id);
                            }}
                          >
                            <X size={16} weight="bold" aria-hidden />
                          </button>
                        </article>
                        );
                      })}
                    </div>
                  ) : null}

                  {isOpen ? (
                    <div
                      className="plan-board-composer"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {planPickerOptions.length ? (
                        <SearchableSelect
                          key={`${day.date}-${slot.key}-picker`}
                          defaultOpen
                          options={planPickerOptions}
                          value=""
                          onChange={commitPick}
                          disabled={pending}
                          className="plan-board-select"
                          aria-label="Search recipes and ingredients"
                          placeholder="Search recipes and ingredients"
                        />
                      ) : (
                        <p className="plan-board-composer-empty">
                          Add recipes on the Recipes page and ingredients in Inventory, then
                          come back here to plan your week.
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            }),
          ])}
        </div>
      </div>
    </div>
  );
}
