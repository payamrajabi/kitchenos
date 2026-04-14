"use client";

import {
  addDaysToDateString,
  formatRelativePlanDayLabel,
  getWeekStartMonday,
  planDateKeyLocalAnchor,
} from "@/lib/dates";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";

type Props = {
  weekStart: string;
  /** Below 768px: single-day plan — horizontal day strip + day carets. */
  dayMode?: boolean;
  /** Selected calendar day `YYYY-MM-DD` (day mode). */
  selectedDay?: string;
};

const STRIP_DAYS_PAST = 14;
const STRIP_DAYS_FUTURE = 28;

function hrefForPlanDay(day: string): string {
  const ws = getWeekStartMonday(new Date(`${day}T12:00:00`));
  const q = new URLSearchParams();
  q.set("w", ws);
  q.set("d", day);
  return `/plan?${q.toString()}`;
}

/** Whether the Today chip is fully outside the strip viewport, and which side. */
type TodayStripHint = "none" | "left" | "right";

const VIEW_EPS = 0.5;

function getTodayStripHint(strip: HTMLElement, anchorToday: string): TodayStripHint {
  const chip = strip.querySelector<HTMLElement>(
    `[data-plan-day="${anchorToday}"]`,
  );
  if (!chip) return "none";
  const bounds = strip.getBoundingClientRect();
  const r = chip.getBoundingClientRect();
  const intersects =
    r.right > bounds.left + VIEW_EPS && r.left < bounds.right - VIEW_EPS;
  if (intersects) return "none";
  if (r.right <= bounds.left + VIEW_EPS) return "left";
  if (r.left >= bounds.right - VIEW_EPS) return "right";
  return "none";
}

/** Scroll so the Today chip is at the **start** of the strip (same as the initial “starting state”). */
function scrollTodayChipToStripStart(strip: HTMLElement, anchorToday: string): void {
  const chip = strip.querySelector<HTMLElement>(
    `[data-plan-day="${anchorToday}"]`,
  );
  if (!chip) return;
  chip.scrollIntoView({
    inline: "start",
    block: "nearest",
    behavior: "smooth",
  });
}

