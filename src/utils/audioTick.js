// Tick sound via the Web Audio API — hardened for iOS Safari / WebKit.
//
// Background: an HTML5 <audio> element on iOS forces the AVAudioSession into
// an exclusive playback mode, which pauses the user's background music
// (Spotify / Apple Music) the instant we play a tick. The Web Audio API +
// a short oscillator burst lets the tick mix on top of background music.
//
// Why this file is more involved than "just play an oscillator":
//
//   1. Per-tick OscillatorNodes are unreliable on iOS WebKit. When many
//      short-lived oscillators are created from setInterval, some silently
//      fail to start — this is the #1 reason the tick "misfires" mid-set
//      on iPhone but is fine on Android. We pre-render the tick once into
//      an AudioBuffer and reuse a fresh AudioBufferSourceNode each rep.
//
//   2. ctx.resume() is async. The previous implementation called resume()
//      and then immediately scheduled the oscillator — on a still-suspended
//      context, against a frozen ctx.currentTime. iOS sometimes drops these.
//      We now schedule slightly into the future and, when the context isn't
//      yet running, we await the resume() promise before scheduling.
//
//   3. speechSynthesis.speak() flips the iOS audio session category and puts
//      our AudioContext into 'interrupted' state. The subsequent ticks fire
//      against a dead context. We watch statechange and expose resumeAudio()
//      so the modal can ping us after each utterance ends.
//
//   4. iOS will let an idle AudioContext drift to sleep after a few seconds
//      of silence. Between slow reps (4–5s) that's enough to lose the next
//      tick. startTickKeepAlive() schedules an inaudible buffer every ~2s
//      while a set is active to keep the session warm.

const FREQ = 880;
const DURATION = 0.08;
const PEAK_GAIN = 0.5;

let audioCtx = null;
let unlocked = false;
let tickBuffer = null;
let tickBufferCtx = null; // ctx the buffer was rendered for; rebuild on mismatch
let lastScheduledTime = 0;
let stateListenerAttached = false;
let keepAliveTimer = null;

const isBrowser = () => typeof window !== 'undefined';

// Coach exercise videos default to muted so the rep tick + background music
// keep playing. When the coach unmutes one of their custom videos (so the
// client hears coaching audio instead), we want to step out of the way:
// skip ticks and skip the keep-alive ping so iOS gives the video full,
// uncontested control of the audio session. The user-facing trade is that
// the tick stops while the video is talking, which the product owner
// explicitly chose.
const isCoachVideoAudioActive = () => {
  if (typeof document === 'undefined') return false;
  try {
    const videos = document.getElementsByTagName('video');
    for (let i = 0; i < videos.length; i++) {
      const v = videos[i];
      if (v && !v.paused && !v.muted && (v.volume == null || v.volume > 0)) {
        return true;
      }
    }
  } catch { /* ignore */ }
  return false;
};

const getCtxCtor = () => {
  if (!isBrowser()) return null;
  return window.AudioContext || window.webkitAudioContext || null;
};

const ensureCtx = () => {
  if (audioCtx) return audioCtx;
  const Ctx = getCtxCtor();
  if (!Ctx) return null;
  try {
    // latencyHint:'interactive' keeps the path low-latency for rep ticks; on
    // iOS this hint also nudges the session toward a non-exclusive category
    // so background audio can keep playing.
    audioCtx = new Ctx({ latencyHint: 'interactive' });
  } catch {
    try { audioCtx = new Ctx(); } catch { audioCtx = null; }
  }
  attachStateListener(audioCtx);
  return audioCtx;
};

// Watch state transitions. When iOS interrupts us (incoming call, Siri, TTS
// session category flip), we get statechange → 'interrupted' or 'suspended'.
// Clear `unlocked` so the next user gesture re-arms the silent buffer kick,
// and proactively try to resume.
const attachStateListener = (ctx) => {
  if (!ctx || stateListenerAttached) return;
  try {
    ctx.addEventListener('statechange', () => {
      const state = ctx.state;
      if (state === 'interrupted' || state === 'suspended' || state === 'closed') {
        unlocked = false;
        if (state !== 'closed') {
          // Best-effort resume; if it fails because we're outside a user
          // gesture, the next tap or warmUpTickSound() call will retry.
          try {
            const p = ctx.resume();
            if (p && typeof p.catch === 'function') p.catch(() => {});
          } catch { /* ignore */ }
        }
      }
    });
    stateListenerAttached = true;
  } catch { /* ignore */ }
};

const resumeCtxSync = (ctx) => {
  if (!ctx) return;
  if (ctx.state === 'running') return;
  try {
    const p = ctx.resume();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch { /* ignore */ }
};

// Pre-render the tick envelope into an AudioBuffer. Reusing the same buffer
// across reps via AudioBufferSourceNode is dramatically more reliable on iOS
// than spawning a fresh OscillatorNode every tick.
const buildTickBuffer = (ctx) => {
  if (!ctx) return null;
  if (tickBuffer && tickBufferCtx === ctx) return tickBuffer;
  try {
    const sampleRate = ctx.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * DURATION));
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    const twoPiFOverSr = (2 * Math.PI * FREQ) / sampleRate;
    for (let i = 0; i < length; i++) {
      const t = i / length; // 0..1 across the burst
      const env = PEAK_GAIN * (1 - t); // linear decay, matches old envelope
      data[i] = Math.sin(twoPiFOverSr * i) * env;
    }
    tickBuffer = buffer;
    tickBufferCtx = ctx;
    return buffer;
  } catch {
    tickBuffer = null;
    tickBufferCtx = null;
    return null;
  }
};

