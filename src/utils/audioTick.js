// Shared Web Audio tick sound. Single module-level instance so every caller
// (GuidedWorkoutModal, the "Start Workout" click handler, app lifecycle) uses
// the SAME AudioContext — iOS unlocks audio per-context, so sharing is the
// only way a tap on one component can unlock ticks that fire later in another.

let audioCtx = null;

const ensureContext = () => {
  // Recreate if null or closed (mobile OS can close it after background/idle)
  if (!audioCtx || audioCtx.state === 'closed') {
    if (typeof window === 'undefined') return null;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  return audioCtx;
};

const playTone = (ctx) => {
  try {
    if (ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.start(t);
    osc.stop(t + 0.08);
  } catch { /* ignore */ }
};

export const playTickSound = () => {
  try {
    const ctx = ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => playTone(ctx)).catch(() => {});
      return;
    }
    playTone(ctx);
  } catch { /* ignore */ }
};

// Call from any tap/click handler to unlock iOS/Android audio. Must run
// synchronously inside the user-gesture call stack — useEffect is too late
// on iOS because the user-activation window has already closed.
export const warmUpTickSound = () => {
  try {
    const ctx = ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    // Silent unlock buffer — the canonical iOS WebAudio unlock.
    try {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch { /* ignore */ }
  } catch { /* ignore */ }
};

// Attach to the first tap anywhere on the page. Runs once, then cleans up.
// Cheap insurance: if the user touches the screen anywhere before the first
// tick, audio is unlocked for the whole session.
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
