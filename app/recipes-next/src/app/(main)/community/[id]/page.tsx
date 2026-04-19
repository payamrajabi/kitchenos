import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { CommunitySaveActions } from "@/components/community-save-actions";
import { RecipeDetailEditor } from "@/components/recipe-detail-editor";
import { RecipeTombstone } from "@/components/recipe-tombstone";
import { parseLegacyInstructionsToSteps } from "@/lib/legacy-instructions-parse";
import type {
  IngredientRow,
  RecipeIngredientSectionRow,
  RecipeInstructionStepRow,
  RecipeRow,
} from "@/types/database";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

type RawIngredientJoin = {
  id: unknown;
  name: unknown;
  density_g_per_ml?: unknown;
  canonical_unit_weight_g?: unknown;
};

type RawRecipeIngredientRow = {
  id: unknown;
  recipe_id: unknown;
  ingredient_id: unknown;
  section_id: unknown;
  line_sort_order: unknown;
  amount: unknown;
  unit: unknown;
  preparation?: unknown;
  display?: unknown;
  is_optional?: unknown;
  created_at?: string;
  ingredients: RawIngredientJoin | RawIngredientJoin[] | null;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!isSupabaseConfigured()) return { title: "Community Recipe" };
  const supabase = await createClient();
  const { data } = await supabase
    .from("recipes")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  const row = data as { name: string } | null;
  if (!row?.name) return { title: "Community Recipe" };
  return { title: `${row.name} · Community` };
}

