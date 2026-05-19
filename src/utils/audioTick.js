// Tick / chime / keep-alive audio subsystem — INTENTIONALLY DISABLED.
//
// History: this used the Web Audio API to play a rep "tick", a set-complete
// chime, and an inaudible every-2s keep-alive, with elaborate iOS hardening.
// In practice the ticks never reliably played on the founder's iPhone, and
// merely creating/resuming the AudioContext (on play-mode mount, taps, and
// the keep-alive) made iOS Safari/WebKit seize the exclusive AVAudioSession —
// which paused the user's background music (YouTube) the instant play mode
// opened, and kept it paused even after muting voice.
//
// Product decision (May 2026, founder): the timer ticks add no value if they
// don't play, and they are the thing killing background music. Remove the
// whole Web Audio path so NO AudioContext is ever created. Background music
// now keeps playing through play mode. Spoken voice cues are separate
// (speechSynthesis, gated by the in-modal voice toggle) and are unaffected;
// muting voice now genuinely leaves the audio session alone.
//
// These exports are kept as no-ops so the existing call sites
// (GuidedWorkoutModal.jsx, Workouts.jsx) need no churn and this is a clean
// one-commit revert if ticks are ever wanted back. DO NOT reintroduce an
// AudioContext here without re-checking the background-music regression.

export const playTickSound = () => {};

export const playCompleteChime = () => {};

export const warmUpTickSound = () => {};

export const resumeAudio = () => {};

export const startTickKeepAlive = () => {};

export const stopTickKeepAlive = () => {};

export const setAudioMuted = () => {};

// Returns a no-op disposer to match the previous signature.
export const installGlobalAudioUnlock = () => () => {};
