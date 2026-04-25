"use client";

import { Waveform } from "@phosphor-icons/react";
import { useCallback } from "react";
import { useRecipeVoiceMode } from "@/components/recipe-voice-mode";

/**
 * Bottom-right entry FAB that opens hands-free voice mode for the current
 * recipe. Hidden while voice mode is already running so it doesn't fight
 * with the bottom-center mute / end controls.
 */
export function RecipeVoiceFab() {
  const ctx = useRecipeVoiceMode();

  const onClick = useCallback(() => {
    ctx?.start();
  }, [ctx]);

  if (!ctx) return null;
  if (ctx.state.isActive) return null;

  return (
    <button
      type="button"
      className="recipe-voice-fab"
      onClick={onClick}
      aria-label="Start hands-free voice mode"
      title="Hands-free voice mode"
    >
      <Waveform size={22} weight="bold" aria-hidden />
    </button>
  );
}
