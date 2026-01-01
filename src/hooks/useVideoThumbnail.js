import { useState, useEffect } from 'react';
import { generateVideoThumbnail } from '../utils/videoThumbnail';

/**
 * Hook to get thumbnail for an exercise
 * Automatically generates from video if no thumbnail exists
 */
export function useVideoThumbnail(exercise) {
  const [thumbnail, setThumbnail] = useState('/img/exercise-placeholder.svg');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadThumbnail() {
      if (!exercise) {
        setThumbnail('/img/exercise-placeholder.svg');
        setLoading(false);
        return;
      }

      // If we have a proper thumbnail, use it
      if (exercise.thumbnail_url) {
        setThumbnail(exercise.thumbnail_url);
        setLoading(false);
        return;
      }

      // Check if animation_url is an image
      const animUrl = exercise.animation_url;
      if (animUrl) {
        const lower = animUrl.toLowerCase();
        if (lower.endsWith('.gif') || lower.endsWith('.png') ||
            lower.endsWith('.jpg') || lower.endsWith('.jpeg') ||
            lower.endsWith('.webp')) {
          setThumbnail(animUrl);
          setLoading(false);
          return;
        }
      }

      // Try to generate from video
      const videoUrl = exercise.video_url || exercise.animation_url;
      if (videoUrl) {
        setLoading(true);
        const generated = await generateVideoThumbnail(videoUrl);
        if (!cancelled && generated) {
          setThumbnail(generated);
        }
      }

      if (!cancelled) {
        setLoading(false);
      }
    }

    loadThumbnail();

    return () => {
      cancelled = true;
    };
  }, [exercise?.id, exercise?.thumbnail_url, exercise?.video_url, exercise?.animation_url]);

  return { thumbnail, loading };
}

export default useVideoThumbnail;
