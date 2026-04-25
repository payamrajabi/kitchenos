# Voice mode setup

Voice mode lets a cook talk through a recipe hands-free: a Phosphor `Waveform`
FAB sits in the bottom-right of the recipe detail view; tapping it opens an
ElevenLabs Conversational AI session that walks through ingredients first,
then steps, all driven by spoken back-and-forth. Bottom-center FABs control
mute and end. Currently spoken ingredient/step rows pick up a highlight and
auto-scroll into view.

This document describes the one-time setup required before the FAB will show
up in the UI, and how the moving pieces fit together.

## Environment variables

Add the following to your environment (e.g. `.env.local`, Vercel project
settings):

```
ELEVENLABS_API_KEY=sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
ELEVENLABS_AGENT_ID=agent_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_VOICE_MODE_ENABLED=true
# Optional — overrides the default voice configured on the agent
ELEVENLABS_VOICE_ID=
NEXT_PUBLIC_ELEVENLABS_VOICE_ID=
```

`ELEVENLABS_API_KEY` is server-only — the browser never sees it. The server
mints short-lived signed URLs through `getSignedConversationUrlAction()`
(see `src/app/actions/voice.ts`) and the SDK uses those to open a WebSocket.

`NEXT_PUBLIC_VOICE_MODE_ENABLED` gates the UI: until it's `true`, the FAB
stays hidden so users don't see a broken control before the agent is wired
up.

## ElevenLabs agent setup (one-time)

Inside the ElevenLabs dashboard, create a new Conversational AI agent. The
session-level system prompt is generated per recipe at runtime, so the
agent's default prompt is just a fallback — you can leave it as the baseline
prompt copied from `src/lib/voice/agent-config.ts` (`VOICE_AGENT_BASELINE_PROMPT`).

Pick a warm, natural voice. The default voice you pick on the agent is what
the cook will hear — `ELEVENLABS_VOICE_ID` is only needed if you want the
app to override that voice at runtime.

### Client tools

The five client tools below have to be configured on the agent for the flow
to work. Names and parameter schemas live in
`src/lib/voice/agent-config.ts` (`VOICE_TOOL_DEFINITIONS`) — copy the
descriptions and parameter schemas from there into the dashboard, exactly.

| Tool name | Purpose |
|---|---|
| `set_focus` | Highlight an ingredient or step on screen as the agent announces it. |
| `set_phase` | Move between gathering, cooking, and wrap-up phases. |
| `start_step_timer` | Kick off the existing per-step kitchen timer. |
| `end_voice_mode` | End the session entirely. |
| `note_user_action` | Log a side note (out of stock, substitution, skipped step). |

If any of those names or parameter shapes drift from the dashboard, the
matching client-side handlers in `src/components/recipe-voice-mode.tsx`
will quietly fail to fire — keep them aligned.

## How the data flows

1. The cook taps the `Waveform` FAB on the recipe detail page.
2. The browser calls `getSignedConversationUrlAction()`, which returns a
   short-lived signed URL minted against `ELEVENLABS_AGENT_ID`.
3. The browser opens the ElevenLabs SDK's WebSocket via that signed URL,
   passing a session-level system prompt assembled by
   `buildVoiceSystemPrompt()`. The prompt contains the recipe in
   smart-grouped order (`groupIngredientsForVoice` — pantry → fridge →
   produce → protein), the current servings scale, what's in stock, and
   detailed flow rules (when to call `set_focus`, when to advance, etc.).
4. The agent walks the cook through each ingredient, then each step,
   pausing for "got it" / "next" / questions between each.
5. As the agent talks, it calls `set_focus` to keep the on-screen
   highlight in sync. Step timers are kicked off via `start_step_timer`
   and surfaced back to the agent as a `[timer]` contextual update when
   they finish, so it can announce "your pasta timer just went off"
   naturally without having to play a sound.

## Cost watch

Conversational AI is metered per minute. A 45-minute cook session is about
$13 of credits on the Creator tier (Apr 2026). Add a usage cap in your
ElevenLabs dashboard before exposing this to anyone outside your own
account.

## Things this version doesn't do (yet)

- No transcript persistence — sessions are ephemeral.
- No ad-hoc kitchen timers — only timers attached to specific recipe steps.
  ("set a 5 minute timer" without a step is on the wishlist.)
- No barge-in nuance: the SDK handles barge-in natively at the protocol
  level, which is good enough for v1.
- Voice mode is hidden in edit mode and during remix — both are authoring
  flows where talking to the recipe doesn't make sense.
