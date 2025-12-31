/**
 * Video Thumbnail Generator
 * Captures first frame of videos and caches them for use as thumbnails
 */

// In-memory cache for generated thumbnails
const thumbnailCache = new Map();

// IndexedDB for persistent storage
const DB_NAME = 'exercise-thumbnails';
const STORE_NAME = 'thumbnails';
const DB_VERSION = 1;

let db = null;

// Initialize IndexedDB
async function initDB() {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'url' });
      }
    };
  });
}

// Save thumbnail to IndexedDB
async function saveThumbnail(videoUrl, dataUrl) {
  try {
    const database = await initDB();
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({ url: videoUrl, thumbnail: dataUrl, timestamp: Date.now() });
  } catch (e) {
    console.warn('Failed to save thumbnail to IndexedDB:', e);
  }
}

// Load thumbnail from IndexedDB
async function loadThumbnail(videoUrl) {
  try {
    const database = await initDB();
    return new Promise((resolve) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(videoUrl);

      request.onsuccess = () => {
        const result = request.result;
        // Cache for 7 days
        if (result && Date.now() - result.timestamp < 7 * 24 * 60 * 60 * 1000) {
          resolve(result.thumbnail);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

/**
 * Generate thumbnail from video URL
 * @param {string} videoUrl - URL of the video
 * @param {number} seekTime - Time in seconds to capture frame (default: 0.5)
 * @returns {Promise<string|null>} - Data URL of thumbnail or null on failure
 */
export async function generateVideoThumbnail(videoUrl, seekTime = 0.5) {
  if (!videoUrl) return null;

  // Check memory cache first
  if (thumbnailCache.has(videoUrl)) {
    return thumbnailCache.get(videoUrl);
  }

  // Check IndexedDB cache
  const cached = await loadThumbnail(videoUrl);
  if (cached) {
    thumbnailCache.set(videoUrl, cached);
    return cached;
  }

  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    let resolved = false;

    const cleanup = () => {
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      video.src = '';
      video.load();
    };

    const onError = () => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(null);
      }
    };

    const onSeeked = () => {
      if (resolved) return;

      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 180;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

        // Cache it
        thumbnailCache.set(videoUrl, dataUrl);
        saveThumbnail(videoUrl, dataUrl);

        resolved = true;
        cleanup();
        resolve(dataUrl);
      } catch (e) {
        console.warn('Failed to capture video frame:', e);
        resolved = true;
        cleanup();
        resolve(null);
      }
    };

    const onLoaded = () => {
      if (resolved) return;
      video.currentTime = Math.min(seekTime, video.duration || seekTime);
    };

    video.addEventListener('loadeddata', onLoaded);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);

    // Timeout after 5 seconds
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(null);
      }
    }, 5000);

    video.src = videoUrl;
    video.load();
  });
}

/**
 * Preload thumbnails for multiple exercises
 * @param {Array} exercises - Array of exercise objects with video_url/animation_url
 */
export async function preloadThumbnails(exercises) {
  if (!exercises?.length) return;

  const videosToLoad = exercises
    .filter(ex => !ex.thumbnail_url && (ex.video_url || ex.animation_url))
    .slice(0, 10); // Limit to 10 at a time

  // Load in parallel but don't block
  Promise.all(
    videosToLoad.map(ex => generateVideoThumbnail(ex.video_url || ex.animation_url))
  ).catch(() => {});
}

/**
 * Get thumbnail URL for an exercise (async)
 * Returns thumbnail_url if available, otherwise generates from video
 * @param {Object} exercise - Exercise object
 * @returns {Promise<string>} - Thumbnail URL or placeholder
 */
export async function getExerciseThumbnail(exercise) {
  if (!exercise) return '/img/exercise-placeholder.svg';

  // If we have a proper thumbnail, use it
  if (exercise.thumbnail_url) {
    return exercise.thumbnail_url;
  }

  // Check if animation_url is an image
  const animUrl = exercise.animation_url;
  if (animUrl) {
    const lower = animUrl.toLowerCase();
    if (lower.endsWith('.gif') || lower.endsWith('.png') ||
        lower.endsWith('.jpg') || lower.endsWith('.jpeg') ||
        lower.endsWith('.webp')) {
      return animUrl;
    }
  }

  // Try to generate from video
  const videoUrl = exercise.video_url || exercise.animation_url;
  if (videoUrl) {
    const generated = await generateVideoThumbnail(videoUrl);
    if (generated) return generated;
  }

  return '/img/exercise-placeholder.svg';
}

/**
 * Clear thumbnail cache (useful for debugging)
 */
export async function clearThumbnailCache() {
  thumbnailCache.clear();
  try {
    const database = await initDB();
    const tx = database.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
  } catch (e) {
    console.warn('Failed to clear IndexedDB cache:', e);
  }
}

export default {
  generateVideoThumbnail,
  preloadThumbnails,
  getExerciseThumbnail,
  clearThumbnailCache
};
