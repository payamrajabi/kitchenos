"use client";

import {
  MicrophoneSlash,
  Microphone,
  X,
} from "@phosphor-icons/react";
import { useCallback } from "react";
import { useRecipeVoiceMode } from "@/components/recipe-voice-mode";

/**
 * Bottom-center floating controls shown only while voice mode is active.
 * Two FABs (mute/unmute, end), plus a thin status pill that says whether
 * the assistant is speaking, listening, or still connecting. The pulsing
 * animation comes from CSS `animation` rules so it doesn't allocate a
 * RAF loop in JS.
 */
export function RecipeVoiceOverlay() {
  const ctx = useRecipeVoiceMode();

  const toggleMuted = useCallback(() => {
    if (!ctx) return;
    ctx.setMuted(!ctx.state.isMuted);
  }, [ctx]);

  const onEnd = useCallback(() => {
    ctx?.end();
  }, [ctx]);

  if (!ctx) return null;
  if (!ctx.state.isActive) return null;

  const { isSpeaking, isListening, isMuted, isConnecting, error } = ctx.state;

  const statusText = error
    ? error
    : isConnecting
      ? "Connecting…"
      : isMuted
        ? "Muted"
        : isSpeaking
          ? "Speaking…"
          : isListening
            ? "Listening"
            : "Ready";

  const statusModifier = error
    ? "error"
    : isConnecting
      ? "connecting"
      : isMuted
        ? "muted"
        : isSpeaking
          ? "speaking"
          : "listening";

  return (
    <div className="recipe-voice-overlay" role="region" aria-label="Voice mode controls">
      <div
        className="recipe-voice-status"
        data-state={statusModifier}
        aria-live="polite"
      >
        <span className="recipe-voice-status-dot" aria-hidden />
        <span className="recipe-voice-status-text">{statusText}</span>
      </div>

      <div className="recipe-voice-controls">
        <button
          type="button"
          className="recipe-voice-control recipe-voice-control--mute"
          onClick={toggleMuted}
          aria-pressed={isMuted}
          aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? (
            <Microphone size={22} weight="bold" aria-hidden />
          ) : (
            <MicrophoneSlash size={22} weight="bold" aria-hidden />
          )}
        </button>

        <button
          type="button"
          className="recipe-voice-control recipe-voice-control--end"
          onClick={onEnd}
          aria-label="End voice mode"
          title="End voice mode"
        >
          <X size={22} weight="bold" aria-hidden />
        </button>
      </div>
    </div>
  );
}