export function PlanWeekNav({ weekStart, dayMode = false, selectedDay }: Props) {
  const thisWeekMonday = getWeekStartMonday();
  const prevMonday = addDaysToDateString(weekStart, -7);
  const nextMonday = addDaysToDateString(weekStart, 7);
  const viewingThisWeek = weekStart === thisWeekMonday;
  const jumpHref = viewingThisWeek
    ? `/plan?w=${addDaysToDateString(thisWeekMonday, 7)}`
    : `/plan?w=${thisWeekMonday}`;
  const jumpLabel = viewingThisWeek ? "NEXT WEEK" : "THIS WEEK";
  const jumpAria = viewingThisWeek
    ? "Go to next calendar week"
    : "Go to this calendar week";

  const anchorToday = planDateKeyLocalAnchor();
  const stripScrollRef = useRef<HTMLDivElement | null>(null);
  /** First strip sync after mount or week change uses instant scroll; tab changes use smooth. */
  const stripFirstSyncRef = useRef(true);
  const prevWeekStartRef = useRef(weekStart);
  const [todayStripHint, setTodayStripHint] = useState<TodayStripHint>("none");

  const stripDates: string[] = [];
  for (let i = -STRIP_DAYS_PAST; i <= STRIP_DAYS_FUTURE; i += 1) {
    stripDates.push(addDaysToDateString(anchorToday, i));
  }

  const scrollTarget = selectedDay ?? anchorToday;

  useLayoutEffect(() => {
    if (prevWeekStartRef.current !== weekStart) {
      prevWeekStartRef.current = weekStart;
      stripFirstSyncRef.current = true;
    }
  }, [weekStart]);

  useLayoutEffect(() => {
    if (!dayMode) return;
    const root = stripScrollRef.current;
    if (!root) return;
    const chip = root.querySelector<HTMLElement>(
      `[data-plan-day="${scrollTarget}"]`,
    );
    if (!chip) return;
    const behavior: ScrollBehavior = stripFirstSyncRef.current ? "auto" : "smooth";
    stripFirstSyncRef.current = false;
    if (scrollTarget === anchorToday) {
      chip.scrollIntoView({ inline: "start", block: "nearest", behavior });
    } else {
      chip.scrollIntoView({ inline: "center", block: "nearest", behavior });
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const strip = stripScrollRef.current;
        if (!strip) return;
        setTodayStripHint(getTodayStripHint(strip, anchorToday));
      });
    });
  }, [dayMode, scrollTarget, anchorToday]);

  useEffect(() => {
    if (!dayMode) return;
    const strip = stripScrollRef.current;
    if (!strip) return;

    const tick = () => {
      setTodayStripHint(getTodayStripHint(strip, anchorToday));
    };

    const onScrollEnd = () => {
      tick();
      const chip = strip.querySelector<HTMLElement>(
        `[data-plan-day="${scrollTarget}"]`,
      );
      if (!chip) return;
      chip.classList.add("plan-week-nav-day-chip--landed");
      window.setTimeout(() => {
        chip.classList.remove("plan-week-nav-day-chip--landed");
      }, 420);
    };

    const raf = requestAnimationFrame(tick);
    strip.addEventListener("scroll", tick, { passive: true });
    strip.addEventListener("scrollend", onScrollEnd as EventListener, {
      passive: true,
    });
    const ro = new ResizeObserver(tick);
    ro.observe(strip);
    return () => {
      cancelAnimationFrame(raf);
      strip.removeEventListener("scroll", tick);
      strip.removeEventListener("scrollend", onScrollEnd as EventListener);
      ro.disconnect();
    };
  }, [dayMode, anchorToday, scrollTarget]);

  if (dayMode) {
    const sel = selectedDay ?? anchorToday;
    const todayHref = hrefForPlanDay(anchorToday);

    const handleJumpToTodayClick = (e: MouseEvent<HTMLAnchorElement>) => {
      if (typeof window === "undefined") return;
      const here = `${window.location.pathname}${window.location.search}`;
      if (todayHref === here) {
        e.preventDefault();
        const strip = stripScrollRef.current;
        if (!strip) return;
        scrollTodayChipToStripStart(strip, anchorToday);
      }
    };

    return (
      <nav
        className="plan-week-nav plan-week-nav--day plan-week-nav--day-strip"
        aria-label="Day navigation"
      >
        <div className="plan-week-nav-day-strip-wrap">
          {todayStripHint === "left" ? (
            <Link
              href={todayHref}
              className="plan-week-nav-jump-today"
              aria-label="Jump to Today — list is scrolled toward future days"
              scroll={false}
              onClick={handleJumpToTodayClick}
            >
              <CaretLeft size={20} weight="bold" aria-hidden />
            </Link>
          ) : null}
          <div
            className="plan-week-nav-day-strip-scroll"
            ref={stripScrollRef}
            role="tablist"
            aria-label="Choose day"
          >
            {stripDates.map((d) => {
              const label = formatRelativePlanDayLabel(d, anchorToday);
              const isSelected = d === sel;
              return (
                <Link
                  key={d}
                  href={hrefForPlanDay(d)}
                  className={`plan-week-nav-day-chip${isSelected ? " is-active" : ""}`}
                  aria-selected={isSelected}
                  role="tab"
                  data-plan-day={d}
                  scroll={false}
                >
                  {label}
                </Link>
              );
            })}
          </div>
          {todayStripHint === "right" ? (
            <Link
              href={todayHref}
              className="plan-week-nav-jump-today"
              aria-label="Jump to Today — list is scrolled toward past days"
              scroll={false}
              onClick={handleJumpToTodayClick}
            >
              <CaretRight size={20} weight="bold" aria-hidden />
            </Link>
          ) : null}
        </div>
      </nav>
    );
  }

  return (
    <nav className="plan-week-nav" aria-label="Week navigation">
      <Link
        href={`/plan?w=${prevMonday}`}
        className="plan-week-nav-caret"
        aria-label="Previous week"
      >
        <CaretLeft size={22} weight="bold" aria-hidden />
      </Link>
      <Link href={jumpHref} className="plan-week-nav-this" aria-label={jumpAria}>
        {jumpLabel}
      </Link>
      <Link
        href={`/plan?w=${nextMonday}`}
        className="plan-week-nav-caret"
        aria-label="Next week"
      >
        <CaretRight size={22} weight="bold" aria-hidden />
      </Link>
    </nav>
  );
}