export default async function CommunityRecipeDetailPage({ params }: Props) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <section className="grid is-empty">
        <p>Configure Supabase in <code>.env.local</code>.</p>
      </section>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const recipeResult = await supabase
    .from("recipes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (recipeResult.error || !recipeResult.data) {
    notFound();
  }

  const recipe = recipeResult.data as RecipeRow;
  const isOwn = !!user && recipe.owner_id === user.id;

  // Owners don't browse their own recipes from the Community side — send them
  // straight to their editor so they can't get stranded on a read-only view
  // of something they control.
  if (isOwn && !recipe.deleted_at) {
    redirect(`/recipes/${id}`);
  }

  let inLibrary = false;
  if (user) {
    const libraryLookup = await supabase
      .from("user_recipe_library")
      .select("recipe_id")
      .eq("user_id", user.id)
      .eq("recipe_id", recipe.id)
      .maybeSingle();
    inLibrary = !!libraryLookup.data;
  }

  // Soft-deleted: only show the tombstone to someone who has it in their
  // library; anyone else (including signed-out visitors) should not see a
  // "removed" recipe at all.
  if (recipe.deleted_at) {
    if (!user || !inLibrary || isOwn) {
      notFound();
    }
    return <RecipeTombstone recipe={recipe} />;
  }

  const [
    ingredientsResult,
    recipeIngredientsResult,
    sectionsResult,
    instructionStepsResult,
  ] = await Promise.all([
    supabase
      .from("ingredients")
      .select("id, name, parent_ingredient_id, variant_sort_order")
      .order("name"),
    supabase
      .from("recipe_ingredients")
      .select(
        "id, recipe_id, ingredient_id, section_id, line_sort_order, amount, unit, preparation, display, is_optional, created_at, ingredients(id, name, density_g_per_ml, canonical_unit_weight_g)",
      )
      .eq("recipe_id", id),
    supabase
      .from("recipe_ingredient_sections")
      .select("id, recipe_id, heading, sort_order, created_at")
      .eq("recipe_id", id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("recipe_instruction_steps")
      .select(
        "id, recipe_id, step_number, text, timer_seconds_low, timer_seconds_high, created_at",
      )
      .eq("recipe_id", id)
      .order("step_number", { ascending: true }),
  ]);

  if (recipeIngredientsResult.error || sectionsResult.error) {
    return (
      <section className="grid is-empty">
        <p>
          {recipeIngredientsResult.error?.message ||
            sectionsResult.error?.message}
        </p>
      </section>
    );
  }

  // Load instruction steps, but never write-through the legacy migration for
  // community viewers — RLS would reject non-owners anyway, and we don't want
  // visitors triggering writes on other people's recipes. If the relational
  // table has rows, use them; otherwise, parse the legacy text blob purely
  // for display so older recipes still render instructions.
  const rawSteps = (instructionStepsResult.data ?? []) as {
    id: unknown;
    recipe_id: unknown;
    step_number: unknown;
    text: unknown;
    timer_seconds_low: unknown;
    timer_seconds_high: unknown;
    created_at?: string;
  }[];
  const mappedSteps = rawSteps.map((row): RecipeInstructionStepRow | null => {
    const id = Number(row.id);
    const recipe_id = Number(row.recipe_id);
    if (!Number.isFinite(id) || !Number.isFinite(recipe_id)) return null;
    const timerLow =
      row.timer_seconds_low == null ? null : Number(row.timer_seconds_low);
    const timerHigh =
      row.timer_seconds_high == null ? null : Number(row.timer_seconds_high);
    return {
      id,
      recipe_id,
      step_number: Number(row.step_number ?? 1) || 1,
      text: row.text == null ? "" : String(row.text),
      timer_seconds_low:
        typeof timerLow === "number" && Number.isFinite(timerLow)
          ? timerLow
          : null,
      timer_seconds_high:
        typeof timerHigh === "number" && Number.isFinite(timerHigh)
          ? timerHigh
          : null,
      created_at: row.created_at,
    };
  });
  let recipeInstructionSteps: RecipeInstructionStepRow[] = mappedSteps.filter(
    (row): row is RecipeInstructionStepRow => row != null,
  );

  if (recipeInstructionSteps.length === 0 && recipe.instructions) {
    const parsed = parseLegacyInstructionsToSteps(recipe.instructions);
    recipeInstructionSteps = parsed.map((text, idx) => ({
      id: -1 - idx,
      recipe_id: Number(recipe.id),
      step_number: idx + 1,
      text,
      timer_seconds_low: null,
      timer_seconds_high: null,
    }));
  }

  const availableIngredients = ((ingredientsResult.data ?? []) as Pick<
    IngredientRow,
    "id" | "name" | "parent_ingredient_id" | "variant_sort_order"
  >[]).map((ingredient) => ({
    id: Number(ingredient.id),
    name: String(ingredient.name ?? ""),
    parentIngredientId: ingredient.parent_ingredient_id
      ? Number(ingredient.parent_ingredient_id)
      : null,
    variantSortOrder: Number(ingredient.variant_sort_order ?? 0),
  }));

  const recipeIngredients: {
    id: number;
    recipe_id: number;
    ingredient_id: number;
    section_id: string | null;
    line_sort_order: number;
    amount: string | null;
    unit: string | null;
    preparation: string | null;
    display: string | null;
    is_optional: boolean;
    created_at?: string;
    ingredients: {
      id: number;
      name: string;
      density_g_per_ml: number | null;
      canonical_unit_weight_g: number | null;
    } | null;
  }[] = ((recipeIngredientsResult.data ?? []) as RawRecipeIngredientRow[]).map((row) => {
    const ingredient = Array.isArray(row.ingredients)
      ? row.ingredients[0] ?? null
      : row.ingredients ?? null;
    const sid = row.section_id;
    const opt = row.is_optional;
    const is_optional =
      opt === true || opt === 1 || opt === "true" || opt === "t";
    const densityRaw = ingredient?.density_g_per_ml;
    const densityNum = densityRaw == null ? null : Number(densityRaw);
    const density_g_per_ml =
      typeof densityNum === "number" && Number.isFinite(densityNum) && densityNum > 0
        ? densityNum
        : null;
    const pieceWeightRaw = ingredient?.canonical_unit_weight_g;
    const pieceWeightNum =
      pieceWeightRaw == null ? null : Number(pieceWeightRaw);
    const canonical_unit_weight_g =
      typeof pieceWeightNum === "number" &&
      Number.isFinite(pieceWeightNum) &&
      pieceWeightNum > 0
        ? pieceWeightNum
        : null;
    return {
      id: Number(row.id),
      recipe_id: Number(row.recipe_id),
      ingredient_id: Number(row.ingredient_id),
      section_id:
        sid === null || sid === undefined || String(sid).trim() === ""
          ? null
          : String(sid),
      line_sort_order: Number(row.line_sort_order ?? 0),
      amount: row.amount == null ? null : String(row.amount),
      unit: row.unit == null ? null : String(row.unit),
      preparation: row.preparation == null ? null : String(row.preparation),
      display: row.display == null ? null : String(row.display),
      is_optional,
      created_at: row.created_at,
      ingredients: ingredient
        ? {
            id: Number(ingredient.id),
            name: String(ingredient.name ?? ""),
            density_g_per_ml,
            canonical_unit_weight_g,
          }
        : null,
    };
  });

  const recipeIngredientSections: RecipeIngredientSectionRow[] = (
    (sectionsResult.data ?? []) as {
      id: unknown;
      recipe_id: unknown;
      heading: unknown;
      sort_order: unknown;
      created_at?: string;
    }[]
  ).map((row) => ({
    id: String(row.id),
    recipe_id: Number(row.recipe_id),
    heading: row.heading == null ? "" : String(row.heading),
    sort_order: Number(row.sort_order ?? 0),
    created_at: row.created_at,
  }));

  return (
    <RecipeDetailEditor
      key={recipe.id}
      recipe={recipe}
      recipeIngredients={recipeIngredients}
      recipeIngredientSections={recipeIngredientSections}
      recipeInstructionSteps={recipeInstructionSteps}
      availableIngredients={availableIngredients}
      viewOnly
      asideActionSlot={
        <CommunitySaveActions
          recipeId={recipe.id}
          inLibrary={inLibrary}
          isSignedIn={!!user}
        />
      }
    />
  );
}
