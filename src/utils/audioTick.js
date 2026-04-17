// Tick sound via HTML5 <audio> element. Web Audio's unlock rules are stricter
// on Capacitor's WebView than on Safari — silent-buffer unlock doesn't always
// take. HTML5 audio unlocks app-wide on the first .play() from any user
// gesture, which is more reliable on native wrappers.
//
// The tick is a short 880Hz sine burst (~80ms) with a linear decay envelope,
// generated once as a WAV Blob so we don't ship an audio asset.

let audioEl = null;
let audioBlobUrl = null;

const makeTickBlob = () => {
  const sampleRate = 8000;
  const duration = 0.08;
  const freq = 880;
  const sampleCount = Math.floor(sampleRate * duration);
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + sampleCount);
  const view = new DataView(buffer);

  // RIFF header
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + sampleCount, true); // file size - 8
  view.setUint32(8, 0x57415645, false); // "WAVE"

  // fmt chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true); // byte rate (1 byte per sample, 1 ch)
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // 8-bit samples

  // data chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, sampleCount, true); // data size

  // Fill with sine wave * linear decay envelope
  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRate;
    const envelope = Math.max(0, 1 - t / duration);
    const v = Math.sin(2 * Math.PI * freq * t) * envelope * 0.5;
    view.setUint8(headerSize + i, Math.floor(128 + v * 127));
  }
  return new Blob([buffer], { type: 'audio/wav' });
};

const ensureAudioEl = () => {
  if (audioEl) return audioEl;
  if (typeof document === 'undefined') return null;
  try {
    audioBlobUrl = URL.createObjectURL(makeTickBlob());
    audioEl = new Audio(audioBlobUrl);
    audioEl.preload = 'auto';
    audioEl.volume = 1.0;
    // Some mobile browsers need an explicit load() to stage the decode.
    audioEl.load();
  } catch {
    audioEl = null;
  }
  return audioEl;
};

export const playTickSound = () => {
  const el = ensureAudioEl();
  if (!el) return;
  try {
    // Rewind so rapid successive ticks all play (rather than being ignored as
    // "already in progress"). If the element is still decoding the first time,
    // play() returns a rejected promise which we swallow.
    el.currentTime = 0;
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch { /* ignore */ }
};

// Must be called from a real user-gesture handler (onClick, onTouchStart).
// Plays and immediately pauses the element — iOS/Capacitor treat that as
// "this audio element was activated by the user", which unlocks later
// programmatic .play() calls even from setInterval.
export const warmUpTickSound = () => {
  const el = ensureAudioEl();
  if (!el) return;
  try {
    const p = el.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        try { el.pause(); el.currentTime = 0; } catch { /* ignore */ }
      }).catch(() => {});
    } else {
      try { el.pause(); el.currentTime = 0; } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
};

// One-shot listener that warms up audio on the first tap anywhere in the app.
// Backup for the explicit button-tap warmUp — if the user touched anything
// before the "Start Workout" button, audio is already unlocked for the session.
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
