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
  const [useVideoFallback, setUseVideoFallback] = useState(false);
  const videoRef = useRef(null);
  const timeoutRef = useRef(null);

  const hasVideo = !!(exercise?.video_url || exercise?.animation_url);
  const videoUrl = exercise?.video_url || exercise?.animation_url;

  // Check if URL is an image format
  const isImageUrl = (url) => {
    if (!url) return false;
    const lower = url.split('?')[0].toLowerCase(); // strip query params for signed URLs
    return lower.endsWith('.gif') || lower.endsWith('.png') || lower.endsWith('.jpg') ||
           lower.endsWith('.jpeg') || lower.endsWith('.webp') || lower.endsWith('.svg');
  };

  // Check if URL is a video format — used to catch the AI workout bug where
  // thumbnail_url is set to a video URL (match.video_url fallback).
  // Loading a .mp4 as <img> fails, then falls back to <video>, creating 15+
  // simultaneous video elements that lock up the main thread on mobile.
  const isVideoUrl = (url) => {
    if (!url) return false;
    const lower = url.split('?')[0].toLowerCase();
    return lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov') ||
           lower.endsWith('.avi') || lower.endsWith('.m4v');
  };

  useEffect(() => {
    let cancelled = false;

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    async function loadThumbnail() {
      setLoading(true);
      setError(false);
      setUseVideoFallback(false);

      // Priority 1: Use thumbnail_url if available AND it's not a video URL.
      // AI workout generator (generate-workout-claude.js) sets thumbnail_url to
      // match.video_url when no real thumbnail exists. Loading a .mp4 as <img>
      // fails on every card, causing 15+ simultaneous error→video fallback chains
      // that freeze the main thread on mobile devices.
      if (exercise?.thumbnail_url && !isVideoUrl(exercise.thumbnail_url)) {
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

      // Priority 3: Generate from video (with timeout)
      if (videoUrl && !isImageUrl(videoUrl)) {
        // Set a timeout to stop loading after 3 seconds
        timeoutRef.current = setTimeout(() => {
          if (!cancelled) {
            // If still loading after 3s, try video fallback
            setUseVideoFallback(true);
            setLoading(false);
          }
        }, 3000);

        const generated = await generateVideoThumbnail(videoUrl);
        if (!cancelled) {
          clearTimeout(timeoutRef.current);
          if (generated) {
            setThumbnail(generated);
            setLoading(false);
          } else {
            // Generation failed, try video fallback
            setUseVideoFallback(true);
            setLoading(false);
          }
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
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [exercise?.id, exercise?.thumbnail_url, exercise?.video_url, exercise?.animation_url, videoUrl]);

  const handleImageError = () => {
    setError(true);
    setThumbnail(null);
    // Try video fallback if image failed
    if (videoUrl) {
      setUseVideoFallback(true);
    }
  };

  const handleVideoError = () => {
    setError(true);
    setUseVideoFallback(false);
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
      {thumbnail && !error && !useVideoFallback ? (
        <img
          src={thumbnail}
          alt={exercise?.name || 'Exercise'}
          loading="lazy"
          onError={handleImageError}
        />
      ) : useVideoFallback && videoUrl && !error ? (
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
          onError={handleVideoError}
        />
      ) : (
        /* No media - show placeholder */
        <div className="smart-thumb-placeholder">
          <Dumbbell size={size === 'small' ? 16 : size === 'large' ? 32 : 24} />
        </div>
      )}

      {/* Play indicator for videos */}
      {showPlayIndicator && hasVideo && !loading && (thumbnail || useVideoFallback) && (
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
