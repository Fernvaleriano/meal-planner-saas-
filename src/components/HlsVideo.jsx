import { forwardRef, useEffect, useLayoutEffect, useRef } from 'react';
import { supportsNativeHls } from '../utils/exerciseVideo';

// Drop-in <video> replacement that can play Mux HLS streams (.m3u8) on
// browsers WITHOUT native HLS support (Android Chrome, Firefox, desktop
// Chrome) by attaching hls.js. On Safari/iOS — where <video> plays .m3u8
// natively — and for every non-HLS src, it renders a plain <video> with the
// src attribute set, byte-for-byte the behavior we shipped before, so those
// paths carry zero regression risk.
//
// hls.js is loaded lazily (dynamic import) only on the first HLS playback on
// a non-native browser, so it never weighs down the initial bundle or any
// iOS user.
//
// Error contract: transient network hiccups are retried internally (this is
// gym-floor 3G/4G territory); on a genuinely fatal error we tear down and
// call `onError({ target: <video> })` — the same shape the existing
// handleVideoError / handleGuidedVideoError fallback chains already accept,
// so they drop to the raw-file fallback exactly as they do today.

const isHlsUrl = (src) =>
  typeof src === 'string' && /\.m3u8(\?|$)/i.test(src.split('#')[0]);

const HlsVideo = forwardRef(function HlsVideo({ src, onError, ...props }, ref) {
  const elRef = useRef(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const needsHls = isHlsUrl(src) && !supportsNativeHls();

  const setRefs = (el) => {
    elRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };

  // Queue play() calls made before hls.js has attached. Parents call
  // videoRef.current.play() from the user's tap (before our async attach
  // completes) — without this the intent is lost and the user has to tap the
  // native play button a second time. Installed in a LAYOUT effect so it is
  // in place before any parent layout effect fires play() on mount.
  const pendingPlayRef = useRef(false);
  const attachedRef = useRef(false);
  useLayoutEffect(() => {
    if (!needsHls) return;
    const el = elRef.current;
    if (!el) return;
    const origPlay = el.play.bind(el);
    el.play = () => {
      if (attachedRef.current) return origPlay();
      pendingPlayRef.current = true;
      return Promise.resolve();
    };
    return () => {
      el.play = origPlay;
    };
  }, [needsHls, src]);

  useEffect(() => {
    if (!needsHls) return;
    const el = elRef.current;
    if (!el) return;

    let hls = null;
    let cancelled = false;
    attachedRef.current = false;
    pendingPlayRef.current = false;

    import('hls.js')
      .then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) {
          // No MediaSource support at all — let the parent's error chain
          // fall back to the raw file.
          onErrorRef.current?.({ target: el });
          return;
        }

        let netRetries = 0;
        let mediaRetries = 0;
        hls = new Hls({
          // Don't buffer more than ~30s ahead: keeps memory low on old
          // phones and avoids paying to deliver video nobody watches.
          maxBufferLength: 30,
          // Never fetch a higher rendition than the on-screen size needs.
          capLevelToPlayerSize: true,
        });

        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data?.fatal) return;
          // Weak-signal resilience: retry stalled network loads a couple of
          // times, and attempt one decoder recovery, before giving up.
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && netRetries < 2) {
            netRetries++;
            hls.startLoad();
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetries < 1) {
            mediaRetries++;
            hls.recoverMediaError();
            return;
          }
          try { hls.destroy(); } catch { /* already gone */ }
          hls = null;
          onErrorRef.current?.({ target: el });
        });

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          attachedRef.current = true;
          if (pendingPlayRef.current || el.autoplay) {
            pendingPlayRef.current = false;
            el.play().catch(() => { /* native controls remain the fallback */ });
          }
        });

        hls.loadSource(src);
        hls.attachMedia(el);
      })
      .catch(() => {
        // hls.js chunk failed to download (offline / blocked) — fall back.
        if (!cancelled) onErrorRef.current?.({ target: el });
      });

    return () => {
      cancelled = true;
      attachedRef.current = false;
      if (hls) {
        try { hls.destroy(); } catch { /* already gone */ }
      }
    };
  }, [needsHls, src]);

  // For native-HLS browsers and plain files, set src normally. When hls.js
  // drives playback the src attribute must stay unset (hls.js attaches a
  // MediaSource to the element itself).
  return (
    <video
      {...props}
      ref={setRefs}
      src={needsHls ? undefined : src}
      onError={onError}
    />
  );
});

export default HlsVideo;
