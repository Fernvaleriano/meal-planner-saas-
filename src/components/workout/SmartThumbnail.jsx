import { useState, useEffect, useRef, useCallback } from 'react';
import { Dumbbell, Play } from 'lucide-react';
import { generateVideoThumbnail } from '../../utils/videoThumbnail';

// --- Concurrent load throttle ---
// iOS WebKit crashes when too many images decode simultaneously into GPU memory.
// This queue limits concurrent image loads to prevent choking the main thread.
const MAX_CONCURRENT_LOADS = 3;
let activeLoads = 0;
const loadQueue = [];

function enqueueLoad(fn) {
  return new Promise((resolve, reject) => {
    const run = () => {
      activeLoads++;
      fn()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          activeLoads--;
          if (loadQueue.length > 0) {
            const next = loadQueue.shift();
            next();
          }
        });
    };

    if (activeLoads < MAX_CONCURRENT_LOADS) {
      run();
    } else {
      loadQueue.push(run);
    }
  });
}

// --- URL helpers (module-level, shared across instances) ---

function isImageUrl(url) {
  if (!url) return false;
  const lower = url.split('?')[0].toLowerCase();
  return lower.endsWith('.gif') || lower.endsWith('.png') || lower.endsWith('.jpg') ||
         lower.endsWith('.jpeg') || lower.endsWith('.webp') || lower.endsWith('.svg');
}

// Catch the AI workout bug where thumbnail_url is set to a video URL.
function isVideoUrl(url) {
  if (!url) return false;
  const lower = url.split('?')[0].toLowerCase();
  return lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov') ||
         lower.endsWith('.avi') || lower.endsWith('.m4v');
}

// Pixel dimensions for each size tier (used for img width/height attributes)
const SIZE_PX = { small: 48, medium: 80, large: 120 };

/**
 * Smart Thumbnail Component
 *
 * iOS-optimised: uses IntersectionObserver to defer image loading until the
 * element is near the viewport and releases the image source when scrolled
 * far away, freeing GPU texture memory that would otherwise accumulate and
 * crash the WebKit Web Content process.
 */
function SmartThumbnail({
  exercise,
  className = '',
  showPlayIndicator = true,
  size = 'medium',
  onClick
}) {
  const [thumbnail, setThumbnail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isNearViewport, setIsNearViewport] = useState(false);

  const containerRef = useRef(null);
  const timeoutRef = useRef(null);
  const thumbnailUrlRef = useRef(null); // holds resolved URL even when img is unloaded

  const hasVideo = !!(exercise?.customVideoUrl || exercise?.video_url || exercise?.animation_url);
  const videoUrl = exercise?.customVideoUrl || exercise?.video_url || exercise?.animation_url;
  const px = SIZE_PX[size] || 80;

  // --- IntersectionObserver: load when near, unload when far ---
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // rootMargin: load images 600px before they enter the viewport (≈3 screens
    // on a phone). Unload once they scroll 1200px away. This keeps ~8-10 images
    // decoded at any time, well within iOS's per-process GPU memory budget.
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsNearViewport(entry.isIntersecting);
      },
      { rootMargin: '600px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // --- Resolve the thumbnail URL (but don't mount <img> until near viewport) ---
  useEffect(() => {
    let cancelled = false;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    async function resolveThumbnail() {
      setLoading(true);
      setError(false);

      // Priority 0: Use custom video thumbnail uploaded by coach
      if (exercise?.customVideoThumbnail) {
        if (!cancelled) {
          thumbnailUrlRef.current = exercise.customVideoThumbnail;
          setThumbnail(exercise.customVideoThumbnail);
          setLoading(false);
        }
        return;
      }

      // Priority 1: Use thumbnail_url if available AND not a video URL.
      if (exercise?.thumbnail_url && !isVideoUrl(exercise.thumbnail_url)) {
        if (!cancelled) {
          thumbnailUrlRef.current = exercise.thumbnail_url;
          setThumbnail(exercise.thumbnail_url);
          setLoading(false);
        }
        return;
      }

      // Priority 2: Use animation_url if it's an image
      if (exercise?.animation_url && isImageUrl(exercise.animation_url)) {
        if (!cancelled) {
          thumbnailUrlRef.current = exercise.animation_url;
          setThumbnail(exercise.animation_url);
          setLoading(false);
        }
        return;
      }

      // Priority 3: Generate from video (throttled + timeout)
      if (videoUrl && !isVideoUrl(videoUrl) && !isImageUrl(videoUrl)) {
        timeoutRef.current = setTimeout(() => {
          if (!cancelled) setLoading(false);
        }, 3000);

        try {
          const generated = await enqueueLoad(() => generateVideoThumbnail(videoUrl));
          if (!cancelled) {
            clearTimeout(timeoutRef.current);
            if (generated) {
              thumbnailUrlRef.current = generated;
              setThumbnail(generated);
            }
            setLoading(false);
          }
        } catch {
          if (!cancelled) {
            clearTimeout(timeoutRef.current);
            setLoading(false);
          }
        }
        return;
      }

      // No media available
      if (!cancelled) {
        thumbnailUrlRef.current = null;
        setThumbnail(null);
        setLoading(false);
      }
    }

    resolveThumbnail();

    return () => {
      cancelled = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [exercise?.id, exercise?.thumbnail_url, exercise?.video_url, exercise?.animation_url, exercise?.customVideoUrl, exercise?.customVideoThumbnail, videoUrl]);

  const handleImageError = useCallback(() => {
    setError(true);
    setThumbnail(null);
    thumbnailUrlRef.current = null;
  }, []);

  // Determine whether we should render the <img> tag.
  // When scrolled far off-screen, we deliberately remove the <img> so iOS
  // can reclaim the decoded GPU texture memory for that bitmap.
  const shouldShowImage = thumbnail && !error && isNearViewport;

  const sizeClasses = {
    small: 'smart-thumb-small',
    medium: 'smart-thumb-medium',
    large: 'smart-thumb-large'
  };

  return (
    <div
      ref={containerRef}
      className={`smart-thumbnail ${sizeClasses[size]} ${className} ${loading ? 'loading' : ''}`}
      onClick={onClick}
    >
      {shouldShowImage ? (
        <img
          src={thumbnail}
          alt={exercise?.name || 'Exercise'}
          width={px}
          height={px}
          decoding="async"
          loading="lazy"
          onError={handleImageError}
        />
      ) : (
        <div className="smart-thumb-placeholder">
          <Dumbbell size={size === 'small' ? 16 : size === 'large' ? 32 : 24} />
        </div>
      )}

      {/* Play indicator for videos */}
      {showPlayIndicator && hasVideo && !loading && thumbnail && isNearViewport && (
        <div className="smart-thumb-play">
          <Play size={size === 'small' ? 10 : size === 'large' ? 16 : 12} />
        </div>
      )}

      {/* Loading shimmer */}
      {loading && <div className="smart-thumb-shimmer" />}
    </div>
  );
}

export default SmartThumbnail;
