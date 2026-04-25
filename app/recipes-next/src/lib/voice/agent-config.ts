// Single source of truth for the ElevenLabs Conversational AI agent setup.
// The session-level system prompt is generated per recipe at runtime (see
// `build-system-prompt.ts`); this file describes everything that can NOT be
// overridden per session and so must be configured once in the ElevenLabs
// dashboard:
//
//   1. The five client-tool definitions (name + description + parameter schema)
//   2. The default voice + voice settings
//   3. A baseline system prompt to use when no session override is supplied
//
// Treat this file as documentation — when the agent's setup changes, update
// here so the dashboard and code stay aligned.

export const VOICE_TOOL_NAMES = {
  setFocus: "set_focus",
  setPhase: "set_phase",
  startStepTimer: "start_step_timer",
  endVoiceMode: "end_voice_mode",
  noteUserAction: "note_user_action",
} as const;

export type VoiceToolName = (typeof VOICE_TOOL_NAMES)[keyof typeof VOICE_TOOL_NAMES];

// JSON Schema definitions to paste into the ElevenLabs agent's "Client Tools"
// section. Description lines double as instructions to the LLM, so they're
// written in the imperative second person.
export const VOICE_TOOL_DEFINITIONS = [
  {
    name: VOICE_TOOL_NAMES.setFocus,
    description:
      "Tell the on-screen recipe which line is currently being walked through. " +
      "Call this every time you start announcing a new ingredient (during the " +
      "gathering phase) or a new step (during cooking). Pass kind='none' " +
      "while you're answering a free-form question, recapping, or paused.",
    parameters: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["ingredient", "step", "none"],
          description: "Which kind of recipe element to highlight.",
        },
        recipeIngredientId: {
          type: "number",
          description:
            "Required when kind='ingredient'. Use the id from the ingredient " +
            "list provided in the system prompt.",
        },
        stepNumber: {
          type: "number",
          description:
            "Required when kind='step'. The 1-based step_number from the " +
            "instruction list provided in the system prompt.",
        },
      },
      required: ["kind"],
    },
  },
  {
    name: VOICE_TOOL_NAMES.setPhase,
    description:
      "Move the conversation between phases. Call this exactly when you " +
      "transition: 'gathering' for the ingredient walkthrough, 'cooking' " +
      "once the user is ready to start the steps, and 'wrapping_up' once " +
      "the last step is finished and you're saying goodbye.",
    parameters: {
      type: "object",
      properties: {
        phase: {
          type: "string",
          enum: ["gathering", "cooking", "wrapping_up"],
        },
      },
      required: ["phase"],
    },
  },
  {
    name: VOICE_TOOL_NAMES.startStepTimer,
    description:
      "Start the kitchen timer attached to a specific cooking step. Only " +
      "valid for steps that include a timer in the system prompt. The app " +
      "will count down and tell you when it finishes so you can announce it " +
      "to the user.",
    parameters: {
      type: "object",
      properties: {
        stepNumber: {
          type: "number",
          description: "1-based step_number to start the timer for.",
        },
      },
      required: ["stepNumber"],
    },
  },
  {
    name: VOICE_TOOL_NAMES.endVoiceMode,
    description:
      "End the voice session entirely. Call this when the user clearly says " +
      "they're done, want to stop, or the recipe is finished and they've " +
      "thanked you off. Always confirm verbally before calling.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: VOICE_TOOL_NAMES.noteUserAction,
    description:
      "Optional logging hook for the app. Call this if the user reports " +
      "something the app might want to act on later — e.g. 'I'm out of " +
      "garlic'. Returns immediately; the app may or may not do anything " +
      "with it.",
    parameters: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["out_of_stock", "substitution_made", "step_skipped", "other"],
        },
        detail: { type: "string" },
      },
      required: ["kind", "detail"],
    },
  },
] as const;

// Baseline prompt — used as the agent's default system prompt in the
// dashboard. The runtime per-recipe prompt overrides this entirely; this
// version only fires if the session forgets to supply an override.
export const VOICE_AGENT_BASELINE_PROMPT = `You are a calm, hands-free cooking companion. The user is in their kitchen
and cannot look at the screen — answer in short, plain spoken English. The app
will inject a recipe-specific prompt on every session; if that's missing, ask
the user what recipe they want to cook and politely note that you can't help
without it.`;
