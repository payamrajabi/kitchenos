"use server";

import {
  classifyStoredMealEntry,
  getPlanSlot,
  planSlotOrder,
  type PlanSlotKey,
} from "@/lib/meal-plan";
import { createClient } from "@/lib/supabase/server";
import {
  addDaysToDateString,
  getWeekStartMonday,
  planDateKeyInTZ,
} from "@/lib/dates";
import { getUserTimeZone } from "@/lib/timezone-server";
import { formatListValue } from "@/lib/text";
import {
  describeRulesForPrompt,
  validateSuggestion,
  type PlacedMeal,
  type RuleContext,
} from "@/lib/meal-suggestion/rules";
import type { SuggestionCandidate } from "@/types/database";
import { revalidatePath } from "next/cache";

/** How many days into the future the rolling auto-fill window covers. */
const SUGGESTION_WINDOW_DAYS = 7;
/** How far back to look for the no-repeat rule. */
const SUGGESTION_LOOKBACK_DAYS = 4;
/** Candidates requested per gap (1 active + rest stored in suggestion_pool). */
const CANDIDATES_PER_GAP = 4;

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

  // AI meal planning should only see the user's own + saved recipes, not
  // every recipe in the community.
  const { data: libraryRows } = await supabase
    .from("user_recipe_library")
    .select("recipe_id")
    .eq("user_id", user.id);
  const libraryIds = (libraryRows ?? [])
    .map((r) => Number((r as { recipe_id: unknown }).recipe_id))
    .filter((n) => Number.isFinite(n));
  const recipeOrClause = libraryIds.length
    ? `owner_id.eq.${user.id},id.in.(${libraryIds.join(",")})`
    : `owner_id.eq.${user.id}`;

  const [recipesRes, ingredientsRes, peopleRes] = await Promise.all([
    supabase
      .from("recipes")
      .select("id,name")
      .or(recipeOrClause)
      .is("deleted_at", null)
      .order("name"),
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
    servings: 4,
    is_suggestion: false,
  });

  if (insertResult.error) {
    return { ok: false as const, error: insertResult.error.message };
  }

  // User is explicitly placing a meal here: forget any prior "don't suggest" mark.
  await clearDismissalForSlot(supabase, user.id, planDate, input.slotKey);

  revalidatePath("/plan");
  return { ok: true as const };
}

export async function moveMealPlanEntryAction(input: {
  entryId: number;
  planDate: string;
  slotKey: PlanSlotKey;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, error: "Sign in to edit your meal plan." };
  }

  const entryId = Number(input.entryId);
  if (!Number.isFinite(entryId)) {
    return { ok: false as const, error: "Invalid plan entry." };
  }

  const planDate = String(input.planDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(planDate)) {
    return { ok: false as const, error: "Pick a valid day before moving this meal." };
  }

  const slot = getPlanSlot(input.slotKey);
  const weekStart = getWeekStartForDate(planDate);
  const planResult = await getOrCreatePlanId(supabase, weekStart);
  if (!planResult.ok) {
    return planResult;
  }

  const existingQuery = await supabase
    .from("meal_plan_entries")
    .select("id,meal_slot,sort_order")
    .eq("meal_plan_id", planResult.planId)
    .eq("plan_date", planDate);

  if (existingQuery.error) {
    return { ok: false as const, error: existingQuery.error.message };
  }

  const matchingRow = (existingQuery.data ?? []).filter(
    (entry) =>
      entry.id !== entryId &&
      classifyStoredMealEntry(entry.meal_slot, entry.sort_order) === input.slotKey,
  );
  const nextSortOrder = slot.sortBase + matchingRow.length;

  // Moving a card promotes a suggestion: user deliberately chose this meal.
  const updateResult = await supabase
    .from("meal_plan_entries")
    .update({
      meal_plan_id: planResult.planId,
      plan_date: planDate,
      meal_slot: slot.dbMealSlot,
      sort_order: nextSortOrder,
      is_suggestion: false,
      suggestion_pool: null,
    })
    .eq("id", entryId);

  if (updateResult.error) {
    return { ok: false as const, error: updateResult.error.message };
  }

  // User placed a real meal into this slot: wipe any "don't suggest here" record
  // so future auto-fills can repopulate if this meal is later removed.
  await clearDismissalForSlot(supabase, user.id, planDate, input.slotKey);

  revalidatePath("/plan");
  return { ok: true as const };
}

