import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { CommunityRecipeDetail } from "@/components/community-recipe-detail";
import type { RecipeRow, RecipeIngredientSectionRow } from "@/types/database";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!isSupabaseConfigured()) return { title: "Community Recipe" };
  const supabase = await createClient();
  const { data } = await supabase
    .from("recipes")
    .select("name")
    .eq("id", id)
    .eq("is_published_to_community", true)
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

  if (!user) {
    return (
      <section className="grid is-empty">
        <p>Sign in to view community recipes.</p>
      </section>
    );
  }

  const [recipeResult, ingredientsResult, sectionsResult] = await Promise.all([
    supabase
      .from("recipes")
      .select("*")
      .eq("id", id)
      .eq("is_published_to_community", true)
      .maybeSingle(),
    supabase
      .from("recipe_ingredients")
      .select(
        "id, recipe_id, ingredient_id, section_id, line_sort_order, amount, unit, is_optional, ingredients(id, name)",
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

  const recipe = recipeResult.data as RecipeRow;
  const isOwn = recipe.owner_id === user.id;

  const { data: alreadySaved } = await supabase
    .from("recipes")
    .select("id")
    .eq("owner_id", user.id)
    .eq("community_source_recipe_id", recipe.id)
    .limit(1)
    .maybeSingle();

  type RawIngLine = {
    id: unknown;
    recipe_id: unknown;
    ingredient_id: unknown;
    section_id: unknown;
    line_sort_order: unknown;
    amount: unknown;
    unit: unknown;
    is_optional?: unknown;
    ingredients:
      | { id: unknown; name: unknown }
      | { id: unknown; name: unknown }[]
      | null;
  };

  const recipeIngredients = (
    (ingredientsResult.data ?? []) as RawIngLine[]
  ).map((row) => {
    const ing = Array.isArray(row.ingredients)
      ? row.ingredients[0] ?? null
      : row.ingredients ?? null;
    const opt = row.is_optional;
    return {
      id: Number(row.id),
      name: ing ? String(ing.name ?? "") : "",
      amount: row.amount == null ? null : String(row.amount),
      unit: row.unit == null ? null : String(row.unit),
      is_optional:
        opt === true || opt === 1 || opt === "true" || opt === "t",
      section_id:
        row.section_id == null ? null : String(row.section_id),
      line_sort_order: Number(row.line_sort_order ?? 0),
    };
  });

  const sections: RecipeIngredientSectionRow[] = (
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
    <CommunityRecipeDetail
      recipe={recipe}
      recipeIngredients={recipeIngredients}
      sections={sections}
      alreadySaved={!!alreadySaved}
      isOwn={isOwn}
    />
  );
}
