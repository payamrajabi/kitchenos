import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { RecipeDetailEditor } from "@/components/recipe-detail-editor";
import type { IngredientRow, RecipeIngredientSectionRow, RecipeRow } from "@/types/database";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

type RawRecipeIngredientRow = {
  id: unknown;
  recipe_id: unknown;
  ingredient_id: unknown;
  section_id: unknown;
  line_sort_order: unknown;
  amount: unknown;
  unit: unknown;
  created_at?: string;
  ingredients:
    | {
        id: unknown;
        name: unknown;
      }
    | {
        id: unknown;
        name: unknown;
      }[]
    | null;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!isSupabaseConfigured()) {
    return { title: "Recipe" };
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("recipes")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  const row = data as { name: string } | null;
  if (!row?.name) return { title: "Recipe" };
  return { title: row.name, description: `Recipe: ${row.name}` };
}

export default async function RecipeDetailPage({ params }: Props) {
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
      supabase.from("ingredients").select("id, name").order("name"),
      supabase
        .from("recipe_ingredients")
        .select(
          "id, recipe_id, ingredient_id, section_id, line_sort_order, amount, unit, created_at, ingredients(id, name)",
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

  const r = recipeResult.data as RecipeRow;
  const availableIngredients = ((ingredientsResult.data ?? []) as Pick<
    IngredientRow,
    "id" | "name"
  >[]).map((ingredient) => ({
    id: Number(ingredient.id),
    name: String(ingredient.name ?? ""),
  }));
  const recipeIngredients: {
    id: number;
    recipe_id: number;
    ingredient_id: number;
    section_id: string | null;
    line_sort_order: number;
    amount: string | null;
    unit: string | null;
    created_at?: string;
    ingredients: { id: number; name: string } | null;
  }[] = ((recipeIngredientsResult.data ?? []) as RawRecipeIngredientRow[]).map((row) => {
    const ingredient = Array.isArray(row.ingredients)
      ? row.ingredients[0] ?? null
      : row.ingredients ?? null;
    const sid = row.section_id;
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
      created_at: row.created_at,
      ingredients: ingredient
        ? {
            id: Number(ingredient.id),
            name: String(ingredient.name ?? ""),
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
        availableIngredients={availableIngredients}
      />
    </>
  );
}