export async function swapMealPlanEntriesAction(input: {
  entryAId: number;
  entryBId: number;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, error: "Sign in to edit your meal plan." };
  }

  const aId = Number(input.entryAId);
  const bId = Number(input.entryBId);
  if (!Number.isFinite(aId) || !Number.isFinite(bId) || aId === bId) {
    return { ok: false as const, error: "Invalid plan entries to swap." };
  }

  const existing = await supabase
    .from("meal_plan_entries")
    .select("id,meal_plan_id,plan_date,meal_slot,sort_order")
    .in("id", [aId, bId]);

  if (existing.error) {
    return { ok: false as const, error: existing.error.message };
  }

  const rows = existing.data ?? [];
  const a = rows.find((r) => r.id === aId);
  const b = rows.find((r) => r.id === bId);
  if (!a || !b) {
    return { ok: false as const, error: "One of the plan entries could not be found." };
  }

  // Swapping two cards promotes both into real user choices.
  const updateA = await supabase
    .from("meal_plan_entries")
    .update({
      meal_plan_id: b.meal_plan_id,
      plan_date: b.plan_date,
      meal_slot: b.meal_slot,
      sort_order: b.sort_order,
      is_suggestion: false,
      suggestion_pool: null,
    })
    .eq("id", aId);
  if (updateA.error) {
    return { ok: false as const, error: updateA.error.message };
  }

  const updateB = await supabase
    .from("meal_plan_entries")
    .update({
      meal_plan_id: a.meal_plan_id,
      plan_date: a.plan_date,
      meal_slot: a.meal_slot,
      sort_order: a.sort_order,
      is_suggestion: false,
      suggestion_pool: null,
    })
    .eq("id", bId);
  if (updateB.error) {
    return { ok: false as const, error: updateB.error.message };
  }

  revalidatePath("/plan");
  return { ok: true as const };
}

export async function updateMealPlanEntryServingsAction(entryId: number, servings: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, error: "Sign in to edit your meal plan." };
  }

  const n = Math.floor(Number(servings));
  if (!Number.isFinite(n) || n < 1 || n > 99) {
    return { ok: false as const, error: "Servings must be between 1 and 99." };
  }

  // Any edit to servings promotes a suggestion into a real, user-owned meal.
  const updateResult = await supabase
    .from("meal_plan_entries")
    .update({ servings: n, is_suggestion: false, suggestion_pool: null })
    .eq("id", entryId);

  if (updateResult.error) {
    return { ok: false as const, error: updateResult.error.message };
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

// ---------------------------------------------------------------------------
// Auto-suggestion helpers + actions
// ---------------------------------------------------------------------------

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

type RecipeLookupRow = {
  id: number;
  name: string;
  meal_types: string[] | null;
};

type ExistingEntry = {
  id: number;
  plan_date: string;
  meal_slot: string | null;
  sort_order: number | null;
  recipe_id: number | null;
  label: string | null;
};

async function clearDismissalForSlot(
  supabase: SupabaseServer,
  ownerId: string,
  planDate: string,
  slotKey: PlanSlotKey,
) {
  const slot = getPlanSlot(slotKey);
  await supabase
    .from("meal_plan_slot_dismissals")
    .delete()
    .eq("owner_id", ownerId)
    .eq("plan_date", planDate)
    .eq("meal_slot", slot.dbMealSlot)
    .eq("sort_order", slot.sortBase);
}

function normalizeSuggestionPool(raw: unknown): SuggestionCandidate[] {
  if (!Array.isArray(raw)) return [];
  const out: SuggestionCandidate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const label =
      typeof obj.label === "string" && obj.label.trim() ? obj.label : null;
    if (!label) continue;
    const recipeId =
      typeof obj.recipe_id === "number" && Number.isFinite(obj.recipe_id)
        ? obj.recipe_id
        : null;
    out.push({
      recipe_id: recipeId,
      label,
      recipe_title: typeof obj.recipe_title === "string" ? obj.recipe_title : null,
      notes: typeof obj.notes === "string" ? obj.notes : null,
    });
  }
  return out;
}

function buildPlacedMeals(rows: ExistingEntry[]): PlacedMeal[] {
  const out: PlacedMeal[] = [];
  for (const row of rows) {
    const slotKey = classifyStoredMealEntry(row.meal_slot, row.sort_order);
    if (!slotKey) continue;
    out.push({
      date: String(row.plan_date).slice(0, 10),
      slotKey,
      recipeId: row.recipe_id ?? null,
      label: row.label,
    });
  }
  return out;
}

