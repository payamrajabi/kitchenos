export function getWeekStartMonday(d = new Date()): string {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

export function weekDayStrings(weekStart: string): string[] {
  const days: string[] = [];
  const start = new Date(`${weekStart}T12:00:00`);
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

export function formatPlanDayLabel(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Local calendar day at noon → `YYYY-MM-DD` (matches meal plan date keys). */
export function planDateKeyLocalAnchor(d = new Date()): string {
  const noon = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
  return noon.toISOString().slice(0, 10);
}

/**
 * Human-friendly label vs an anchor day (usually "today"): Today, Tomorrow,
 * Yesterday, weekday name — no month/day.
 */
export function formatRelativePlanDayLabel(
  dateStr: string,
  anchorToday: string,
): string {
  const a = new Date(`${anchorToday}T12:00:00`);
  const t = new Date(`${dateStr}T12:00:00`);
  const diffDays = Math.round(
    (t.getTime() - a.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  return t.toLocaleDateString(undefined, { weekday: "long" });
}

export function weekContainsDate(weekStart: string, dateStr: string): boolean {
  return weekDayStrings(weekStart).includes(dateStr);
}

/** Monday of the week after the one that contains `d`. */
export function getFollowingWeekStartMonday(d = new Date()): string {
  return addDaysToDateString(getWeekStartMonday(d), 7);
}

/**
 * Plan URL `?w=YYYY-MM-DD`: any day in the target week (normalized to Monday).
 * Missing or invalid → Monday of the **current** calendar week (the week that contains “today”).
 */
export function resolvePlanWeekFromSearchParam(
  w: string | string[] | undefined,
): string {
  const raw = Array.isArray(w) ? w[0] : w;
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return getWeekStartMonday(new Date());
  }
  const parsed = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return getWeekStartMonday(new Date());
  }
  return getWeekStartMonday(parsed);
}
