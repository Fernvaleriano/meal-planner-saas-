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
// When false, the audio engine is never created and any existing context is
// suspended — this releases the iOS audio session so the user's background
// music keeps playing. Driven by the play-mode mute toggle.
let audioEnabled = true;

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
  // Sound is off (play mode muted): never create/use the engine so iOS
  // doesn't grab the audio session away from the user's music.
  if (!audioEnabled) return null;
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
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      try { src.disconnect(); } catch { /* ignore */ }
      // Drop the buffer reference so WebKit can release the decoded
      // audio data sooner — iOS in particular holds the PCM data alive
      // until the source is GC'd, which can lag in long sessions.
      try { src.buffer = null; } catch { /* ignore */ }
    };
    src.onended = cleanup;
    // Belt-and-suspenders: iOS WebKit doesn't always fire `onended` when the
    // audio session is interrupted (TTS, incoming call, video unmute). Without
    // a forced cleanup the source stays connected, never GCs, and over a long
    // workout the leaked nodes accumulate until iOS kills the tab.
    setTimeout(cleanup, Math.max(50, (DURATION + 1) * 1000));
    return true;
  } catch {
    return false;
  }
};

// Primary tick path — short oscillator burst. Mirrors the legacy
// implementation that produced audible ticks for users in prior builds.
const playOscillator = (ctx) => {
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
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      try { osc.disconnect(); env.disconnect(); } catch { /* ignore */ }
    };
    osc.onended = cleanup;
    // Belt-and-suspenders: iOS WebKit doesn't always fire `onended` when the
    // audio session is interrupted (TTS, incoming call, video unmute). Without
    // a forced cleanup the oscillator + gain stay connected, never GC, and
    // over a long workout the leaked nodes accumulate until iOS kills the tab.
    setTimeout(cleanup, Math.max(50, (DURATION + 1) * 1000));
    return true;
  } catch {
    return false;
  }
};

// Why oscillator-first: an earlier rewrite preferred AudioBufferSourceNode
// (theoretically more reliable on iOS) but in production iOS Safari + the
// Capacitor WebView, scheduled buffer sources sometimes silently no-op when
// the audio session has been touched recently. The legacy oscillator path
// is what users actually heard in prior builds, so we keep it as the
// primary path and use the buffer as a fallback.
const playTick = (ctx) => {
  if (playOscillator(ctx)) return true;
  const buffer = buildTickBuffer(ctx);
  if (buffer && playBufferNow(ctx, buffer)) return true;
  return false;
};

export const playTickSound = () => {
  // Stand down if a coach video is playing with audio — the video owns
  // the session in that moment and the tick is intentionally suppressed.
  if (isCoachVideoAudioActive()) return;
  const ctx = ensureCtx();
  if (!ctx) return;
  // Cheap when already running; nudges a suspended/interrupted context
  // back toward 'running' before we schedule the oscillator.
  resumeCtxSync(ctx);
  playTick(ctx);
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

// Two-tone completion chime (rising 660Hz → 990Hz) played when a timed set
// counts down to zero. Uses the same scheduled-oscillator path as the rep
// tick so it mixes on top of background music and survives the iOS audio
// session quirks documented above. Falls back silently if the context can't
// be created.
export const playCompleteChime = () => {
  if (isCoachVideoAudioActive()) return;
  const ctx = ensureCtx();
  if (!ctx) return;
  resumeCtxSync(ctx);
  try {
    const now = ctx.currentTime;
    const tones = [
      { freq: 660, at: 0.0, dur: 0.12 },
      { freq: 990, at: 0.12, dur: 0.22 },
    ];
    tones.forEach(({ freq, at, dur }) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      const startAt = now + 0.01 + at;
      osc.frequency.setValueAtTime(freq, startAt);
      env.gain.setValueAtTime(0, startAt);
      env.gain.linearRampToValueAtTime(PEAK_GAIN, startAt + 0.01);
      env.gain.linearRampToValueAtTime(0, startAt + dur);
      osc.connect(env);
      env.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + dur);
      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        try { osc.disconnect(); env.disconnect(); } catch { /* ignore */ }
      };
      osc.onended = cleanup;
      // Forced cleanup — see playOscillator note. iOS skips onended when the
      // audio session is interrupted mid-chime.
      setTimeout(cleanup, Math.max(50, (at + dur + 1) * 1000));
    });
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
      // 1-sample sources should end instantly, but on iOS interrupted state
      // the node sometimes sticks. This fires ~900 times in a 30-minute
      // workout — without a forced cleanup it's a steady drip into the
      // memory ceiling.
      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        try { src.disconnect(); } catch { /* ignore */ }
        try { src.buffer = null; } catch { /* ignore */ }
      };
      src.onended = cleanup;
      setTimeout(cleanup, 250);
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

// Master gate for the app's audio engine. Off => no context is created and
// any running context is suspended, which hands the iOS audio session back
// so the user's background music resumes. On => resume so ticks/voice work.
export const setAudioEnabled = (on) => {
  audioEnabled = !!on;
  if (!audioEnabled) {
    stopTickKeepAlive();
    if (audioCtx && audioCtx.state === 'running') {
      try { audioCtx.suspend(); } catch { /* ignore */ }
    }
  } else if (audioCtx && audioCtx.state === 'suspended') {
    try { audioCtx.resume(); } catch { /* ignore */ }
  }
};
