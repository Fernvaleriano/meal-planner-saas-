import { useState, useEffect, useRef } from 'react';
import { Dumbbell, Play } from 'lucide-react';
import { generateVideoThumbnail } from '../../utils/videoThumbnail';

/**
 * Smart Thumbnail Component
 * Displays thumbnail for exercises, auto-generating from video if needed
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
  const videoRef = useRef(null);

  const hasVideo = !!(exercise?.video_url || exercise?.animation_url);
  const videoUrl = exercise?.video_url || exercise?.animation_url;

  // Check if URL is an image format
  const isImageUrl = (url) => {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.endsWith('.gif') || lower.endsWith('.png') || lower.endsWith('.jpg') ||
           lower.endsWith('.jpeg') || lower.endsWith('.webp') || lower.endsWith('.svg');
  };

  useEffect(() => {
    let cancelled = false;

    async function loadThumbnail() {
      setLoading(true);
      setError(false);

      // Priority 1: Use thumbnail_url if available
      if (exercise?.thumbnail_url) {
        setThumbnail(exercise.thumbnail_url);
        setLoading(false);
        return;
      }

      // Priority 2: Use animation_url if it's an image
      if (exercise?.animation_url && isImageUrl(exercise.animation_url)) {
        setThumbnail(exercise.animation_url);
        setLoading(false);
        return;
      }

      // Priority 3: Generate from video
      if (videoUrl && !isImageUrl(videoUrl)) {
        const generated = await generateVideoThumbnail(videoUrl);
        if (!cancelled) {
          if (generated) {
            setThumbnail(generated);
          } else {
            // Use video element as fallback
            setThumbnail(null);
          }
          setLoading(false);
        }
        return;
      }

      // No media available
      if (!cancelled) {
        setThumbnail(null);
        setLoading(false);
      }
    }

    loadThumbnail();

    return () => {
      cancelled = true;
    };
  }, [exercise?.id, exercise?.thumbnail_url, exercise?.video_url, exercise?.animation_url, videoUrl]);

  const handleImageError = () => {
    setError(true);
    setThumbnail(null);
  };

  const sizeClasses = {
    small: 'smart-thumb-small',
    medium: 'smart-thumb-medium',
    large: 'smart-thumb-large'
  };

  return (
    <div
      className={`smart-thumbnail ${sizeClasses[size]} ${className} ${loading ? 'loading' : ''}`}
      onClick={onClick}
    >
      {/* Show generated/cached thumbnail or static image */}
      {thumbnail && !error ? (
        <img
          src={thumbnail}
          alt={exercise?.name || 'Exercise'}
          loading="lazy"
          onError={handleImageError}
        />
      ) : videoUrl && !error ? (
        /* Fallback: inline video preview */
        <video
          ref={videoRef}
          src={videoUrl}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={() => {
            // Seek to 0.5s for better preview
            if (videoRef.current) {
              videoRef.current.currentTime = 0.5;
            }
          }}
          onError={() => setError(true)}
        />
      ) : (
        /* No media - show placeholder */
        <div className="smart-thumb-placeholder">
          <Dumbbell size={size === 'small' ? 16 : size === 'large' ? 32 : 24} />
        </div>
      )}

      {/* Play indicator for videos */}
      {showPlayIndicator && hasVideo && !loading && (
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