async function loadSuggestionContext(
  supabase: SupabaseServer,
  userId: string,
  windowStart: string,
  windowEnd: string,
) {
  const lookbackStart = addDaysToDateString(windowStart, -SUGGESTION_LOOKBACK_DAYS);

  const [libraryRes, ownedRes, entriesRes, dismissalRes, peopleRes, ingredientsRes] =
    await Promise.all([
      supabase
        .from("user_recipe_library")
        .select("recipe_id")
        .eq("user_id", userId),
      // Recipes the user owns OR has in their library, with meal_types.
      supabase
        .from("recipes")
        .select("id,name,meal_types")
        .is("deleted_at", null),
      supabase
        .from("meal_plan_entries")
        .select(
          "id,plan_date,meal_slot,sort_order,recipe_id,label,meal_plans!inner(owner_id)",
        )
        .eq("meal_plans.owner_id", userId)
        .gte("plan_date", lookbackStart)
        .lte("plan_date", windowEnd),
      supabase
        .from("meal_plan_slot_dismissals")
        .select("plan_date,meal_slot,sort_order")
        .eq("owner_id", userId)
        .gte("plan_date", windowStart)
        .lte("plan_date", windowEnd),
      supabase
        .from("people")
        .select("name,dietary_restrictions,allergies")
        .order("name"),
      supabase.from("ingredients").select("name,current_stock").limit(120),
    ]);

  const libraryIds = new Set<number>(
    (libraryRes.data ?? [])
      .map((r) => Number((r as { recipe_id: unknown }).recipe_id))
      .filter((n) => Number.isFinite(n)),
  );

  // RLS on the recipes table already scopes reads to visible rows (owned +
  // library + community). We additionally carry the library set for future
  // rule-based filtering (e.g. "only library recipes, never community").
  const visibleRecipes = (ownedRes.data ?? []) as RecipeLookupRow[];
  const recipesById = new Map<number, RecipeLookupRow>();
  for (const r of visibleRecipes) recipesById.set(r.id, r);

  const entries = (entriesRes.data ?? []) as ExistingEntry[];

  const dismissalSet = new Set<string>(
    (dismissalRes.data ?? []).map(
      (d) =>
        `${String(d.plan_date).slice(0, 10)}::${d.meal_slot}::${d.sort_order ?? 0}`,
    ),
  );

  const inventorySummary = (ingredientsRes.data ?? [])
    .map((i) => `${i.name}:${i.current_stock ?? ""}`)
    .join("\n");

  const peopleNotes = (peopleRes.data ?? [])
    .map(
      (p) =>
        `${p.name ?? "Person"} restrictions:${formatListValue(p.dietary_restrictions)} allergies:${formatListValue(p.allergies)}`,
    )
    .join("\n");

  return {
    libraryIds,
    recipesById,
    visibleRecipes,
    entries,
    dismissalSet,
    inventorySummary,
    peopleNotes,
  };
}

function findGaps(
  windowDays: string[],
  entries: ExistingEntry[],
  dismissalSet: Set<string>,
): Array<{ date: string; slotKey: PlanSlotKey }> {
  const filled = new Set<string>();
  for (const entry of entries) {
    const slotKey = classifyStoredMealEntry(entry.meal_slot, entry.sort_order);
    if (!slotKey) continue;
    const dateKey = String(entry.plan_date).slice(0, 10);
    if (!windowDays.includes(dateKey)) continue;
    filled.add(`${dateKey}::${slotKey}`);
  }

  const gaps: Array<{ date: string; slotKey: PlanSlotKey }> = [];
  for (const date of windowDays) {
    for (const slot of planSlotOrder) {
      if (filled.has(`${date}::${slot.key}`)) continue;
      const dismissKey = `${date}::${slot.dbMealSlot}::${slot.sortBase}`;
      if (dismissalSet.has(dismissKey)) continue;
      gaps.push({ date, slotKey: slot.key });
    }
  }
  return gaps;
}

type LlmSlotResponse = {
  date: string;
  slot_key: string;
  candidates: Array<{
    recipe_title?: string | null;
    label?: string | null;
    notes?: string | null;
  }>;
};

