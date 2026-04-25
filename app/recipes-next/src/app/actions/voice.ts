"use server";

import { createClient } from "@/lib/supabase/server";
import { isVoiceModeConfiguredServer } from "@/lib/env";

export type SignedUrlResult =
  | { ok: true; signedUrl: string; agentId: string }
  | { ok: false; error: string };

/**
 * Mint a short-lived signed URL the browser can use to open a voice session
 * with the configured ElevenLabs Conversational AI agent. The API key never
 * leaves the server. We require an authenticated viewer because each session
 * is metered against our ElevenLabs account.
 */
export async function getSignedConversationUrlAction(): Promise<SignedUrlResult> {
  if (!isVoiceModeConfiguredServer()) {
    return {
      ok: false,
      error:
        "Voice mode is not configured on the server. Set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID in the environment.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in to use voice mode." };
  }

  const apiKey = process.env.ELEVENLABS_API_KEY!;
  const agentId = process.env.ELEVENLABS_AGENT_ID!;

  try {
    const url = new URL(
      "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url",
    );
    url.searchParams.set("agent_id", agentId);
    const response = await fetch(url, {
      method: "GET",
      headers: { "xi-api-key": apiKey },
      cache: "no-store",
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        error: `ElevenLabs returned ${response.status}: ${body.slice(0, 200) || "no body"}`,
      };
    }
    const data = (await response.json()) as { signed_url?: string };
    if (!data.signed_url) {
      return { ok: false, error: "ElevenLabs did not return a signed URL." };
    }
    return { ok: true, signedUrl: data.signed_url, agentId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not reach ElevenLabs.",
    };
  }
}
