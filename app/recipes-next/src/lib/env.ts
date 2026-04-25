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

// Voice mode (ElevenLabs Conversational AI). Server-side: ELEVENLABS_API_KEY +
// ELEVENLABS_AGENT_ID are required to mint signed URLs. Client-side: a public
// flag is exposed so the entry FAB can hide itself entirely when voice mode
// hasn't been configured yet, instead of failing at session start.
export function isVoiceModeConfiguredServer(): boolean {
  const key = process.env.ELEVENLABS_API_KEY ?? "";
  const agentId = process.env.ELEVENLABS_AGENT_ID ?? "";
  if (!key || !agentId) return false;
  if (key.includes("YOUR_") || agentId.includes("YOUR_")) return false;
  return true;
}

export function isVoiceModeConfiguredClient(): boolean {
  return (process.env.NEXT_PUBLIC_VOICE_MODE_ENABLED ?? "").toLowerCase() === "true";
}

export function elevenLabsVoiceIdOverride(): string | null {
  const id = (process.env.ELEVENLABS_VOICE_ID ?? "").trim();
  return id ? id : null;
}
