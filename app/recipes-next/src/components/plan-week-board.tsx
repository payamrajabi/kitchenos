"use client";

import { addMealPlanEntryAction } from "@/app/actions/meal-plan";
import { PlanMealSlot } from "@/components/plan-meal-slot";
import {
  classifyStoredMealEntry,
  planSlotOrder,
  type PlanSlotKey,
} from "@/lib/meal-plan";
import { PLAN_SCROLL_TO_TODAY_EVENT } from "@/lib/plan-board-scroll";
import { coerceNumericId } from "@/lib/recipes";
import type { MealPlanEntryRow } from "@/types/database";
import { useRouter } from "next/navigation";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

export const PLAN_MEALS_COLUMN_PX = 72;
export const PLAN_DAY_COLUMN_PX = 244;

const SLOT_CUTOFF_HOUR: Record<PlanSlotKey, number> = {
  breakfast: 10,
  snack_am: 11.5,
  lunch: 14,
  snack_pm: 16,
  dinner: 20,
  dessert: 22,
};

function isSlotInPast(dateStr: string, slotKey: PlanSlotKey, todayStr: string): boolean {
  if (dateStr < todayStr) return true;
  if (dateStr > todayStr) return false;
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60;
  return h >= SLOT_CUTOFF_HOUR[slotKey];
}

type DayColumn = { date: string };

type RecipeOption = {
  id: number;
  name: string;
  meal_types?: string[] | null;
  image_url: string | null;
  image_urls?: unknown;
  image_focus_y: number | null;
};

type IngredientOption = {
  id: number;
  name: string;
};

type Props = {
  today: string;
  days: DayColumn[];
  entries: MealPlanEntryRow[];
  recipes: RecipeOption[];
  ingredients: IngredientOption[];
};

export type PlanWeekBoardHandle = {
  scrollToToday: (options?: { behavior?: ScrollBehavior }) => void;
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
    full: date.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    }),
  };
}

