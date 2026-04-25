"use client";

import {
  ConversationProvider,
  useConversation,
} from "@elevenlabs/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getSignedConversationUrlAction } from "@/app/actions/voice";
import { VOICE_TOOL_NAMES } from "@/lib/voice/agent-config";
import {
  buildVoiceSystemPrompt,
  voiceFirstMessage,
} from "@/lib/voice/build-system-prompt";
import type { GroupedIngredientBucket } from "@/lib/voice/grouped-ingredients";
import {
  addOnTimerEvent,
  formatRemaining,
  startTimer,
  type TimerEvent,
} from "@/lib/step-timer-store";
import type {
  RecipeInstructionStepRow,
  RecipeRow,
} from "@/types/database";
import type {
  VoiceFocus,
  VoiceModeState,
  VoicePhase,
} from "@/lib/voice/types";

const INITIAL_STATE: VoiceModeState = {
  isActive: false,
  phase: "idle",
  focus: { kind: "none" },
  isSpeaking: false,
  isListening: false,
  isMuted: false,
  isConnecting: false,
  error: null,
};

type ContextValue = {
  state: VoiceModeState;
  start: () => Promise<void>;
  end: () => void;
  setMuted: (muted: boolean) => void;
};

const RecipeVoiceModeContext = createContext<ContextValue | null>(null);

export function useRecipeVoiceMode(): ContextValue | null {
  return useContext(RecipeVoiceModeContext);
}

type Props = {
  recipe: RecipeRow;
  groupedIngredients: GroupedIngredientBucket[];
  instructionSteps: RecipeInstructionStepRow[];
  servingsScale: number;
  baseServings: number | null;
  /** Voice mode is hidden entirely when this is false. */
  enabled: boolean;
  children: ReactNode;
};

/**
 * Provider + orchestrator for the hands-free recipe voice mode. Owns the
 * voice state machine, talks to the ElevenLabs Conversational AI session,
 * and exposes a single hook (`useRecipeVoiceMode`) for children to consume.
 */
export function RecipeVoiceMode({
  recipe,
  groupedIngredients,
  instructionSteps,
  servingsScale,
  baseServings,
  enabled,
  children,
}: Props) {
  const [state, setState] = useState<VoiceModeState>(INITIAL_STATE);

  // Refs let the SDK callbacks reach the latest data without forcing a
  // remount of the inner ConversationProvider every time props change.
  const recipeRef = useRef(recipe);
  const groupedRef = useRef(groupedIngredients);
  const stepsRef = useRef(instructionSteps);
  const scaleRef = useRef(servingsScale);
  const baseServingsRef = useRef(baseServings);
  useEffect(() => {
    recipeRef.current = recipe;
    groupedRef.current = groupedIngredients;
    stepsRef.current = instructionSteps;
    scaleRef.current = servingsScale;
    baseServingsRef.current = baseServings;
  }, [recipe, groupedIngredients, instructionSteps, servingsScale, baseServings]);

  const setFocus = useCallback((focus: VoiceFocus) => {
    setState((prev) => ({ ...prev, focus }));
  }, []);
  const setPhase = useCallback((phase: VoicePhase) => {
    setState((prev) => ({ ...prev, phase }));
  }, []);
  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error }));
  }, []);

  const start = useCallback(async () => {
    if (!enabled) return;
    setState((prev) => ({
      ...prev,
      isActive: true,
      isConnecting: true,
      error: null,
      phase: "gathering",
    }));
  }, [enabled]);

  const end = useCallback(() => {
    setState({
      ...INITIAL_STATE,
    });
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    setState((prev) => ({ ...prev, isMuted: muted }));
  }, []);

  const contextValue = useMemo<ContextValue>(
    () => ({ state, start, end, setMuted }),
    [state, start, end, setMuted],
  );

  // Sync the on-screen highlight with whatever the agent says it's currently
  // walking through. Imperative DOM mutation rather than per-row React props
  // because the recipe ingredient/instruction editors are large, deeply
  // nested trees we don't want to thread voice state through.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!state.isActive) {
      // Strip any leftover focus markers from the previous session.
      document
        .querySelectorAll<HTMLElement>("[data-voice-focused='true']")
        .forEach((el) => {
          el.removeAttribute("data-voice-focused");
        });
      return;
    }
    const previous = document.querySelectorAll<HTMLElement>(
      "[data-voice-focused='true']",
    );
    previous.forEach((el) => el.removeAttribute("data-voice-focused"));

    let target: HTMLElement | null = null;
    if (state.focus.kind === "ingredient") {
      target = document.querySelector<HTMLElement>(
        `[data-recipe-ingredient-id='${state.focus.recipeIngredientId}']`,
      );
    } else if (state.focus.kind === "step") {
      target = document.querySelector<HTMLElement>(
        `[data-recipe-step-number='${state.focus.stepNumber}']`,
      );
    }
    if (target) {
      target.setAttribute("data-voice-focused", "true");
      try {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {
        target.scrollIntoView();
      }
    }
  }, [state.isActive, state.focus]);

  return (
    <RecipeVoiceModeContext.Provider value={contextValue}>
      {children}
      {state.isActive ? (
        <ConversationProvider
          // ElevenLabs' SDK provides a built-in wake lock that requests the
          // Wake Lock API on session start and releases it on disconnect —
          // exactly what we need to keep the screen alive while the user is
          // cooking face-down on the counter.
          useWakeLock
          isMuted={state.isMuted}
          onMutedChange={setMuted}
        >
          <RecipeVoiceSession
            recipeRef={recipeRef}
            groupedRef={groupedRef}
            stepsRef={stepsRef}
            scaleRef={scaleRef}
            baseServingsRef={baseServingsRef}
            setFocus={setFocus}
            setPhase={setPhase}
            setError={setError}
            onConnected={() =>
              setState((prev) => ({ ...prev, isConnecting: false }))
            }
            onDisconnected={() => setState({ ...INITIAL_STATE })}
            setSpeaking={(value) =>
              setState((prev) => ({ ...prev, isSpeaking: value }))
            }
            setListening={(value) =>
              setState((prev) => ({ ...prev, isListening: value }))
            }
          />
        </ConversationProvider>
      ) : null}
    </RecipeVoiceModeContext.Provider>
  );
}

