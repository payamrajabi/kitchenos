"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const PATCH_KEYS = new Set([
  "name",
  "birth_date",
  "weight",
  "height",
  "daily_calorie_expenditure",
  "calorie_min",
  "calorie_max",
  "calorie_target",
  "protein_min_grams",
  "protein_max_grams",
  "protein_target_grams",
  "fat_min_grams",
  "fat_max_grams",
  "fat_target_grams",
  "carb_min_grams",
  "carb_max_grams",
  "carb_target_grams",
  "dietary_restrictions",
  "allergies",
]);

function parseDecimal(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseListJsonb(raw: unknown): string[] | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  const parts = s.split(/[\n,;]+/).map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : null;
}

export async function updatePersonPatchAction(
  personId: number,
  patch: Record<string, unknown>,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const updates: Record<string, string | number | string[] | null> = {};
  const stamp = new Date().toISOString();

  for (const [key, raw] of Object.entries(patch)) {
    if (!PATCH_KEYS.has(key)) continue;
    switch (key) {
      case "name": {
        const s = String(raw ?? "").trim();
        if (!s) return { ok: false as const, error: "Name is required." };
        updates.name = s;
        break;
      }
      case "birth_date": {
        const s = String(raw ?? "").trim();
        updates.birth_date = s === "" ? null : s;
        break;
      }
      case "height": {
        const s = String(raw ?? "").trim();
        updates.height = s === "" ? null : s;
        break;
      }
      case "weight":
      case "daily_calorie_expenditure":
      case "calorie_min":
      case "calorie_max":
      case "calorie_target":
      case "protein_min_grams":
      case "protein_max_grams":
      case "protein_target_grams":
      case "fat_min_grams":
      case "fat_max_grams":
      case "fat_target_grams":
      case "carb_min_grams":
      case "carb_max_grams":
      case "carb_target_grams":
        updates[key] = parseDecimal(raw);
        break;
      case "dietary_restrictions":
      case "allergies":
        updates[key] = parseListJsonb(raw);
        break;
      default:
        break;
    }
  }

  if (Object.keys(updates).length === 0) {
    return { ok: true as const };
  }

  const { error } = await supabase
    .from("people")
    .update({ ...updates, updated_at: stamp })
    .eq("id", personId);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/people");
  revalidatePath(`/people/${personId}`);
  return { ok: true as const };
}

export async function updatePersonMacrosAction(
  personId: number,
  payload: {
    proteinGrams: number;
    fatGrams: number;
    carbGrams: number;
    targetCalories: number;
  },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const round = (n: number) =>
    Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;

  const { error } = await supabase
    .from("people")
    .update({
      protein_target_grams: round(payload.proteinGrams),
      fat_target_grams: round(payload.fatGrams),
      carb_target_grams: round(payload.carbGrams),
      calorie_target: round(payload.targetCalories),
      updated_at: new Date().toISOString(),
    })
    .eq("id", personId);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/people");
  revalidatePath(`/people/${personId}`);
  return { ok: true as const };
}

export async function deletePersonAction(personId: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in first." };

  const { error } = await supabase.from("people").delete().eq("id", personId);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/people");
  return { ok: true as const };
}

export async function createPersonAndRedirectAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/people");
  }

  const { data, error } = await supabase
    .from("people")
    .insert({ name: "New person" })
    .select("id")
    .single();

  if (error || data?.id == null) {
    redirect("/people");
  }

  const id = Number(data.id);
  revalidatePath("/people");
  redirect(`/people/${id}`);
}
