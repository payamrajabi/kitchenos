import type {
  RecipeRow,
  RecipeInstructionStepRow,
} from "@/types/database";
import type { GroupedIngredientBucket } from "./grouped-ingredients";
import { VOICE_TOOL_NAMES } from "./agent-config";

type BuildArgs = {
  recipe: RecipeRow;
  groupedIngredients: GroupedIngredientBucket[];
  instructionSteps: RecipeInstructionStepRow[];
  /** Display-only servings multiplier the viewer is currently using. */
  servingsScale: number;
  baseServings: number | null;
};

function fmtAmount(amount: string | null, scale: number): string | null {
  if (!amount) return null;
  const trimmed = amount.trim();
  if (!trimmed) return null;
  if (Math.abs(scale - 1) < 0.001) return trimmed;
  const asNum = Number(trimmed);
  if (Number.isFinite(asNum)) {
    const scaled = asNum * scale;
    return Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(2);
  }
  return trimmed;
}

function fmtTimer(low: number | null | undefined, high: number | null | undefined): string | null {
  if ((low == null || low <= 0) && (high == null || high <= 0)) return null;
  const lo = low ?? high ?? 0;
  const hi = high ?? lo;
  const loMin = Math.round(lo / 60);
  const hiMin = Math.round(hi / 60);
  if (loMin === hiMin) return `${loMin} min`;
  return `${loMin}-${hiMin} min`;
}

/**
 * Assembles the per-session system prompt the ElevenLabs agent runs against.
 * The recipe is laid out twice — first as a smart-grouped ingredient list
 * for the gathering phase, then as a numbered instruction list for the
 * cooking phase — so the agent never has to invent ordering on the fly.
 */
export function buildVoiceSystemPrompt({
  recipe,
  groupedIngredients,
  instructionSteps,
  servingsScale,
  baseServings,
}: BuildArgs): string {
  const recipeName = (recipe.name ?? "this recipe").trim();
  const yieldLine = recipe.yield_display
    ? recipe.yield_display.trim()
    : baseServings != null
      ? `Serves ${Math.round(baseServings * servingsScale)}`
      : null;
  const scaleLine =
    Math.abs(servingsScale - 1) > 0.001 && baseServings != null
      ? `The viewer is cooking ${servingsScale.toFixed(servingsScale % 1 === 0 ? 0 : 2)}× the original (${Math.round(baseServings * servingsScale)} servings instead of ${baseServings}). All ingredient amounts below already reflect that scaling.`
      : null;

  const ingredientLines: string[] = [];
  for (const bucket of groupedIngredients) {
    ingredientLines.push(`# ${bucket.category}`);
    for (const line of bucket.lines) {
      const amount = fmtAmount(line.amount, servingsScale);
      const parts = [
        `id=${line.recipeIngredientId}`,
        amount ? `amount="${amount}${line.unit ? " " + line.unit : ""}"` : null,
        `name="${line.name}"`,
        line.preparation ? `prep="${line.preparation}"` : null,
        line.sectionHeading ? `section="${line.sectionHeading}"` : null,
        line.isOptional ? "optional=true" : null,
        line.inStock ? "in_stock=true" : "in_stock=false",
      ].filter(Boolean);
      ingredientLines.push("- " + parts.join(", "));
    }
  }

  const stepLines = instructionSteps
    .slice()
    .sort((a, b) => a.step_number - b.step_number)
    .map((step) => {
      const timer = fmtTimer(step.timer_seconds_low, step.timer_seconds_high);
      const heading = step.heading?.trim();
      const meta = [
        `step=${step.step_number}`,
        heading ? `heading="${heading}"` : null,
        timer ? `timer=${timer}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      return `- ${meta}\n  ${step.text.trim().replace(/\s+/g, " ")}`;
    });

  return [
    "You are a calm, hands-free cooking companion guiding the user through a single recipe.",
    "The user is in their kitchen with their phone on the counter. They cannot look at the screen and they cannot tap anything — they speak, you respond. Keep responses short, warm, and conversational. One or two sentences at a time. Plain spoken English, no markdown, no code blocks, no lists, no headings.",
    "",
    `RECIPE: ${recipeName}${yieldLine ? ` — ${yieldLine}` : ""}`,
    scaleLine ? `\n${scaleLine}` : "",
    "",
    "FLOW",
    "Phase 1 — Gathering. Walk the user through the ingredients in the exact order they appear in the GATHER list below. For each line:",
    `  • Call ${VOICE_TOOL_NAMES.setFocus}({ kind: "ingredient", recipeIngredientId: <id> }) the moment you START announcing it.`,
    "  • Read it naturally — \"two cloves of garlic, minced\" — including any prep note. If the line is marked in_stock=true you can say \"you've already got\" or skip the where-to-find hint; if false, gently mention it (e.g. \"grab the buttermilk from the fridge\").",
    "  • Then PAUSE and wait for the user. Treat any short affirmative — \"got it\", \"ok\", \"yep\", \"next\", \"done\" — as the signal to advance. If they ask a question, answer it briefly and only advance when they say so.",
    "  • When the last ingredient is done, confirm they're ready to start cooking, and call set_phase({ phase: \"cooking\" }) only after they say yes.",
    "Phase 2 — Cooking. Walk the user through the steps in numerical order. For each step:",
    `  • Call ${VOICE_TOOL_NAMES.setFocus}({ kind: "step", stepNumber: <n> }) the moment you START reading it.`,
    "  • Read the step naturally. If it has a timer, tell the user about it and offer to start it. If they say yes, call start_step_timer({ stepNumber: <n> }) — the app will tell you when the timer finishes via a system note that begins with \"[timer]\".",
    "  • Pause. Advance only on an affirmative.",
    "Phase 3 — Wrap-up. After the last step, call set_phase({ phase: \"wrapping_up\" }), congratulate them briefly, and stay available for one or two more questions before they end the session.",
    "",
    "RULES",
    `  • Always call ${VOICE_TOOL_NAMES.setFocus} BEFORE you say what's on that line, so the screen highlights match what you're saying.`,
    "  • While answering free-form questions or recapping, set kind=\"none\" so nothing is mis-highlighted.",
    "  • Never read more than one ingredient or one step at a time. The user wants to keep their hands free, not memorize a list.",
    "  • If the user goes quiet for a while, do NOT prompt them again. They're cooking. Wait.",
    "  • If the user reports something useful (substitution, ran out of something, skipped a step), call note_user_action with a short detail, then continue.",
    "  • You may answer cooking questions: substitutions, technique (\"what's a chiffonade?\"), how-much-of-X recaps, or troubleshooting (\"I burned the garlic\"). Be practical. If you don't know, say so.",
    "  • Do not invent ingredient amounts, units, or step numbers that aren't in the lists below. The lists are authoritative.",
    "  • Do not call end_voice_mode unless the user clearly tells you to stop or you're sure they're finished. Always confirm verbally first.",
    "",
    "GATHER (smart-grouped order — read top to bottom):",
    ingredientLines.length > 0 ? ingredientLines.join("\n") : "(no ingredients listed)",
    "",
    "COOK (read in numeric order):",
    stepLines.length > 0 ? stepLines.join("\n") : "(no instructions listed)",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function voiceFirstMessage(recipeName: string | null | undefined): string {
  const name = (recipeName ?? "").trim();
  return name
    ? `Hi! I'll walk you through ${name} hands-free. Ready to start gathering ingredients? Just say "let's go" when you are.`
    : `Hi! I'll walk you through this recipe hands-free. Ready to start gathering ingredients? Just say "let's go" when you are.`;
}
