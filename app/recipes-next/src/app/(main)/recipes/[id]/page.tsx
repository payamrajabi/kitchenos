import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { RecipeDetailEditor } from "@/components/recipe-detail-editor";
import { recipeDescriptionPlainSnippet } from "@/lib/recipe-description-links";
import { loadRecipeInstructionStepsWithLegacyMigration } from "@/lib/recipe-instruction-steps-migrate";
import type { IngredientRow, RecipeIngredientSectionRow, RecipeRow } from "@/types/database";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type RawIngredientJoin = {
  id: unknown;
  name: unknown;
  density_g_per_ml?: unknown;
};

type RawRecipeIngredientRow = {
  id: unknown;
  recipe_id: unknown;
  ingredient_id: unknown;
  section_id: unknown;
  line_sort_order: unknown;
  amount: unknown;
  unit: unknown;
  is_optional?: unknown;
  created_at?: string;
  ingredients: RawIngredientJoin | RawIngredientJoin[] | null;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!isSupabaseConfigured()) {
    return { title: "Recipe" };
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("recipes")
    .select("name, description")
    .eq("id", id)
    .maybeSingle();
  const row = data as { name: string; description?: string | null } | null;
  if (!row?.name) return { title: "Recipe" };
  const descPlain = row.description?.trim()
    ? recipeDescriptionPlainSnippet(row.description)
    : "";
  const metaDesc = descPlain || `Recipe: ${row.name}`;
  return {
    title: row.name,
    description:
      metaDesc.length > 160 ? `${metaDesc.slice(0, 157)}…` : metaDesc,
  };
}

export default async function RecipeDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const genParam = sp.gen;
  const autoGenerating =
    (Array.isArray(genParam) ? genParam[0] : genParam) === "1";

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
  if (!user) {
    return (
      <section className="grid is-empty">
        <p>Sign in to view this recipe.</p>
      </section>
    );
  }

  const [recipeResult, ingredientsResult, recipeIngredientsResult, sectionsResult] =
    await Promise.all([
      supabase.from("recipes").select("*").eq("id", id).maybeSingle(),
      supabase.from("ingredients").select("id, name, parent_ingredient_id, variant_sort_order").order("name"),
      supabase
        .from("recipe_ingredients")
        .select(
          "id, recipe_id, ingredient_id, section_id, line_sort_order, amount, unit, is_optional, created_at, ingredients(id, name, density_g_per_ml)",
        )
        .eq("recipe_id", id),
      supabase
        .from("recipe_ingredient_sections")
        .select("id, recipe_id, title, sort_order, created_at")
        .eq("recipe_id", id)
        .order("sort_order", { ascending: true }),
    ]);

  if (recipeResult.error || !recipeResult.data) {
    notFound();
  }

  const rForAccess = recipeResult.data as RecipeRow;
  // Non-owners see the read-only community view. Owners who soft-deleted their
  // own recipe also get pushed to that view (which handles the tombstone).
  if (rForAccess.owner_id !== user.id || rForAccess.deleted_at) {
    redirect(`/community/${id}`);
  }

  if (
    ingredientsResult.error ||
    recipeIngredientsResult.error ||
    sectionsResult.error
  ) {
    return (
      <section className="grid is-empty">
        <p>
          {ingredientsResult.error?.message ||
            recipeIngredientsResult.error?.message ||
            sectionsResult.error?.message}
        </p>
      </section>
    );
  }

  const r = rForAccess;

  const recipeInstructionSteps = await loadRecipeInstructionStepsWithLegacyMigration(
    supabase,
    Number(r.id),
    r.instructions,
  );

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
    is_optional: boolean;
    created_at?: string;
    ingredients: {
      id: number;
      name: string;
      density_g_per_ml: number | null;
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
      is_optional,
      created_at: row.created_at,
      ingredients: ingredient
        ? {
            id: Number(ingredient.id),
            name: String(ingredient.name ?? ""),
            density_g_per_ml,
          }
        : null,
    };
  });

  const recipeIngredientSections: RecipeIngredientSectionRow[] = (
    (sectionsResult.data ?? []) as {
      id: unknown;
      recipe_id: unknown;
      title: unknown;
      sort_order: unknown;
      created_at?: string;
    }[]
  ).map((row) => ({
    id: String(row.id),
    recipe_id: Number(row.recipe_id),
    title: row.title == null ? "" : String(row.title),
    sort_order: Number(row.sort_order ?? 0),
    created_at: row.created_at,
  }));

  return (
    <>
      <RecipeDetailEditor
        key={`${r.id}-${r.updated_at ?? r.created_at ?? ""}`}
        recipe={r}
        recipeIngredients={recipeIngredients}
        recipeIngredientSections={recipeIngredientSections}
        recipeInstructionSteps={recipeInstructionSteps}
        availableIngredients={availableIngredients}
        autoGenerating={autoGenerating}
      />
    </>
  );
}
