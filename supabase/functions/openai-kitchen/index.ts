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

type RequestBody = MealPlanBody;

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
