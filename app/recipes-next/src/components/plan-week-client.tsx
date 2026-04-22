"use client";

import { PlanWeekBoard } from "@/components/plan-week-board";
import type { MealPlanEntryRow } from "@/types/database";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { ensureWeekSuggestionsAction } from "@/app/actions/meal-plan";

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
  timeZone: string;
  days: { date: string }[];
  entries: MealPlanEntryRow[];
  recipes: RecipeOption[];
  ingredients: IngredientOption[];
};

export function PlanWeekClient({
  today,
  timeZone,
  days,
  entries,
  recipes,
  ingredients,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const boardRef = useRef<{ scrollToToday: () => void } | null>(null);
  const hasAutoFilledRef = useRef(false);

  useEffect(() => {
    boardRef.current?.scrollToToday();
  }, [pathname]);

  // Fill the 7-day rolling window with LLM suggestions once per page load.
  // This used to run on the server inside PlanPage's render, but Next.js 16
  // disallows invoking a Server Action (which implicitly/explicitly calls
  // revalidatePath) from a server component's render cycle. Firing it from
  // a client effect sidesteps the rule and only costs a brief flicker on
  // the first visit while the edge function runs.
  useEffect(() => {
    if (hasAutoFilledRef.current) return;
    hasAutoFilledRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const result = await ensureWeekSuggestionsAction();
        if (!cancelled && result.ok && result.filled > 0) {
          router.refresh();
        }
      } catch {
        // Silently ignore — /plan still renders without AI suggestions.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="plan-week-fit">
      {days.length === 0 ? (
        <p className="plan-board-feedback plan-board-feedback--muted" role="status">
          No days to display.
        </p>
      ) : (
        <PlanWeekBoard
          ref={boardRef}
          today={today}
          timeZone={timeZone}
          days={days}
          entries={entries}
          recipes={recipes}
          ingredients={ingredients}
        />
      )}
    </div>
  );
}