type SessionProps = {
  recipeRef: React.MutableRefObject<RecipeRow>;
  groupedRef: React.MutableRefObject<GroupedIngredientBucket[]>;
  stepsRef: React.MutableRefObject<RecipeInstructionStepRow[]>;
  scaleRef: React.MutableRefObject<number>;
  baseServingsRef: React.MutableRefObject<number | null>;
  setFocus: (focus: VoiceFocus) => void;
  setPhase: (phase: VoicePhase) => void;
  setError: (error: string | null) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  setSpeaking: (value: boolean) => void;
  setListening: (value: boolean) => void;
};

/**
 * The inner component that actually opens the WebSocket. Mounted only while
 * the voice session is supposed to be running. Effects start the session on
 * mount and tear it down on unmount, so toggling the parent's `isActive`
 * fully owns the session lifecycle.
 */
function RecipeVoiceSession({
  recipeRef,
  groupedRef,
  stepsRef,
  scaleRef,
  baseServingsRef,
  setFocus,
  setPhase,
  setError,
  onConnected,
  onDisconnected,
  setSpeaking,
  setListening,
}: SessionProps) {
  // Declared up front so the clientTools closures below (specifically
  // end_voice_mode) can reach the running conversation handle without a
  // forward-reference. The actual value is assigned once useConversation
  // returns, just below.
  const conversationRef = useRef<ReturnType<typeof useConversation> | null>(
    null,
  );

  const conversation = useConversation({
    clientTools: useMemo(
      () => ({
        [VOICE_TOOL_NAMES.setFocus]: ((params: {
          kind: string;
          recipeIngredientId?: number;
          stepNumber?: number;
        }) => {
          if (params.kind === "ingredient" && params.recipeIngredientId != null) {
            setFocus({
              kind: "ingredient",
              recipeIngredientId: Number(params.recipeIngredientId),
            });
            return "ok";
          }
          if (params.kind === "step" && params.stepNumber != null) {
            setFocus({ kind: "step", stepNumber: Number(params.stepNumber) });
            return "ok";
          }
          setFocus({ kind: "none" });
          return "ok";
        }) as (parameters: unknown) => string,
        [VOICE_TOOL_NAMES.setPhase]: ((params: { phase: string }) => {
          if (
            params.phase === "gathering" ||
            params.phase === "cooking" ||
            params.phase === "wrapping_up"
          ) {
            setPhase(params.phase);
            return "ok";
          }
          return "ignored: unknown phase";
        }) as (parameters: unknown) => string,
        [VOICE_TOOL_NAMES.startStepTimer]: ((params: { stepNumber: number }) => {
          const stepNumber = Number(params.stepNumber);
          const step = stepsRef.current.find((s) => s.step_number === stepNumber);
          if (!step) return `error: step ${stepNumber} not found`;
          const low = step.timer_seconds_low ?? 0;
          const high = step.timer_seconds_high ?? low;
          if (low <= 0 && high <= 0) {
            return `error: step ${stepNumber} has no timer`;
          }
          startTimer(
            step.id,
            low > 0 ? low : high,
            high > 0 ? high : low,
            recipeRef.current.name ?? "Recipe",
            step.heading?.trim() || `Step ${step.step_number}`,
          );
          return `started timer for step ${stepNumber}`;
        }) as (parameters: unknown) => string,
        [VOICE_TOOL_NAMES.endVoiceMode]: (() => {
          // The SDK fires onDisconnect once endSession completes, which
          // collapses our parent state back to idle.
          conversationRef.current?.endSession();
          return "ending";
        }) as () => string,
        [VOICE_TOOL_NAMES.noteUserAction]: ((params: { kind: string; detail: string }) => {
          // For now we just acknowledge; the noting is for future hooks
          // (mark out-of-stock, queue substitution suggestion, etc.).
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("kitchenos:voice-user-action", { detail: params }),
            );
          }
          return "noted";
        }) as (parameters: unknown) => string,
      }),
      // The handlers reach into refs / closures that don't change between
      // renders, so we deliberately memoize once for the lifetime of the
      // session. setFocus / setPhase / setError are stable from the parent.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    ),
    onConnect: () => {
      onConnected();
      setError(null);
    },
    onDisconnect: () => {
      onDisconnected();
    },
    onError: (message) => {
      setError(message || "Voice session error");
    },
    onModeChange: ({ mode }) => {
      setSpeaking(mode === "speaking");
      setListening(mode === "listening");
    },
  });

  // Keep the ref pointing at the latest conversation instance so the tool
  // closures (and the cleanup function below) can reach it.
  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  // Open the session exactly once on mount. Tear it down on unmount.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const result = await getSignedConversationUrlAction();
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error);
          onDisconnected();
          return;
        }

        const systemPrompt = buildVoiceSystemPrompt({
          recipe: recipeRef.current,
          groupedIngredients: groupedRef.current,
          instructionSteps: stepsRef.current,
          servingsScale: scaleRef.current,
          baseServings: baseServingsRef.current,
        });

        const voiceIdOverride =
          (process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID ?? "").trim() || null;

        conversation.startSession({
          signedUrl: result.signedUrl,
          connectionType: "websocket",
          overrides: {
            agent: {
              prompt: { prompt: systemPrompt },
              firstMessage: voiceFirstMessage(recipeRef.current.name),
            },
            ...(voiceIdOverride
              ? { tts: { voiceId: voiceIdOverride } }
              : {}),
          },
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not start session");
        onDisconnected();
      }
    })();

    return () => {
      cancelled = true;
      try {
        conversationRef.current?.endSession();
      } catch {
        // ignore — the SDK handles the case where the session is already gone
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe to step-timer finishes and forward them to the agent as a
  // contextual update, so the LLM can announce "your pasta timer just went
  // off" out loud without us having to play a sound or hijack the speech.
  useEffect(() => {
    return addOnTimerEvent((event: TimerEvent) => {
      if (event.kind !== "done") return;
      const stepNumber = stepsRef.current.find(
        (s) => s.id === event.entry.stepId,
      )?.step_number;
      if (stepNumber == null) return;
      try {
        conversationRef.current?.sendContextualUpdate(
          `[timer] The ${event.entry.stepLabel} timer for step ${stepNumber} just finished (${formatRemaining(0)} remaining). Tell the user it's done.`,
        );
      } catch {
        // The session may have closed between the timer firing and now.
      }
    });
  }, [stepsRef]);

  return null;
}