export const PlanWeekBoard = forwardRef<PlanWeekBoardHandle, Props>(
  function PlanWeekBoard({ today, days, entries, recipes, ingredients }, ref) {
    const router = useRouter();
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const planOpenCellRef = useRef<HTMLDivElement | null>(null);
    const [composer, setComposer] = useState<ComposerState>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const todayIndex = useMemo(
      () => days.findIndex((d) => d.date === today),
      [days, today],
    );

    const firstDayKey = days[0]?.date ?? "";

    const railCornerRef = useRef<HTMLDivElement | null>(null);
    const railSlotRefs = useRef<Partial<Record<PlanSlotKey, HTMLDivElement | null>>>(
      {},
    );

    const syncRailHeights = useCallback(() => {
      const sc = scrollRef.current;
      if (!sc) return;
      const firstHead = sc.querySelector<HTMLElement>(".plan-board-dayhead");
      const corner = railCornerRef.current;
      if (firstHead && corner) {
        corner.style.height = `${firstHead.getBoundingClientRect().height}px`;
      }
      for (const slot of planSlotOrder) {
        const sample = sc.querySelector<HTMLElement>(
          `[data-plan-row-sample="${slot.key}"]`,
        );
        const rail = railSlotRefs.current[slot.key];
        if (sample && rail) {
          rail.style.height = `${sample.getBoundingClientRect().height}px`;
        }
      }
    }, []);

    useLayoutEffect(() => {
      syncRailHeights();
      const sc = scrollRef.current;
      if (!sc) return;
      const grid = sc.querySelector(".plan-board-grid");
      const ro = new ResizeObserver(() => {
        syncRailHeights();
      });
      if (grid) ro.observe(grid);
      ro.observe(sc);
      const onResize = () => syncRailHeights();
      window.addEventListener("resize", onResize);
      return () => {
        ro.disconnect();
        window.removeEventListener("resize", onResize);
      };
    }, [syncRailHeights, days, entries, composer, pending]);

    const scrollToToday = useCallback(
      (options?: { behavior?: ScrollBehavior }) => {
        const el = scrollRef.current;
        if (!el || todayIndex < 0) return;
        const left = todayIndex * PLAN_DAY_COLUMN_PX;
        const behavior = options?.behavior ?? "auto";
        el.scrollTo({ left, behavior });
      },
      [todayIndex],
    );

    useImperativeHandle(ref, () => ({ scrollToToday }), [scrollToToday]);

    useLayoutEffect(() => {
      scrollToToday({ behavior: "auto" });
    }, [scrollToToday]);

    useEffect(() => {
      const onScrollToToday = () => {
        const reduced =
          typeof window.matchMedia === "function" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        scrollToToday({ behavior: reduced ? "auto" : "smooth" });
      };
      window.addEventListener(PLAN_SCROLL_TO_TODAY_EVENT, onScrollToToday);
      return () =>
        window.removeEventListener(PLAN_SCROLL_TO_TODAY_EVENT, onScrollToToday);
    }, [scrollToToday]);

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

    const recipeById = useMemo(() => {
      const m = new Map<number, RecipeOption>();
      for (const r of recipes) {
        const id = coerceNumericId(r.id);
        if (id != null) m.set(id, r);
      }
      return m;
    }, [recipes]);

    const recipeByNameLower = useMemo(() => {
      const m = new Map<string, RecipeOption>();
      for (const r of recipes) {
        const key = r.name.trim().toLowerCase();
        if (key) m.set(key, r);
        const stripped = key.replace(/\s*\(#\d+\)\s*$/i, "").trim();
        if (stripped && stripped !== key) m.set(stripped, r);
      }
      return m;
    }, [recipes]);

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
        const explicitBucket = classifyStoredMealEntry(
          entry.meal_slot,
          entry.sort_order,
        );

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

    const handleCellKeyDown = (
      event: ReactKeyboardEvent<HTMLDivElement>,
      planDate: string,
      slotKey: PlanSlotKey,
    ) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openComposer(planDate, slotKey);
    };

    if (days.length === 0) {
      return (
        <div className="plan-board-shell">
          {feedback ? (
            <p className="plan-board-feedback" role="status">
              {feedback}
            </p>
          ) : null}
        </div>
      );
    }

    const isSnack = (key: PlanSlotKey) => key === "snack_am" || key === "snack_pm";

    return (
      <div className="plan-board-shell">
        {feedback ? (
          <p className="plan-board-feedback" role="status">
            {feedback}
          </p>
        ) : null}

        <div className="plan-board-layout">
          <div className="plan-board-rail" aria-hidden={false}>
            <div ref={railCornerRef} className="plan-board-corner">
              <span className="visually-hidden">Meals</span>
            </div>
            {planSlotOrder.map((slot) => (
              <div
                key={slot.key}
                ref={(el) => {
                  railSlotRefs.current[slot.key] = el;
                }}
                className={`plan-board-rowlabel${isSnack(slot.key) ? " plan-board-rowlabel--snack" : ""}`}
                title={slot.label}
              >
                <span className="plan-board-rowlabel-name">{slot.label}</span>
              </div>
            ))}
          </div>

          <div className="plan-board-scroll" ref={scrollRef}>
            <div
              className="plan-board-grid plan-board-grid--sized-cols"
              style={{
                gridTemplateColumns: `repeat(${days.length}, ${PLAN_DAY_COLUMN_PX}px)`,
                width: "max(100%, max-content)",
              }}
            >
              {days.map((day) => {
                const parts = dayParts(day.date);
                return (
                  <div key={day.date} className="plan-board-dayhead">
                    <span className="plan-board-dayname">{parts.weekday}</span>
                    <span className="plan-board-daydate">{parts.monthDay}</span>
                  </div>
                );
              })}

              {planSlotOrder.flatMap((slot) =>
                days.map((day) => {
                  const dayBuckets =
                    grouped.get(day.date) ?? createEmptyBuckets();
                  const cellEntries = dayBuckets[slot.key];
                  const isOpen =
                    composer?.planDate === day.date &&
                    composer?.slotKey === slot.key;
                  const past = isSlotInPast(day.date, slot.key, today);
                  const parts = dayParts(day.date);

                  return (
                    <PlanMealSlot
                      key={`${day.date}-${slot.key}`}
                      day={{ date: day.date, label: parts.full }}
                      slotKey={slot.key}
                      slotLabel={slot.label}
                      cellEntries={cellEntries}
                      isOpen={isOpen}
                      isRowHeightSample={
                        Boolean(firstDayKey) && day.date === firstDayKey
                      }
                      recipeById={recipeById}
                      recipeByNameLower={recipeByNameLower}
                      recipes={recipes}
                      ingredients={ingredients}
                      pending={pending}
                      cellClassName={`${isSnack(slot.key) ? "plan-board-cell--snack" : "plan-board-cell--meal"}${past ? " plan-board-cell--past" : ""}`}
                      onAssignOpenRef={(el) => {
                        planOpenCellRef.current = el;
                      }}
                      onOpen={() => openComposer(day.date, slot.key)}
                      onKeyDown={(event) =>
                        handleCellKeyDown(event, day.date, slot.key)
                      }
                      commitPick={commitPick}
                    />
                  );
                }),
              )}
            </div>
          </div>
        </div>
      </div>
    );
  },
);
