"use server";

import {
  classifyStoredMealEntry,
  getPlanSlot,
  type PlanSlotKey,
} from "@/lib/meal-plan";
import { createClient } from "@/lib/supabase/server";
import { getWeekStartMonday } from "@/lib/dates";
import { formatListValue } from "@/lib/text";
import { revalidatePath } from "next/cache";

type AiDay = {
  date: string;
  meals?: Array<{
    meal_slot?: string;
    recipe_hint?: string;
    label?: string;
    notes?: string | null;
  }>;
};

type AiResult = {
  days?: AiDay[];
  shopping_suggestions?: string[];
};

function getWeekStartForDate(dateStr: string) {
  return getWeekStartMonday(new Date(`${dateStr}T12:00:00`));
}

async function getOrCreatePlanId(supabase: Awaited<ReturnType<typeof createClient>>, weekStart: string) {
  const planQuery = await supabase
    .from("meal_plans")
    .select("id")
    .eq("week_start", weekStart)
    .maybeSingle();

  let planId = planQuery.data?.id;
  if (!planId) {
    const ins = await supabase
      .from("meal_plans")
      .insert({ week_start: weekStart, title: `Week of ${weekStart}` })
      .select("id")
      .single();
    if (ins.error || !ins.data?.id) {
      return {
        ok: false as const,
        error: ins.error?.message ?? "Could not create meal plan.",
      };
    }
    planId = ins.data.id;
  }

  return { ok: true as const, planId };
}

function resolveAiSlotKey(rawSlot: string | null | undefined, snackCountForDay: number): PlanSlotKey {
  const slot = String(rawSlot ?? "").toLowerCase();

  if (slot === "breakfast") return "breakfast";
  if (slot === "lunch") return "lunch";
  if (slot === "dinner") return "dinner";
  if (slot === "dessert") return "dessert";
  if (slot === "snack") return snackCountForDay === 0 ? "snack_am" : "snack_pm";

  return "dessert";
}

export async function suggestMealPlanWithAiAction(model: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, error: "Sign in to use AI meal planning." };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { ok: false as const, error: "No active session." };
  }

  const ws = getWeekStartMonday();
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!baseUrl || !anonKey) {
    return { ok: false as const, error: "Supabase is not configured." };
  }

  const [recipesRes, ingredientsRes, peopleRes] = await Promise.all([
    supabase.from("recipes").select("id,name").order("name"),
    supabase.from("ingredients").select("name,current_stock").limit(120),
    supabase
      .from("people")
      .select("name,dietary_restrictions,allergies")
      .order("name"),
  ]);

  const inventorySummary = (ingredientsRes.data ?? [])
    .map((i) => `${i.name}:${i.current_stock ?? ""}`)
    .join("\n");
  const recipeRows = recipesRes.data ?? [];
  const recipeTitles = recipeRows.map((r) => r.name).filter(Boolean);
  const peopleNotes = (peopleRes.data ?? [])
    .map(
      (p) =>
        `${p.name ?? "Person"} restrictions:${formatListValue(p.dietary_restrictions)} allergies:${formatListValue(p.allergies)}`,
    )
    .join("\n");

  const fnRes = await fetch(`${baseUrl}/functions/v1/openai-kitchen`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: anonKey,
    },
    body: JSON.stringify({
      mode: "meal_plan",
      model: model || "gpt-4o-mini",
      week_start: ws,
      inventory_summary: inventorySummary,
      recipe_titles: recipeTitles,
      people_notes: peopleNotes,
    }),
  });

  const payload = (await fnRes.json().catch(() => ({}))) as {
    error?: string;
    result?: AiResult;
  };
  if (!fnRes.ok) {
    return {
      ok: false as const,
      error: payload.error || "AI meal plan request failed.",
    };
  }

  const result = payload.result;
  const days = result?.days ?? [];
  if (!days.length) {
    return { ok: false as const, error: "AI returned no days." };
  }

  const planResult = await getOrCreatePlanId(supabase, ws);
  if (!planResult.ok) {
    return planResult;
  }
  const planId = planResult.planId;

  await supabase.from("meal_plan_entries").delete().eq("meal_plan_id", planId);

  const entries: Array<{
    meal_plan_id: number;
    plan_date: string;
    meal_slot: string;
    recipe_id: number | null;
    label: string;
    notes: string | null;
    sort_order: number;
  }> = [];

  const recipeByNameLower = new Map(
    recipeRows.map((r) => [String(r.name).toLowerCase(), r.id]),
  );

  for (const day of days) {
    const date = day.date;
    const rowCounts = new Map<PlanSlotKey, number>();
    let snackCountForDay = 0;

    for (const meal of day.meals ?? []) {
      const hint = meal.recipe_hint || meal.label;
      let recipeId: number | null = null;
      if (hint) {
        const match = recipeByNameLower.get(String(hint).toLowerCase());
        if (match) recipeId = match;
      }
      const slotKey = resolveAiSlotKey(meal.meal_slot, snackCountForDay);
      if (String(meal.meal_slot ?? "").toLowerCase() === "snack") {
        snackCountForDay += 1;
      }
      const slotConfig = getPlanSlot(slotKey);
      const indexInRow = rowCounts.get(slotKey) ?? 0;
      rowCounts.set(slotKey, indexInRow + 1);

      entries.push({
        meal_plan_id: planId,
        plan_date: date,
        meal_slot: slotConfig.dbMealSlot,
        recipe_id: recipeId,
        label: meal.label || hint || "Meal",
        notes: meal.notes ?? null,
        sort_order: slotConfig.sortBase + indexInRow,
      });
    }
  }

  if (entries.length) {
    const insE = await supabase.from("meal_plan_entries").insert(entries);
    if (insE.error) {
      return {
        ok: false as const,
        error: insE.error.message || "Failed to save plan entries.",
      };
    }
  }

  revalidatePath("/plan");
  return {
    ok: true as const,
    shoppingSuggestions: result?.shopping_suggestions ?? [],
  };
}

