"use client";

import { PlanWeekBoard } from "@/components/plan-week-board";
import type { MealPlanEntryRow } from "@/types/database";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

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
  days: { date: string }[];
  entries: MealPlanEntryRow[];
  recipes: RecipeOption[];
  ingredients: IngredientOption[];
};

export function PlanWeekClient({
  today,
  days,
  entries,
  recipes,
  ingredients,
}: Props) {
  const pathname = usePathname();
  const boardRef = useRef<{ scrollToToday: () => void } | null>(null);

  useEffect(() => {
    boardRef.current?.scrollToToday();
  }, [pathname]);

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
          days={days}
          entries={entries}
          recipes={recipes}
          ingredients={ingredients}
        />
      )}
    </div>
  );
}
