/**
 * One-time backfill: generate short action-led headings for every
 * recipe_instruction_steps row that doesn't have one yet.
 *
 * Reads rows where heading IS NULL, groups them by recipe, sends the ordered
 * step texts to the same LLM used during import, and writes headings back.
 *
 * Safe to re-run — only touches NULL rows. Uses the same Supabase project
 * as the app by reading NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * from the environment.
 *
 * Run locally:
 *   yarn tsx scripts/backfill-instruction-headings.ts
 *
 * The script prints progress per recipe and a final summary. If any recipe
 * fails, the script continues with the rest and reports the failures at the
 * end with non-zero exit code.
 */

import { createClient } from "@supabase/supabase-js";

type StepRow = {
  id: number;
  recipe_id: number;
  step_number: number;
  text: string;
};

const BACKFILL_MODEL = "gpt-4o";
const BACKFILL_TIMEOUT_MS = 45_000;
const MAX_HEADING_LEN = 60;

const SYSTEM_PROMPT = `You write short, action-led section headings for cooking recipe steps.

Given the full ordered list of instruction steps for a single recipe, return a JSON array of headings — one per step, in order — that summarises what each step is doing.

Requirements for each heading:
- 2-5 words.
- Imperative voice, action-led ("Brown the Tempeh", "Cook the Shiitake", "Scramble the Eggs", "Fry the Rice", "Season", "Finish").
- AP-style Title Case.
- Summarises the intent of the step, not its details. Do NOT repeat the full instruction. Do NOT include quantities or times.
- Must be distinct from the step text itself — never copy the sentence.
- Never empty. Every step must get a heading.

Return ONLY valid JSON with this exact shape:

{ "headings": ["Brown the Tempeh", "Cook the Shiitake", ...] }

The length of "headings" MUST equal the number of steps supplied. No extra keys. No markdown. No explanation.`;

function requiredEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

function truncateHeading(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  return s.slice(0, MAX_HEADING_LEN);
}

async function generateHeadingsForRecipe(
  apiKey: string,
  steps: StepRow[],
): Promise<string[]> {
  const userContent = JSON.stringify({
    steps: steps.map((s) => ({
      step_number: s.step_number,
      text: s.text,
    })),
  });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: BACKFILL_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
    signal: AbortSignal.timeout(BACKFILL_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI API error (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error("No response from the AI model.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Could not parse AI response as JSON.");
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    !Array.isArray((parsed as { headings?: unknown }).headings)
  ) {
    throw new Error("AI response missing a 'headings' array.");
  }

  const headings = (parsed as { headings: unknown[] }).headings;
  if (headings.length !== steps.length) {
    throw new Error(
      `AI returned ${headings.length} headings for ${steps.length} steps.`,
    );
  }

  return headings.map((h) => {
    const t = truncateHeading(h);
    if (!t) throw new Error("AI returned a blank heading.");
    return t;
  });
}

async function main() {
  const SUPABASE_URL = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const OPENAI_API_KEY = requiredEnv("OPENAI_API_KEY");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log("Loading instruction steps with no heading…");
  const { data: rawRows, error: selErr } = await supabase
    .from("recipe_instruction_steps")
    .select("id, recipe_id, step_number, text")
    .is("heading", null)
    .order("recipe_id", { ascending: true })
    .order("step_number", { ascending: true });

  if (selErr) {
    console.error("Could not read instruction steps:", selErr.message);
    process.exit(1);
  }

  const rows: StepRow[] = (rawRows ?? []).map((r) => ({
    id: Number((r as { id: unknown }).id),
    recipe_id: Number((r as { recipe_id: unknown }).recipe_id),
    step_number: Number((r as { step_number: unknown }).step_number ?? 1),
    text: String((r as { text: unknown }).text ?? ""),
  }));

  if (rows.length === 0) {
    console.log("Nothing to backfill. All steps already have a heading.");
    return;
  }

  const byRecipe = new Map<number, StepRow[]>();
  for (const r of rows) {
    const list = byRecipe.get(r.recipe_id) ?? [];
    list.push(r);
    byRecipe.set(r.recipe_id, list);
  }

  console.log(
    `Found ${rows.length} step(s) across ${byRecipe.size} recipe(s) without a heading.`,
  );

  const failures: { recipeId: number; error: string }[] = [];
  let recipesProcessed = 0;
  let stepsUpdated = 0;

  for (const [recipeId, steps] of byRecipe) {
    steps.sort((a, b) => a.step_number - b.step_number);
    recipesProcessed += 1;
    const label = `[recipe ${recipeId} — ${steps.length} step(s)] (${recipesProcessed}/${byRecipe.size})`;
    try {
      const headings = await generateHeadingsForRecipe(OPENAI_API_KEY, steps);

      for (let i = 0; i < steps.length; i += 1) {
        const step = steps[i];
        const heading = headings[i];
        const { error: upErr } = await supabase
          .from("recipe_instruction_steps")
          .update({ heading })
          .eq("id", step.id);
        if (upErr) throw new Error(`Step ${step.id} update: ${upErr.message}`);
        stepsUpdated += 1;
      }
      console.log(`${label} ok`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${label} failed: ${message}`);
      failures.push({ recipeId, error: message });
    }
  }

  console.log("\n--- Backfill summary ---");
  console.log(`Recipes processed : ${recipesProcessed}`);
  console.log(`Steps updated     : ${stepsUpdated}`);
  console.log(`Failures          : ${failures.length}`);
  if (failures.length > 0) {
    for (const f of failures) {
      console.log(`  - recipe ${f.recipeId}: ${f.error}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
