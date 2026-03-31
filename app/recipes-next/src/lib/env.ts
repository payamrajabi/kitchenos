export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !key) return false;
  if (url.includes("YOUR_PROJECT") || key.includes("YOUR_ANON_KEY")) return false;
  return true;
}

export function recipeImagesBucket(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_RECIPE_BUCKET ?? "recipe-images";
}
