// Shared resolver for which video source an exercise demo should play.
//
// When an exercise has a ready Mux copy (`mux_playback_id`, set server-side only
// once transcoding is complete), we prefer Mux's adaptive HLS stream — it starts
// fast and drops quality instead of freezing on a weak connection. Otherwise we
// fall back to whatever the caller already used (the original file), so nothing
// changes for un-converted videos.
//
// HLS caveat: iOS/Safari plays `.m3u8` natively in a plain <video>. Chrome/
// Firefox/Android do NOT, and would need hls.js. Until that's added, we only
// hand out the Mux URL on browsers that support HLS natively; everyone else
// keeps the exact behavior they have today (zero regression). This keeps the
// change safe to ship now for the iOS audience.

let _nativeHls; // memoized capability check

export function supportsNativeHls() {
  if (_nativeHls !== undefined) return _nativeHls;
  try {
    const v = document.createElement('video');
    _nativeHls = typeof v.canPlayType === 'function' && (
      v.canPlayType('application/vnd.apple.mpegurl') !== '' ||
      v.canPlayType('application/x-mpegURL') !== ''
    );
  } catch {
    _nativeHls = false;
  }
  return _nativeHls;
}

// The Mux HLS URL for an exercise, or null if it has no ready Mux copy.
export function getMuxHlsUrl(exercise) {
  const id = exercise?.mux_playback_id;
  return id ? `https://stream.mux.com/${id}.m3u8` : null;
}

// Preferred demo <video> src: the Mux stream when the exercise is converted AND
// the browser can play HLS natively; otherwise the caller's existing fallback
// expression (blob / customVideoUrl / video_url / animation_url), unchanged.
export function getExerciseVideoSrc(exercise, fallbackSrc) {
  const mux = getMuxHlsUrl(exercise);
  if (mux && supportsNativeHls()) return mux;
  return fallbackSrc;
}

// Generic version for any Mux-backed video (e.g. leaderboard lift proofs):
// given a playback id + a fallback URL, returns the Mux HLS stream on
// native-HLS browsers, otherwise the fallback. Same safe behavior as
// getExerciseVideoSrc but not tied to an exercise object.
export function getMuxOrFallbackSrc(muxPlaybackId, fallbackSrc) {
  if (muxPlaybackId && supportsNativeHls()) {
    return `https://stream.mux.com/${muxPlaybackId}.m3u8`;
  }
  return fallbackSrc;
}

// True when the currently-playing src is the exercise's Mux stream. Lets a
// player's error handler skip the raw-file blob fallbacks (which don't apply to
// an .m3u8) and drop straight back to the original file instead.
export function isMuxSrc(exercise, currentSrc) {
  const mux = getMuxHlsUrl(exercise);
  return !!mux && currentSrc === mux;
}
