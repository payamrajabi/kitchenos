import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type MealPlanBody = {
  mode: "meal_plan";
  model?: string;
  week_start: string;
  inventory_summary?: string;
  recipe_titles?: string[];
  people_notes?: string;
};

type SuggestionGap = {
  /** YYYY-MM-DD */
  date: string;
  /** One of: breakfast | snack_am | lunch | snack_pm | dinner | dessert */
  slot_key: string;
};

type LibraryRecipeHint = {
  title: string;
  /** Canonical meal_types tagged on the recipe. */
  meal_types?: string[];
};

type WeeklySuggestionsBody = {
  mode: "weekly_suggestions";
  model?: string;
  /** Gaps the server wants candidates for. */
  gaps: SuggestionGap[];
  /** Recipes from the user's library, with their meal_types for routing. */
  library_recipes: LibraryRecipeHint[];
  /** Meals already placed in the look-around window (for no-repeat rule). */
  placed_meals: Array<{
    date: string;
    slot_key: string;
    label: string | null;
  }>;
  /** Dietary notes from `people`. */
  people_notes?: string;
  /** Pantry snapshot. */
  inventory_summary?: string;
  /** Natural-language rule block from rules.ts. */
  rules_block: string;
  /** How many candidates to return per gap (active + pool). */
  candidates_per_gap?: number;
};

type RequestBody = MealPlanBody | WeeklySuggestionsBody;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

  if (!openaiKey) {
    return new Response(
      JSON.stringify({ error: "Server missing OPENAI_API_KEY" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const model =
    (body as { model?: string }).model?.trim() || "gpt-4o-mini";

  try {
    if (body.mode === "meal_plan") {
      const content = await callOpenAiJson(openaiKey, model, [
        {
          role: "system",
          content: `You are a meal planning assistant. Return JSON only with this shape:
{
  "days": [
    {
      "date": "YYYY-MM-DD (must be within the week starting week_start)",
      "meals": [
        { "meal_slot": "breakfast|lunch|dinner|snack|other", "label": "short title", "recipe_hint": "optional recipe name or null", "notes": "optional" }
      ]
    }
  ],
  "shopping_suggestions": ["optional strings"]
}
Use 7 days from week_start. Respect dietary notes. Prefer variety.`,
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              week_start: body.week_start,
              inventory_summary: body.inventory_summary ?? "",
              recipe_titles: body.recipe_titles ?? [],
              people_notes: body.people_notes ?? "",
            },
            null,
            2
          ),
        },
      ]);
      return new Response(JSON.stringify({ result: JSON.parse(content) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.mode === "weekly_suggestions") {
      const perGap = Math.max(1, Math.min(8, body.candidates_per_gap ?? 4));
      const content = await callOpenAiJson(openaiKey, model, [
        {
          role: "system",
          content: `You are the meal-planning assistant for a home cooking app. Your job is to fill empty slots on a rolling 7-day calendar with food suggestions the household will actually enjoy.

RULES (follow every one):
${body.rules_block}

OUTPUT FORMAT — return JSON only with this exact shape:
{
  "slots": [
    {
      "date": "YYYY-MM-DD",
      "slot_key": "breakfast|snack_am|lunch|snack_pm|dinner|dessert",
      "candidates": [
        {
          "recipe_title": "exact title from library_recipes if using one, else null",
          "label": "short human title to display on the card",
          "notes": "optional short note, or null"
        }
      ]
    }
  ]
}

For EACH gap in the input, return exactly ${perGap} candidate(s) ordered best-first. Strongly prefer titles from library_recipes (match EXACTLY, including capitalisation, if the recipe's meal_types fit the slot). Only propose label-only ideas (recipe_title=null) when no library recipe fits. Consider placed_meals when applying the no-repeat rule. Respect dietary notes and allergies. Prefer variety across the week.`,
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              gaps: body.gaps,
              library_recipes: body.library_recipes,
              placed_meals: body.placed_meals,
              people_notes: body.people_notes ?? "",
              inventory_summary: body.inventory_summary ?? "",
              candidates_per_gap: perGap,
            },
            null,
            2,
          ),
        },
      ]);
      return new Response(JSON.stringify({ result: JSON.parse(content) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown mode" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "OpenAI request failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function callOpenAiJson(
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[]
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty model response");
  return content;
}
