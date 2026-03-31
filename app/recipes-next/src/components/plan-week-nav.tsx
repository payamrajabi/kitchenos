"use client";

import {
  addDaysToDateString,
  getWeekStartMonday,
} from "@/lib/dates";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import Link from "next/link";

type Props = {
  weekStart: string;
};

export function PlanWeekNav({ weekStart }: Props) {
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
