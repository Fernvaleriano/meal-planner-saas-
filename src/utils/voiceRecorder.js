// Voice-message recorder for the React app (chat composer).
// Mirrors js/voice-message.js used by the coach HTML pages.
//
// Prefers audio/mp4 (AAC) because it plays back on every platform — clients
// are mostly on iPhone Safari, which can't reliably play webm/opus. Falls
// back to webm/opus (Firefox).

const MAX_DURATION_MS = 5 * 60 * 1000; // hard stop at 5 minutes

let active = null; // one recording at a time across the app

const pickMimeType = () => {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
  return candidates.find(c => MediaRecorder.isTypeSupported(c)) || '';
};

const extensionFor = (mime) => {
  if (!mime) return 'webm';
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
};

export const isVoiceRecordingSupported = () =>
  !!(navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined');

export const isVoiceRecording = () =>
  !!(active && active.recorder?.state === 'recording');

// Starts recording. Throws if the mic is unavailable/denied.
// onTick(elapsedSeconds) fires once a second for a timer display.
// onAutoStop(recording) fires if the 5-minute cap stops it automatically.
export const startVoiceRecording = async ({ onTick, onAutoStop } = {}) => {
  // Reject a second start while the first is still awaiting the mic —
  // otherwise the first call's stream would leak when this one takes over.
  if (active?.starting) throw new Error('Voice recording is already starting');
  if (isVoiceRecording()) cancelVoiceRecording();

  // Claim the active slot BEFORE the async mic request so concurrent
  // starts hit the guard above.
  const placeholder = { starting: true };
  active = placeholder;

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    if (active === placeholder) active = null;
    throw err;
  }
  if (active !== placeholder || placeholder.cancelled) {
    // Cancelled (e.g. unmount) while waiting for permission — release the mic.
    stream.getTracks().forEach(t => t.stop());
    return;
  }

  const mimeType = pickMimeType();
  let recorder;
  try {
    recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  } catch {
    recorder = new MediaRecorder(stream);
  }

  const entry = {
    recorder,
    stream,
    chunks: [],
    startedAt: Date.now(),
    timerInterval: null,
    stopResolve: null,
    cancelled: false,
    autoStopped: false,
  };

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) entry.chunks.push(e.data);
  };

  recorder.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
    if (entry.timerInterval) clearInterval(entry.timerInterval);
    if (active === entry) active = null;

    if (entry.cancelled) {
      entry.stopResolve?.(null);
      return;
    }

    const type = (recorder.mimeType || mimeType || 'audio/webm').split(';')[0];
    const recording = {
      blob: new Blob(entry.chunks, { type }),
      mimeType: type,
      extension: extensionFor(recorder.mimeType || mimeType),
      durationMs: Date.now() - entry.startedAt,
    };

    if (entry.stopResolve) {
      entry.stopResolve(recording);
    } else if (entry.autoStopped && typeof onAutoStop === 'function') {
      onAutoStop(recording);
    }
  };

  entry.timerInterval = setInterval(() => {
    const elapsedMs = Date.now() - entry.startedAt;
    onTick?.(Math.floor(elapsedMs / 1000));
    if (elapsedMs >= MAX_DURATION_MS && recorder.state === 'recording') {
      entry.autoStopped = true;
      recorder.stop();
    }
  }, 1000);

  // Collect data progressively so nothing is lost if the tab dies.
  recorder.start(250);
  active = entry;
};

// Stops the active recording; resolves with
// { blob, mimeType, extension, durationMs }, or null if nothing was active.
export const stopVoiceRecording = () => {
  const entry = active;
  if (!entry || entry.recorder?.state !== 'recording') return Promise.resolve(null);
  return new Promise((resolve) => {
    entry.stopResolve = resolve;
    entry.recorder.stop();
  });
};

// Discards the active recording (mic released, no result delivered).
export const cancelVoiceRecording = () => {
  const entry = active;
  if (!entry) return;
  entry.cancelled = true;
  if (entry.recorder?.state === 'recording') {
    entry.recorder.stop();
  } else {
    // Also covers the still-starting placeholder (no recorder/stream yet):
    // startVoiceRecording sees `cancelled` and releases the mic itself.
    entry.stream?.getTracks().forEach(t => t.stop());
    if (entry.timerInterval) clearInterval(entry.timerInterval);
    if (active === entry) active = null;
  }
};

export const formatRecordingTime = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};
