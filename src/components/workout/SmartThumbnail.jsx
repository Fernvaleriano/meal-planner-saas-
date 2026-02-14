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

// Muscle-group color/gradient mapping for placeholders
const MUSCLE_GROUP_STYLES = {
  chest:     { gradient: 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)', label: 'CH' },
  back:      { gradient: 'linear-gradient(135deg, #3498db 0%, #2980b9 100%)', label: 'BK' },
  shoulders: { gradient: 'linear-gradient(135deg, #e67e22 0%, #d35400 100%)', label: 'SH' },
  legs:      { gradient: 'linear-gradient(135deg, #27ae60 0%, #229954 100%)', label: 'LG' },
  arms:      { gradient: 'linear-gradient(135deg, #9b59b6 0%, #8e44ad 100%)', label: 'AR' },
  core:      { gradient: 'linear-gradient(135deg, #f39c12 0%, #e67e22 100%)', label: 'CR' },
  full_body: { gradient: 'linear-gradient(135deg, #1abc9c 0%, #16a085 100%)', label: 'FB' },
  cardio:    { gradient: 'linear-gradient(135deg, #e74c3c 0%, #e67e22 100%)', label: 'CD' },
};

const DEFAULT_STYLE = { gradient: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)', label: '' };

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

  const hasVideo = !!(exercise?.video_url || exercise?.animation_url);
  const videoUrl = exercise?.video_url || exercise?.animation_url;
  const px = SIZE_PX[size] || 80;

  // Resolve muscle-group style for placeholder
  const muscleGroup = exercise?.muscle_group?.toLowerCase() || '';
  const mgStyle = MUSCLE_GROUP_STYLES[muscleGroup] || DEFAULT_STYLE;

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
  }, [exercise?.id, exercise?.thumbnail_url, exercise?.video_url, exercise?.animation_url, videoUrl]);

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

  // Apply muscle-group gradient only when showing placeholder
  const containerStyle = (!shouldShowImage && !loading)
    ? { background: mgStyle.gradient }
    : undefined;

  return (
    <div
      ref={containerRef}
      className={`smart-thumbnail ${sizeClasses[size]} ${className} ${loading ? 'loading' : ''}`}
      style={containerStyle}
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
          {mgStyle.label && (
            <span className="smart-thumb-muscle-label">{mgStyle.label}</span>
          )}
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
