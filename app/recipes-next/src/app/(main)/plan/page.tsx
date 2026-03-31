import { createClient } from "@/lib/supabase/server";
import {
  formatPlanDayLabel,
  resolvePlanWeekFromSearchParam,
  weekDayStrings,
} from "@/lib/dates";
import { isSupabaseConfigured } from "@/lib/env";
import { PlanWeekBoard } from "@/components/plan-week-board";
import { PlanWeekNav } from "@/components/plan-week-nav";
import type { MealPlanEntryRow, MealPlanRow } from "@/types/database";

type PageProps = {
  searchParams?: Promise<{ w?: string | string[] }>;
};

export default async function PlanPage({ searchParams }: PageProps) {
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

  const sp = searchParams ? await searchParams : {};
  const ws = resolvePlanWeekFromSearchParam(sp.w);
  const [{ data: planRows }, { data: recipeRows }, { data: ingredientRows }] =
    await Promise.all([
      supabase
        .from("meal_plans")
        .select("*, meal_plan_entries(*)")
        .eq("week_start", ws)
        .limit(1),
      supabase.from("recipes").select("id,name").order("name"),
      supabase.from("ingredients").select("id,name").order("name"),
    ]);

  const plan = (planRows?.[0] as MealPlanRow | undefined) ?? null;
  const entries = [...(plan?.meal_plan_entries ?? [])] as MealPlanEntryRow[];
  entries.sort((a, b) => {
    const da = String(a.plan_date).localeCompare(String(b.plan_date));
    if (da !== 0) return da;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
  const days = weekDayStrings(ws).map((dateStr) => ({
    date: dateStr,
    label: formatPlanDayLabel(dateStr),
  }));
  const recipes = (recipeRows ?? []).map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
  }));
  const ingredients = (ingredientRows ?? []).map((row) => ({
    id: row.id,
    name: row.name?.trim() ? row.name : "Ingredient",
  }));

  return (
    <section className="plan-page">
      <div className="plan-week">
        <PlanWeekNav weekStart={ws} />
        <PlanWeekBoard
          days={days}
          entries={entries}
          recipes={recipes}
          ingredients={ingredients}
        />
      </div>
    </section>
  );
}
