// Shared resolver for which video source an exercise demo should play.
//
// When an exercise has a ready Mux copy (`mux_playback_id`, set server-side only
// once transcoding is complete), we prefer Mux's adaptive HLS stream — it starts
// fast and drops quality instead of freezing on a weak connection. Otherwise we
// fall back to whatever the caller already used (the original file), so nothing
// changes for un-converted videos.
//
// HLS support comes in two flavors: iOS/Safari plays `.m3u8` natively in a
// plain <video>; Chrome/Firefox/Android need hls.js driving a MediaSource.
// The shared <HlsVideo> component (src/components/HlsVideo.jsx) handles the
// hls.js attachment, so here we hand out the Mux URL whenever EITHER path is
// available. Browsers with neither (very old devices) keep the raw-file
// fallback they always had.

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

let _mseHls; // memoized capability check for the hls.js (MediaSource) path

// True when hls.js can drive HLS playback here: MediaSource is present and
// can handle the H.264/AAC renditions Mux serves. This is the same check
// hls.js's own Hls.isSupported() performs, done synchronously so we can pick
// the src without downloading the library first.
export function supportsMseHls() {
  if (_mseHls !== undefined) return _mseHls;
  try {
    _mseHls = typeof window !== 'undefined' &&
      typeof window.MediaSource === 'function' &&
      typeof window.MediaSource.isTypeSupported === 'function' &&
      window.MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E,mp4a.40.2"');
  } catch {
    _mseHls = false;
  }
  return _mseHls;
}

// Can this browser play the Mux HLS stream at all (natively or via hls.js)?
export function canPlayHls() {
  return supportsNativeHls() || supportsMseHls();
}

// The Mux HLS URL for an exercise, or null if it has no ready Mux copy.
export function getMuxHlsUrl(exercise) {
  const id = exercise?.mux_playback_id;
  return id ? `https://stream.mux.com/${id}.m3u8` : null;
}

// Preferred demo <video> src: the Mux stream when the exercise is converted
// AND the browser can play HLS (natively, or via hls.js through <HlsVideo>);
// otherwise the caller's existing fallback expression (blob / customVideoUrl
// / video_url / animation_url), unchanged.
export function getExerciseVideoSrc(exercise, fallbackSrc) {
  const mux = getMuxHlsUrl(exercise);
  if (mux && canPlayHls()) return mux;
  return fallbackSrc;
}

// Generic version for any Mux-backed video (e.g. leaderboard lift proofs):
// given a playback id + a fallback URL, returns the Mux HLS stream on
// HLS-capable browsers, otherwise the fallback. Same safe behavior as
// getExerciseVideoSrc but not tied to an exercise object.
export function getMuxOrFallbackSrc(muxPlaybackId, fallbackSrc) {
  if (muxPlaybackId && canPlayHls()) {
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