const playBufferNow = (ctx, buffer) => {
  try {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    // Schedule slightly into the future to avoid "scheduled in the past"
    // glitches on iOS, and never schedule before the previous tick to keep
    // ordering stable when ticks land back-to-back.
    const now = ctx.currentTime;
    const startAt = Math.max(now + 0.005, lastScheduledTime + 0.001);
    src.start(startAt);
    lastScheduledTime = startAt;
    src.onended = () => {
      try { src.disconnect(); } catch { /* ignore */ }
    };
    return true;
  } catch {
    return false;
  }
};

// Last-resort oscillator path. Used only if the AudioBuffer approach fails
// for some reason (e.g., createBuffer threw). Keeps the audible behavior
// identical to the legacy implementation.
const playOscillatorFallback = (ctx) => {
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(FREQ, now);
    env.gain.setValueAtTime(PEAK_GAIN, now);
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

const playTick = (ctx) => {
  const buffer = buildTickBuffer(ctx);
  if (buffer && playBufferNow(ctx, buffer)) return;
  playOscillatorFallback(ctx);
};

export const playTickSound = () => {
  // Stand down if a coach video is playing with audio — the video owns
  // the session in that moment and the tick is intentionally suppressed.
  if (isCoachVideoAudioActive()) return;
  const ctx = ensureCtx();
  if (!ctx) return;
  if (ctx.state === 'running') {
    playTick(ctx);
    return;
  }
  // Context isn't running. Fire resume() and play once it resolves so the
  // tick still lands (a hair late) instead of being lost. Also try a
  // synchronous schedule — iOS sometimes accepts buffer scheduling on a
  // suspending context and plays it the moment the context flips to running.
  resumeCtxSync(ctx);
  playTick(ctx);
  try {
    const p = ctx.resume && ctx.resume();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        if (ctx.state === 'running') {
          // Only re-fire if our optimistic schedule clearly missed (the
          // last scheduled time is in the past relative to the now-running
          // ctx). Otherwise we'd double-tick.
          if (lastScheduledTime < ctx.currentTime - 0.05) {
            playTick(ctx);
          }
        }
      }).catch(() => {});
    }
  } catch { /* ignore */ }
};

// Must be called from a real user-gesture handler (onClick, onTouchStart).
// Creates and resumes the AudioContext inside the iOS user-activation window
// so later programmatic playTickSound() calls (from setInterval) succeed.
// Plays a 1-sample silent buffer — the canonical iOS unlock, inaudible and
// the least likely path to disturb the session category that controls
// background-music mixing. Pre-builds the tick buffer too so the first rep
// doesn't pay the rendering cost.
export const warmUpTickSound = () => {
  const ctx = ensureCtx();
  if (!ctx) return;
  resumeCtxSync(ctx);
  // Pre-render the tick buffer up front so the first rep is identical in
  // latency to subsequent reps.
  buildTickBuffer(ctx);
  if (unlocked && ctx.state === 'running') return;
  try {
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    unlocked = true;
  } catch { /* ignore */ }
};

// External hook the modal calls after speechSynthesis utterances end and on
// app foreground. iOS flips the AVAudioSession category during TTS, which
// puts our context into 'interrupted' — the first tick after speech then
// silently no-ops. Pinging resume() here keeps the rep tick alive.
export const resumeAudio = () => {
  const ctx = audioCtx || ensureCtx();
  if (!ctx) return;
  resumeCtxSync(ctx);
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

// Plays an inaudible 1-sample buffer every ~2s while a set is active. iOS
// will park an idle AudioContext and the next tick comes back silent; this
// schedule keeps the session warm without disturbing background music.
// Idempotent — safe to call repeatedly.
export const startTickKeepAlive = () => {
  if (keepAliveTimer) return;
  if (typeof window === 'undefined') return;
  const tick = () => {
    // Don't ping the audio session while a coach video is playing with
    // audio — let iOS give that video uncontested ownership.
    if (isCoachVideoAudioActive()) return;
    const ctx = audioCtx;
    if (!ctx) return;
    if (ctx.state !== 'running') {
      resumeCtxSync(ctx);
      return;
    }
    try {
      const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start(0);
    } catch { /* ignore */ }
  };
  keepAliveTimer = window.setInterval(tick, 2000);
};

export const stopTickKeepAlive = () => {
  if (!keepAliveTimer) return;
  if (typeof window !== 'undefined') {
    window.clearInterval(keepAliveTimer);
  }
  keepAliveTimer = null;
};
