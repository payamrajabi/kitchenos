/**
 * Synthesises a gentle three-tone "kitchen timer" chime using the Web Audio
 * API.  Two modes:
 *
 * - `startAlarm()` — loops continuously until `stopAlarm()` (used when the
 *   high end of a timer range is reached).
 * - `playNudge(loops)` — plays the chime a fixed number of times then stops
 *   (used at the low-end milestone and each per-minute reminder).
 */

let ctx: AudioContext | null = null;
let activeNodes: { osc: OscillatorNode; gain: GainNode }[] = [];
let loopTimer: ReturnType<typeof setInterval> | null = null;

function getCtx(): AudioContext {
  if (!ctx || ctx.state === "closed") {
    ctx = new AudioContext();
  }
  return ctx;
}

function playChime(audioCtx: AudioContext) {
  const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5
  const now = audioCtx.currentTime;
  const nodes: { osc: OscillatorNode; gain: GainNode }[] = [];

  for (let i = 0; i < freqs.length; i++) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.value = freqs[i];

    const onset = now + i * 0.12;
    gain.gain.setValueAtTime(0, onset);
    gain.gain.linearRampToValueAtTime(0.18, onset + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, onset + 0.7);

    osc.connect(gain).connect(audioCtx.destination);
    osc.start(onset);
    osc.stop(onset + 0.75);

    nodes.push({ osc, gain });
  }

  activeNodes.push(...nodes);
}

/** Play the chime a fixed number of times (non-blocking). */
export function playNudge(loops = 2) {
  const audioCtx = getCtx();
  if (audioCtx.state === "suspended") {
    void audioCtx.resume();
  }
  playChime(audioCtx);
  if (loops > 1) {
    let played = 1;
    const nudgeTimer = setInterval(() => {
      played++;
      playChime(audioCtx);
      if (played >= loops) clearInterval(nudgeTimer);
    }, 2000);
  }
}

/** Start a continuously looping alarm until `stopAlarm()`. */
export function startAlarm() {
  stopAlarm();
  const audioCtx = getCtx();
  if (audioCtx.state === "suspended") {
    void audioCtx.resume();
  }

  playChime(audioCtx);
  loopTimer = setInterval(() => playChime(audioCtx), 2000);
}

export function stopAlarm() {
  if (loopTimer != null) {
    clearInterval(loopTimer);
    loopTimer = null;
  }
  for (const { osc, gain } of activeNodes) {
    try {
      osc.stop();
    } catch {
      /* already stopped */
    }
    gain.disconnect();
    osc.disconnect();
  }
  activeNodes = [];
}
