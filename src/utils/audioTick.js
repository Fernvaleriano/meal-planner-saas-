// Tick sound via the Web Audio API.
//
// Background: an HTML5 <audio> element on iOS forces the AVAudioSession into
// an exclusive playback mode, which pauses the user's background music
// (Spotify / Apple Music) the instant we play a tick. Switching to the Web
// Audio API + an oscillator lets the tick mix on top of background music
// instead of interrupting it on iOS Safari and the Capacitor WebView.
//
// The tick stays identical to the previous implementation: a short ~80ms
// 880Hz sine burst with a linear decay envelope.

const FREQ = 880;
const DURATION = 0.08;
const PEAK_GAIN = 0.5;

let audioCtx = null;
let unlocked = false;

const ensureCtx = () => {
  if (audioCtx) return audioCtx;
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  try {
    // latencyHint:'interactive' keeps the path low-latency for rep ticks; on
    // iOS this hint also nudges the session toward a non-exclusive category
    // so background audio can keep playing.
    audioCtx = new Ctx({ latencyHint: 'interactive' });
  } catch {
    try { audioCtx = new Ctx(); } catch { audioCtx = null; }
  }
  return audioCtx;
};

const resumeCtx = (ctx) => {
  if (!ctx || ctx.state !== 'suspended') return;
  try {
    const p = ctx.resume();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch { /* ignore */ }
};

const scheduleTick = (ctx, gain = PEAK_GAIN) => {
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(FREQ, now);
    // Linear decay envelope matches the old WAV blob.
    env.gain.setValueAtTime(gain, now);
    env.gain.linearRampToValueAtTime(0, now + DURATION);
    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + DURATION);
    osc.onended = () => {
      try { osc.disconnect(); env.disconnect(); } catch { /* ignore */ }
    };
  } catch { /* ignore */ }
};

export const playTickSound = () => {
  const ctx = ensureCtx();
  if (!ctx) return;
  resumeCtx(ctx);
  scheduleTick(ctx);
};

// Must be called from a real user-gesture handler (onClick, onTouchStart).
// Creates and resumes the AudioContext inside the iOS user-activation window
// so later programmatic playTickSound() calls (from setInterval) succeed.
// Plays a 1-sample silent buffer — the canonical iOS unlock, inaudible and
// the least likely path to disturb the session category that controls
// background-music mixing.
export const warmUpTickSound = () => {
  const ctx = ensureCtx();
  if (!ctx) return;
  resumeCtx(ctx);
  if (unlocked) return;
  try {
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    unlocked = true;
  } catch { /* ignore */ }
};

// One-shot listener that warms up audio on the first tap anywhere in the app.
// Backup for the explicit button-tap warmUp — if the user touched anything
// before the "Start Workout" button, the tick context is already primed.
export const installGlobalAudioUnlock = () => {
  if (typeof document === 'undefined') return () => {};
  let disposed = false;
  const handler = () => {
    if (disposed) return;
    warmUpTickSound();
    disposed = true;
    document.removeEventListener('touchstart', handler);
    document.removeEventListener('click', handler);
  };
  document.addEventListener('touchstart', handler, { passive: true });
  document.addEventListener('click', handler);
  return () => {
    disposed = true;
    document.removeEventListener('touchstart', handler);
    document.removeEventListener('click', handler);
  };
};