async function callSuggestionsEdgeFunction(input: {
  accessToken: string;
  baseUrl: string;
  anonKey: string;
  model: string;
  gaps: Array<{ date: string; slotKey: PlanSlotKey }>;
  library: RecipeLookupRow[];
  placed: ExistingEntry[];
  peopleNotes: string;
  inventorySummary: string;
}): Promise<{ ok: true; slots: LlmSlotResponse[] } | { ok: false; error: string }> {
  const placedMealsForLlm = input.placed
    .map((p) => {
      const slotKey = classifyStoredMealEntry(p.meal_slot, p.sort_order);
      if (!slotKey) return null;
      return {
        date: String(p.plan_date).slice(0, 10),
        slot_key: slotKey,
        label: p.label ?? null,
      };
    })
    .filter(Boolean);

  const res = await fetch(`${input.baseUrl}/functions/v1/openai-kitchen`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.accessToken}`,
      apikey: input.anonKey,
    },
    body: JSON.stringify({
      mode: "weekly_suggestions",
      model: input.model,
      gaps: input.gaps.map((g) => ({ date: g.date, slot_key: g.slotKey })),
      library_recipes: input.library.map((r) => ({
        title: r.name,
        meal_types: r.meal_types ?? [],
      })),
      placed_meals: placedMealsForLlm,
      people_notes: input.peopleNotes,
      inventory_summary: input.inventorySummary,
      rules_block: describeRulesForPrompt(),
      candidates_per_gap: CANDIDATES_PER_GAP,
    }),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    error?: string;
    result?: { slots?: LlmSlotResponse[] };
  };
  if (!res.ok) {
    return { ok: false, error: payload.error || "AI suggestion request failed." };
  }
  return { ok: true, slots: payload.result?.slots ?? [] };
}

function pickAcceptableCandidates(
  rawCandidates: LlmSlotResponse["candidates"],
  gap: { date: string; slotKey: PlanSlotKey },
  placed: PlacedMeal[],
  recipesByTitle: Map<string, RecipeLookupRow>,
  recipesById: Map<number, RecipeLookupRow>,
): SuggestionCandidate[] {
  const ruleCtx: RuleContext = {
    date: gap.date,
    slotKey: gap.slotKey,
    placedMeals: placed,
    getRecipeMealTypes: (id) => {
      if (id == null) return [];
      return recipesById.get(id)?.meal_types ?? [];
    },
  };

  const accepted: SuggestionCandidate[] = [];
  for (const raw of rawCandidates) {
    const label = (raw.label ?? raw.recipe_title ?? "").trim();
    if (!label) continue;
    const titleKey = String(raw.recipe_title ?? "").trim().toLowerCase();
    const matchedRecipe = titleKey
      ? recipesByTitle.get(titleKey)
      : undefined;
    const candidate: SuggestionCandidate = {
      recipe_id: matchedRecipe?.id ?? null,
      label,
      recipe_title: raw.recipe_title ?? null,
      notes: raw.notes ?? null,
    };
    const check = validateSuggestion(
      {
        recipeId: candidate.recipe_id,
        label: candidate.label,
        recipeTitle: candidate.recipe_title ?? null,
      },
      ruleCtx,
    );
    if (check.ok) accepted.push(candidate);
  }
  return accepted;
}

/**
 * Called on /plan page load. Ensures every (day, slot) in the next 7 days is
 * either (a) already filled by a real or suggested meal, (b) deliberately
 * dismissed by the user, or (c) just got a freshly-generated suggestion.
 *
 * No-op when there are no gaps — cheap to call on every render.
 */
export async function ensureWeekSuggestionsAction(options?: { model?: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { ok: false as const, error: "No active session." };
  }

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!baseUrl || !anonKey) {
    return { ok: false as const, error: "Supabase not configured." };
  }

  const timeZone = await getUserTimeZone();
  const today = planDateKeyInTZ(timeZone);
  const windowDays: string[] = [];
  for (let i = 0; i < SUGGESTION_WINDOW_DAYS; i += 1) {
    windowDays.push(addDaysToDateString(today, i));
  }
  const windowStart = windowDays[0];
  const windowEnd = windowDays[windowDays.length - 1];

  const ctx = await loadSuggestionContext(supabase, user.id, windowStart, windowEnd);
  const gaps = findGaps(windowDays, ctx.entries, ctx.dismissalSet);
  if (gaps.length === 0) {
    return { ok: true as const, filled: 0 };
  }

  const llmResult = await callSuggestionsEdgeFunction({
    accessToken: session.access_token,
    baseUrl,
    anonKey,
    model: options?.model || "gpt-4o-mini",
    gaps,
    library: Array.from(ctx.recipesById.values()),
    placed: ctx.entries,
    peopleNotes: ctx.peopleNotes,
    inventorySummary: ctx.inventorySummary,
  });
  if (!llmResult.ok) return { ok: false as const, error: llmResult.error };

  const recipesByTitle = new Map<string, RecipeLookupRow>();
  for (const r of ctx.recipesById.values()) {
    recipesByTitle.set(r.name.trim().toLowerCase(), r);
  }

  const placedMeals = buildPlacedMeals(ctx.entries);
  const slotsByKey = new Map<string, LlmSlotResponse>();
  for (const s of llmResult.slots) {
    slotsByKey.set(`${s.date}::${s.slot_key}`, s);
  }

  // Group gaps by week_start so we can upsert plan rows efficiently.
  const gapsByWeek = new Map<string, typeof gaps>();
  for (const g of gaps) {
    const ws = getWeekStartMonday(new Date(`${g.date}T12:00:00`));
    const bucket = gapsByWeek.get(ws) ?? [];
    bucket.push(g);
    gapsByWeek.set(ws, bucket);
  }

  const inserts: Array<{
    meal_plan_id: number;
    plan_date: string;
    meal_slot: string;
    recipe_id: number | null;
    label: string;
    notes: string | null;
    sort_order: number;
    servings: number;
    is_suggestion: boolean;
    suggestion_pool: SuggestionCandidate[] | null;
  }> = [];

  for (const [weekStart, weekGaps] of gapsByWeek) {
    const planResult = await getOrCreatePlanId(supabase, weekStart);
    if (!planResult.ok) continue;

    for (const gap of weekGaps) {
      const llmSlot = slotsByKey.get(`${gap.date}::${gap.slotKey}`);
      if (!llmSlot) continue;

      const accepted = pickAcceptableCandidates(
        llmSlot.candidates ?? [],
        gap,
        placedMeals,
        recipesByTitle,
        ctx.recipesById,
      );
      if (accepted.length === 0) continue;

      const [active, ...pool] = accepted;
      const slotConfig = getPlanSlot(gap.slotKey);
      inserts.push({
        meal_plan_id: planResult.planId,
        plan_date: gap.date,
        meal_slot: slotConfig.dbMealSlot,
        recipe_id: active.recipe_id,
        label: active.label,
        notes: active.notes ?? null,
        sort_order: slotConfig.sortBase,
        servings: 4,
        is_suggestion: true,
        suggestion_pool: pool.length > 0 ? pool : null,
      });

      // Treat this new suggestion as "placed" for subsequent no-repeat checks.
      placedMeals.push({
        date: gap.date,
        slotKey: gap.slotKey,
        recipeId: active.recipe_id,
        label: active.label,
      });
    }
  }

  if (inserts.length > 0) {
    const insertRes = await supabase.from("meal_plan_entries").insert(inserts);
    if (insertRes.error) {
      return { ok: false as const, error: insertRes.error.message };
    }
  }

  revalidatePath("/plan");
  return { ok: true as const, filled: inserts.length };
}

/**
 * Pops the next candidate from `suggestion_pool` into the active fields of
 * the row. If the pool is empty, calls the LLM for fresh candidates for just
 * this one slot.
 */
export async function cycleMealPlanSuggestionAction(entryId: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const entryRes = await supabase
    .from("meal_plan_entries")
    .select(
      "id,plan_date,meal_slot,sort_order,recipe_id,label,notes,suggestion_pool,is_suggestion,meal_plan_id",
    )
    .eq("id", entryId)
    .single();
  if (entryRes.error || !entryRes.data) {
    return { ok: false as const, error: "Could not load suggestion." };
  }
  const entry = entryRes.data as ExistingEntry & {
    notes: string | null;
    suggestion_pool: unknown;
    is_suggestion: boolean | null;
    meal_plan_id: number;
  };
  if (!entry.is_suggestion) {
    return { ok: false as const, error: "This meal is no longer a suggestion." };
  }

  const slotKey = classifyStoredMealEntry(entry.meal_slot, entry.sort_order);
  if (!slotKey) {
    return { ok: false as const, error: "Unknown slot." };
  }

  let pool = normalizeSuggestionPool(entry.suggestion_pool);

  // Empty pool → call LLM for fresh candidates for this one gap.
  if (pool.length === 0) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!session?.access_token || !baseUrl || !anonKey) {
      return { ok: false as const, error: "No session to refresh suggestions." };
    }

    const timeZone = await getUserTimeZone();
    const today = planDateKeyInTZ(timeZone);
    const windowEnd = addDaysToDateString(today, SUGGESTION_WINDOW_DAYS - 1);
    const ctx = await loadSuggestionContext(supabase, user.id, today, windowEnd);

    const llmResult = await callSuggestionsEdgeFunction({
      accessToken: session.access_token,
      baseUrl,
      anonKey,
      model: "gpt-4o-mini",
      gaps: [{ date: String(entry.plan_date).slice(0, 10), slotKey }],
      library: Array.from(ctx.recipesById.values()),
      // Exclude the current entry so the LLM can legitimately replace it.
      placed: ctx.entries.filter((e) => e.id !== entry.id),
      peopleNotes: ctx.peopleNotes,
      inventorySummary: ctx.inventorySummary,
    });
    if (!llmResult.ok) return { ok: false as const, error: llmResult.error };

    const recipesByTitle = new Map<string, RecipeLookupRow>();
    for (const r of ctx.recipesById.values()) {
      recipesByTitle.set(r.name.trim().toLowerCase(), r);
    }
    const placed = buildPlacedMeals(ctx.entries.filter((e) => e.id !== entry.id));
    const first = llmResult.slots[0];
    pool = first
      ? pickAcceptableCandidates(
          first.candidates ?? [],
          { date: String(entry.plan_date).slice(0, 10), slotKey },
          placed,
          recipesByTitle,
          ctx.recipesById,
        )
      : [];

    // Extra filter: exclude whatever is currently active so we don't hand back
    // the same pick the user just saw.
    const currentLabelKey = String(entry.label ?? "").trim().toLowerCase();
    pool = pool.filter((c) => {
      if (entry.recipe_id != null && c.recipe_id === entry.recipe_id) return false;
      if (c.label.trim().toLowerCase() === currentLabelKey) return false;
      return true;
    });
  }

  if (pool.length === 0) {
    return { ok: false as const, error: "No more suggestions available right now." };
  }

  const [next, ...rest] = pool;
  const updateRes = await supabase
    .from("meal_plan_entries")
    .update({
      recipe_id: next.recipe_id,
      label: next.label,
      notes: next.notes ?? null,
      suggestion_pool: rest.length > 0 ? rest : null,
    })
    .eq("id", entryId);
  if (updateRes.error) {
    return { ok: false as const, error: updateRes.error.message };
  }

  revalidatePath("/plan");
  return { ok: true as const };
}

/**
 * User trashed a suggestion card. Deletes the row and records a dismissal so
 * auto-fill won't re-populate this slot until the user explicitly places
 * something there (add/drag clears the dismissal).
 */
export async function dismissMealPlanSuggestionAction(entryId: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const entryRes = await supabase
    .from("meal_plan_entries")
    .select("id,plan_date,meal_slot,sort_order,is_suggestion")
    .eq("id", entryId)
    .single();
  if (entryRes.error || !entryRes.data) {
    return { ok: false as const, error: "Could not load suggestion." };
  }
  const entry = entryRes.data as Pick<
    ExistingEntry,
    "id" | "plan_date" | "meal_slot" | "sort_order"
  > & { is_suggestion: boolean | null };
  if (!entry.is_suggestion) {
    return { ok: false as const, error: "Only suggestions can be dismissed." };
  }

  const slotKey = classifyStoredMealEntry(entry.meal_slot, entry.sort_order);
  if (!slotKey) {
    return { ok: false as const, error: "Unknown slot." };
  }
  const slot = getPlanSlot(slotKey);

  const delRes = await supabase
    .from("meal_plan_entries")
    .delete()
    .eq("id", entryId);
  if (delRes.error) {
    return { ok: false as const, error: delRes.error.message };
  }

  const insRes = await supabase.from("meal_plan_slot_dismissals").insert({
    plan_date: String(entry.plan_date).slice(0, 10),
    meal_slot: slot.dbMealSlot,
    sort_order: slot.sortBase,
  });
  if (insRes.error && !/duplicate key|unique/i.test(insRes.error.message)) {
    // Non-fatal: suggestion is already deleted. Log silently.
  }

  revalidatePath("/plan");
  return { ok: true as const };
}
