import type { RecipeDetailPayload } from "@/lib/load-recipe-detail";

/**
 * Plain-text snapshot of a recipe for LLM refinement (not shown in UI).
 */
export function serializeRecipeDetailForRefinement(
  data: RecipeDetailPayload,
): string {
  const { recipe, recipeIngredients, recipeIngredientSections, recipeInstructionSteps } =
    data;

  const primary =
    (recipe.title_primary && String(recipe.title_primary).trim()) ||
    String(recipe.name ?? "").trim() ||
    "Untitled";
  const qualifier =
    recipe.title_primary && String(recipe.title_primary).trim()
      ? String(recipe.title_qualifier ?? "").trim()
      : "";
  const lines: string[] = [];
  lines.push(`TITLE: ${qualifier ? `${primary} ${qualifier}` : primary}`);
  if (recipe.headnote?.trim()) lines.push(`HEADNOTE:\n${recipe.headnote.trim()}`);
  if (recipe.description?.trim())
    lines.push(`DESCRIPTION:\n${recipe.description.trim()}`);
  if (recipe.yield_display?.trim())
    lines.push(`YIELD: ${recipe.yield_display.trim()}`);
  else if (recipe.servings != null)
    lines.push(`SERVINGS: ${recipe.servings}`);
  if (recipe.prep_time_minutes != null)
    lines.push(`PREP_MINUTES: ${recipe.prep_time_minutes}`);
  if (recipe.cook_time_minutes != null)
    lines.push(`COOK_MINUTES: ${recipe.cook_time_minutes}`);
  if (recipe.meal_types?.length)
    lines.push(`MEAL_TYPES: ${recipe.meal_types.join(", ")}`);
  if (recipe.notes?.trim()) {
    const noteLabel = recipe.notes_title?.trim() || "Note";
    lines.push(`NOTE (${noteLabel}):\n${recipe.notes.trim()}`);
  }
  if (recipe.source_url?.trim()) lines.push(`SOURCE_URL: ${recipe.source_url.trim()}`);

  const sortedSections = [...recipeIngredientSections].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const unsectioned: typeof recipeIngredients = [];
  const bySection = new Map<string, typeof recipeIngredients>();
  for (const line of recipeIngredients) {
    const sid = line.section_id;
    if (!sid) {
      unsectioned.push(line);
      continue;
    }
    const arr = bySection.get(sid) ?? [];
    arr.push(line);
    bySection.set(sid, arr);
  }

  lines.push("");
  lines.push("INGREDIENTS:");
  const emitLines = (items: typeof recipeIngredients) => {
    const sorted = [...items].sort(
      (a, b) => a.line_sort_order - b.line_sort_order,
    );
    for (const ri of sorted) {
      const name = ri.ingredients?.name?.trim() ?? "?";
      const amt = [ri.amount, ri.unit].filter(Boolean).join(" ").trim();
      const prep = ri.preparation?.trim();
      const opt = ri.is_optional ? " (optional)" : "";
      lines.push(
        `- ${amt ? `${amt} ` : ""}${name}${prep ? `, ${prep}` : ""}${opt}`,
      );
    }
  };

  for (const sec of sortedSections) {
    const items = bySection.get(sec.id) ?? [];
    if (!items.length) continue;
    lines.push("");
    lines.push(`[${sec.heading || "Section"}]`);
    emitLines(items);
  }
  if (unsectioned.length) {
    if (sortedSections.length) lines.push("");
    emitLines(unsectioned);
  }

  lines.push("");
  lines.push("INSTRUCTIONS:");
  const steps = [...recipeInstructionSteps].sort(
    (a, b) => a.step_number - b.step_number,
  );
  for (const s of steps) {
    const h = s.heading?.trim();
    const body = s.text?.trim() ?? "";
    lines.push(`${s.step_number}. ${h ? `[${h}] ` : ""}${body}`);
  }

  return lines.join("\n");
}
