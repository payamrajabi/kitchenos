import { createClient } from "@/lib/supabase/server";
import {
  addDaysToDateString,
  getWeekStartMonday,
  planDateKeyInTZ,
} from "@/lib/dates";
import { getUserTimeZone } from "@/lib/timezone-server";
import { isSupabaseConfigured } from "@/lib/env";
import { PlanWeekClient } from "@/components/plan-week-client";
import {
  loadLibraryRecipeIds,
  ownedOrLibraryOrClause,
} from "@/lib/recipe-visibility";
import { ensureWeekSuggestionsAction } from "@/app/actions/meal-plan";
import { Suspense } from "react";
import type { MealPlanEntryRow, MealPlanRow, RecipeRow } from "@/types/database";

const DAYS_BACK = 14;
const DAYS_FORWARD = 21;

export default async function PlanPage() {
  if (!isSupabaseConfigured()) {
    return (
      <section className="grid is-empty">
        <p>Add Supabase credentials to <code>.env.local</code> to load your plan.</p>
      </section>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <section className="grid is-empty">
        <div className="empty-state">
          <p className="empty-state-message">
            Sign in with Supabase Auth to load your meal plan and inventory data.
          </p>
        </div>
      </section>
    );
  }

  const timeZone = await getUserTimeZone();
  const today = planDateKeyInTZ(timeZone);
  const rangeStart = addDaysToDateString(today, -DAYS_BACK);
  const rangeEnd = addDaysToDateString(today, DAYS_FORWARD);
  const startWeek = getWeekStartMonday(new Date(`${rangeStart}T12:00:00`));
  const endWeek = getWeekStartMonday(new Date(`${rangeEnd}T12:00:00`));

  const days: { date: string }[] = [];
  for (let i = -DAYS_BACK; i <= DAYS_FORWARD; i++) {
    days.push({ date: addDaysToDateString(today, i) });
  }

  const libraryIds = await loadLibraryRecipeIds(supabase, user.id);
  const recipeOrClause = ownedOrLibraryOrClause(user.id, libraryIds);

  // Fill any empty slots in the next 7 days with LLM suggestions. Cheap when
  // there are no gaps; otherwise it adds ~1s to page load while the edge
  // function runs. We await before reading entries so the new rows appear.
  await ensureWeekSuggestionsAction();

  const [{ data: planRows }, { data: recipeRows }, { data: ingredientRows }] =
    await Promise.all([
      supabase
        .from("meal_plans")
        .select("*, meal_plan_entries(*)")
        .gte("week_start", startWeek)
        .lte("week_start", endWeek),
      supabase
        .from("recipes")
        .select("*")
        .or(recipeOrClause)
        .is("deleted_at", null)
        .order("name"),
      supabase.from("ingredients").select("id,name").order("name"),
    ]);

  const entries = (planRows ?? []).flatMap(
    (p) => ((p as MealPlanRow).meal_plan_entries ?? []) as MealPlanEntryRow[],
  );
  entries.sort((a, b) => {
    const da = String(a.plan_date).localeCompare(String(b.plan_date));
    if (da !== 0) return da;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });

  const recipes = (recipeRows ?? []).map((recipe) => {
    const row = recipe as RecipeRow;
    return {
      id: row.id,
      name: row.name,
      meal_types: row.meal_types,
      image_url: row.image_url,
      image_urls: row.image_urls,
      image_focus_y: row.image_focus_y ?? null,
    };
  });
  const ingredients = (ingredientRows ?? []).map((row) => ({
    id: row.id,
    name: row.name?.trim() ? row.name : "Ingredient",
  }));

  return (
    <section className="plan-page">
      <div className="plan-week">
        <Suspense
          fallback={
            <p className="plan-board-feedback plan-board-feedback--muted" role="status">
              Loading plan…
            </p>
          }
        >
          <PlanWeekClient
            today={today}
            timeZone={timeZone}
            days={days}
            entries={entries}
            recipes={recipes}
            ingredients={ingredients}
          />
        </Suspense>
      </div>
    </section>
  );
}
