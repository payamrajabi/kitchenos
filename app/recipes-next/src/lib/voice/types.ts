// Shared types for the recipe voice mode. The voice agent (ElevenLabs
// Conversational AI) calls into the browser via "client tools" — small
// functions our React tree exposes to the running session. Those tools mostly
// keep the on-screen recipe in sync with what the agent is saying. The
// agent's tool schemas are configured in the ElevenLabs dashboard; the
// matching handler shape lives here so both ends stay aligned.

export type VoicePhase = "idle" | "gathering" | "cooking" | "wrapping_up";

export type VoiceFocus =
  // While walking through ingredients, focus is on a single recipe ingredient
  // line so the UI can highlight it and auto-scroll into view.
  | { kind: "ingredient"; recipeIngredientId: number }
  // While walking through cooking steps, focus is on a single instruction
  // step (1-based step number — what the LLM speaks about).
  | { kind: "step"; stepNumber: number }
  // The agent is answering a question, recapping, or pausing — no specific
  // line should be highlighted.
  | { kind: "none" };

export type VoiceModeState = {
  isActive: boolean;
  phase: VoicePhase;
  focus: VoiceFocus;
  isSpeaking: boolean;
  isListening: boolean;
  isMuted: boolean;
  // True between the moment the user taps the entry FAB and when ElevenLabs
  // confirms the session is live. Used to show a connecting state.
  isConnecting: boolean;
  // When the SDK reports an error during the session lifecycle we surface
  // it through the provider so the FAB can announce something useful.
  error: string | null;
};