export async function addMealPlanEntryAction(input: {
  planDate: string;
  slotKey: PlanSlotKey;
  recipeId?: number;
  ingredientId?: number;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, error: "Sign in to edit your meal plan." };
  }

  const planDate = String(input.planDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(planDate)) {
    return { ok: false as const, error: "Pick a valid day before adding something to the plan." };
  }

  const recipeId =
    input.recipeId != null && Number.isFinite(Number(input.recipeId))
      ? Number(input.recipeId)
      : null;
  const ingredientId =
    input.ingredientId != null && Number.isFinite(Number(input.ingredientId))
      ? Number(input.ingredientId)
      : null;

  const pickCount = (recipeId != null ? 1 : 0) + (ingredientId != null ? 1 : 0);
  if (pickCount !== 1) {
    return { ok: false as const, error: "Choose a recipe or an ingredient." };
  }

  const slot = getPlanSlot(input.slotKey);
  const weekStart = getWeekStartForDate(planDate);
  const planResult = await getOrCreatePlanId(supabase, weekStart);
  if (!planResult.ok) {
    return planResult;
  }

  let label: string;
  let resolvedRecipeId: number | null;

  if (recipeId != null) {
    const recipeQuery = await supabase
      .from("recipes")
      .select("id,name")
      .eq("id", recipeId)
      .single();

    if (recipeQuery.error || !recipeQuery.data) {
      return { ok: false as const, error: "That recipe could not be found." };
    }
    label = recipeQuery.data.name;
    resolvedRecipeId = recipeQuery.data.id;
  } else {
    if (ingredientId == null) {
      return { ok: false as const, error: "Choose a recipe or an ingredient." };
    }
    const ingQuery = await supabase
      .from("ingredients")
      .select("id,name")
      .eq("id", ingredientId)
      .single();

    if (ingQuery.error || !ingQuery.data) {
      return { ok: false as const, error: "That ingredient could not be found." };
    }
    label = ingQuery.data.name;
    resolvedRecipeId = null;
  }

  const existingQuery = await supabase
    .from("meal_plan_entries")
    .select("meal_slot,sort_order")
    .eq("meal_plan_id", planResult.planId)
    .eq("plan_date", planDate);

  if (existingQuery.error) {
    return { ok: false as const, error: existingQuery.error.message };
  }

  const matchingRow = (existingQuery.data ?? []).filter(
    (entry) =>
      classifyStoredMealEntry(entry.meal_slot, entry.sort_order) === input.slotKey,
  );
  const nextSortOrder = slot.sortBase + matchingRow.length;

  const insertResult = await supabase.from("meal_plan_entries").insert({
    meal_plan_id: planResult.planId,
    plan_date: planDate,
    meal_slot: slot.dbMealSlot,
    recipe_id: resolvedRecipeId,
    label,
    notes: null,
    sort_order: nextSortOrder,
  });

  if (insertResult.error) {
    return { ok: false as const, error: insertResult.error.message };
  }

  revalidatePath("/plan");
  return { ok: true as const };
}

export async function deleteMealPlanEntryAction(entryId: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, error: "Sign in to edit your meal plan." };
  }

  const deleteResult = await supabase
    .from("meal_plan_entries")
    .delete()
    .eq("id", entryId);

  if (deleteResult.error) {
    return { ok: false as const, error: deleteResult.error.message };
  }

  revalidatePath("/plan");
  return { ok: true as const };
}
