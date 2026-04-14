/**
 * When the user taps Plan while already on /plan, the board listens for this
 * and scrolls so “today” is the leading column.
 */
export const PLAN_SCROLL_TO_TODAY_EVENT = "kitchenos:plan-scroll-to-today";

export function dispatchPlanScrollToToday(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PLAN_SCROLL_TO_TODAY_EVENT));
}
