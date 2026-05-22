// Ziquecoach PWA Service Worker
const CACHE_NAME = 'ziquecoach-v17';
const STATIC_CACHE = 'zique-static-v17';
const DATA_CACHE = 'zique-data-v12';
const CDN_CACHE = 'zique-cdn-v7';
const VIDEO_CACHE = 'zique-video-v2';
// Cap the video cache so it doesn't grow without bound. ~15 videos at
// an average of ~15MB each puts the worst case around 225MB — enough
// to cover the current workout and a few before/after, but small in
// modern-phone terms (a handful of camera photos).
const VIDEO_CACHE_MAX_ENTRIES = 15;

// Files to cache for offline use
const STATIC_FILES = [
  '/',
  '/index.html',
  '/app',
  '/manifest.json',
  // Core JS
  '/js/theme.js'
];

// CDN resources to cache (long-lived, rarely change)
const CDN_FILES = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0',
  'https://unpkg.com/lucide@0.312.0/dist/umd/lucide.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// API endpoints to cache (stale-while-revalidate).
// These are served from cache instantly on resume and refreshed in the background.
// Previously food-diary, meal-plans, workout-assignments, and get-diary-interactions
// were excluded ("needs fresh data every time"), but that meant users saw EMPTY pages
// for 10-25 seconds on resume while the resume gate + cold starts resolved.
// Stale data from 30 min ago is far better than no data for 25 seconds.
// The SWR pattern handles this: show stale instantly, update when fresh arrives.
const CACHEABLE_API_PATTERNS = [
  /\/\.netlify\/functions\/calorie-goals/,
  /\/\.netlify\/functions\/get-favorites/,
  /\/\.netlify\/functions\/get-recipes/,
  /\/\.netlify\/functions\/get-branding/,
  /\/\.netlify\/functions\/get-plans/,
  /\/\.netlify\/functions\/get-profile/,
  /\/\.netlify\/functions\/get-coach-branding/,
  /\/\.netlify\/functions\/get-dashboard-stats/,
  /\/\.netlify\/functions\/client-protocols/,
  /\/\.netlify\/functions\/notifications/,
  /\/\.netlify\/functions\/exercises/,
  // Critical resume-time endpoints — added to eliminate the "partial content" problem
  // on iPhone where users saw empty pages for 10-25s after returning from background
  /\/\.netlify\/functions\/food-diary/,
  /\/\.netlify\/functions\/workout-assignments/,
  /\/\.netlify\/functions\/meal-plans/,
  /\/\.netlify\/functions\/get-diary-interactions/,
  /\/\.netlify\/functions\/supplement-intake/,
  /\/\.netlify\/functions\/water-intake/,
  /\/\.netlify\/functions\/workout-logs/,
  /\/\.netlify\/functions\/adhoc-workouts/,
  // Navigation-time endpoints — cached so switching between pages in the
  // bottom nav doesn't trigger a full reload
  // NOTE: chat is intentionally excluded — real-time messaging must never
  // serve stale data from the SW cache.  The React component is persistent
  // (stays mounted across tab switches) so its own state already provides
  // instant display.  SW caching caused sent messages to vanish because the
  // stale cached response (from before the send) would overwrite fresh state
  // on the next polling cycle.
  /\/\.netlify\/functions\/get-measurements/,
  /\/\.netlify\/functions\/get-progress-photos/,
  /\/\.netlify\/functions\/get-coach-stories/,
  /\/\.netlify\/functions\/exercise-references/,
  /\/\.netlify\/functions\/save-checkin/,
  /\/\.netlify\/functions\/toggle-favorite/,
  /\/\.netlify\/functions\/saved-meals/
];

// Max age for cached API responses (5 minutes).
// Responses older than this are still served instantly but the background
// revalidation is prioritized.
const DATA_CACHE_MAX_AGE = 5 * 60 * 1000;

// API endpoints that must ALWAYS go network-first (cache is offline-only fallback).
// These hold data the coach can edit at any moment and propagate to clients —
// serving stale cache here causes the "I saved a change but the client still
// sees the old value" bug. The X-Cache-Bypass header path already handles this
// correctly on resume; these patterns extend the same behaviour to every fetch.
const NETWORK_FIRST_API_PATTERNS = [
  /\/\.netlify\/functions\/workout-assignments/,
  /\/\.netlify\/functions\/workout-logs/,
  /\/\.netlify\/functions\/adhoc-workouts/,
  // Branding is edited from branding-settings.html and propagates to every
  // coach/client page — SWR here meant a 30+ min delay before saved logo /
  // color changes showed up. Network-first fixes that; cache still serves
  // as the offline fallback.
  /\/\.netlify\/functions\/get-coach-branding/
];

// Install event - cache static files and CDN resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      // Cache static files
      caches.open(STATIC_CACHE)
        .then((cache) => {
          return cache.addAll(STATIC_FILES);
        }),
      // Cache CDN resources
      caches.open(CDN_CACHE)
        .then((cache) => {
          return Promise.all(
            CDN_FILES.map(url =>
              fetch(url, { mode: 'cors' })
                .then(response => {
                  if (response.ok) {
                    return cache.put(url, response);
                  }
                })
                .catch(() => {})
            )
          );
        })
    ])
    .then(() => self.skipWaiting())
    .catch(() => {})
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  const keepCaches = [CACHE_NAME, STATIC_CACHE, DATA_CACHE, CDN_CACHE, VIDEO_CACHE];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !keepCaches.includes(name))
          .map((name) => {
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});


// Identify exercise video files we want to keep on the device so playback
// is instant on the second tap and across page reloads. Coach uploads land
// on Supabase storage; library animations are tiny so the cache is a wash
// either way — the extension check covers both.
function isVideoRequest(request, url) {
  return /\.(mp4|mov|m4v)$/i.test(url.pathname);
}

// Stable cache key that ignores volatile query params (signed-URL tokens
// rotate every fetch on coach uploads, so without this the cache would
// miss on every reload). Hostname + pathname is enough to identify the
// underlying file.
function videoCacheKey(url) {
  return new Request(url.origin + url.pathname, { method: 'GET' });
}

// Synthesize a 206 Partial Content response from a full cached body.
// iOS Safari plays <video> by issuing Range requests; if the SW returns
// the full 200 response it works but is slower (the engine re-issues
// ranges anyway). Returning a real 206 keeps playback snappy.
async function rangeResponseFromCache(cachedResponse, rangeHeader) {
  const buf = await cachedResponse.clone().arrayBuffer();
  const total = buf.byteLength;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader || '');
  let start = 0;
  let end = total - 1;
  if (match) {
    if (match[1] !== '') start = parseInt(match[1], 10);
    if (match[2] !== '') end = parseInt(match[2], 10);
  }
  if (isNaN(start) || isNaN(end) || start > end || start >= total) {
    return new Response(null, {
      status: 416,
      statusText: 'Range Not Satisfiable',
      headers: { 'Content-Range': `bytes */${total}` }
    });
  }
  end = Math.min(end, total - 1);
  const slice = buf.slice(start, end + 1);
  const contentType =
    cachedResponse.headers.get('Content-Type') || 'video/mp4';
  return new Response(slice, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(slice.byteLength),
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes'
    }
  });
}

// Drop oldest cached videos beyond the cap. Cache.keys() returns entries
// in insertion order, so older puts naturally sit at the front.
async function trimVideoCache(cache) {
  try {
    const keys = await cache.keys();
    const excess = keys.length - VIDEO_CACHE_MAX_ENTRIES;
    for (let i = 0; i < excess; i++) {
      await cache.delete(keys[i]);
    }
  } catch (e) { /* ignore */ }
}

// Check if URL matches cacheable API patterns
function isCacheableAPI(url) {
  return CACHEABLE_API_PATTERNS.some(pattern => pattern.test(url.pathname));
}

// Check if URL must be served network-first (cache only as offline fallback)
function isNetworkFirstAPI(url) {
  return NETWORK_FIRST_API_PATTERNS.some(pattern => pattern.test(url.pathname));
}

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Video assets (mp4/mov/m4v): cache-first, with proper Range handling
  // so iOS native <video> (which always requests by Range) actually gets
  // served from the on-device cache instead of falling through to the
  // network. We store the FULL file (cache key strips the volatile signed
  // -URL query string) and synthesize 206 responses on demand.
  if (isVideoRequest(request, url)) {
    const rangeHeader = request.headers.get('range');
    event.respondWith(
      caches.open(VIDEO_CACHE).then(async (cache) => {
        const key = videoCacheKey(url);
        let cached = await cache.match(key);
        if (!cached) {
          // No cached copy — fetch the full file (force a non-range GET
          // so we get the entire body, not just whatever range the
          // <video> element asked for) and store it.
          try {
            const fullReq = new Request(request.url, {
              method: 'GET',
              credentials: request.credentials,
              mode: request.mode === 'navigate' ? 'cors' : request.mode,
              redirect: 'follow'
              // Intentionally no Range header — we want the whole file.
            });
            const fullResp = await fetch(fullReq);
            if (fullResp && fullResp.status === 200) {
              // Read the full body now so future Range responses can
              // be synthesized from a single complete buffer.
              const body = await fullResp.clone().arrayBuffer();
              const storedHeaders = new Headers(fullResp.headers);
              storedHeaders.delete('Content-Range');
              storedHeaders.set('Content-Length', String(body.byteLength));
              storedHeaders.set('Accept-Ranges', 'bytes');
              const stored = new Response(body, {
                status: 200,
                statusText: 'OK',
                headers: storedHeaders
              });
              await cache.put(key, stored.clone());
              trimVideoCache(cache);
              cached = stored;
            } else {
              // Either the server insisted on 206 (rare without Range)
              // or it errored (404, signed-URL expired, etc.). Either
              // way, don't try to cache — pass it through so the
              // <video> element's error path can refresh the URL.
              return fullResp;
            }
          } catch (err) {
            // Network failure — let the <video> element see the error.
            return new Response('', { status: 502 });
          }
        }
        if (rangeHeader) {
          return rangeResponseFromCache(cached, rangeHeader);
        }
        return cached;
      })
    );
    return;
  }

  // CRITICAL: ALWAYS fetch client-feed.html fresh - never cache it
  // This must be first to prevent any caching issues
  if (url.pathname.includes('client-feed.html')) {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(() => {
        return new Response('Client Feed temporarily unavailable', {
          status: 503,
          headers: { 'Content-Type': 'text/html' }
        });
      })
    );
    return;
  }

  // Handle cacheable API calls with stale-while-revalidate
  // When request has X-Cache-Bypass header (set on resume), go network-first:
  // try network, fall back to cache. This ensures resume refetches get FRESH data
  // instead of stale cache entries from before the app was backgrounded.
  if (url.pathname.startsWith('/.netlify/') && isCacheableAPI(url)) {
    const bypassCache =
      request.headers.get('X-Cache-Bypass') === '1' || isNetworkFirstAPI(url);

    if (bypassCache) {
      // NETWORK-FIRST: Resume refetch — get fresh data, fall back to cache
      event.respondWith(
        caches.open(DATA_CACHE).then(async (cache) => {
          try {
            const networkResponse = await fetch(request);
            if (networkResponse.ok) {
              const headers = new Headers(networkResponse.headers);
              headers.set('sw-cache-time', String(Date.now()));
              const timestampedResponse = new Response(networkResponse.clone().body, {
                status: networkResponse.status,
                statusText: networkResponse.statusText,
                headers
              });
              cache.put(request, timestampedResponse);
            }
            return networkResponse;
          } catch {
            // Network failed — fall back to cache (stale data > no data)
            const cachedResponse = await cache.match(request);
            return cachedResponse || new Response('{"error":"offline"}', {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        })
      );
      return;
    }

    // STALE-WHILE-REVALIDATE: Normal navigation — serve cache, update in background
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(request);

        // Only start background fetch if cache is stale (>30s old) or missing
        const cacheTime = cachedResponse?.headers.get('sw-cache-time');
        const isFresh = cacheTime && (Date.now() - Number(cacheTime)) < 30000;

        if (!isFresh) {
          // Background revalidation — protected with waitUntil so the browser
          // doesn't kill it when the SW goes idle (critical on iOS)
          const revalidation = fetch(request).then((networkResponse) => {
            if (networkResponse.ok) {
              const headers = new Headers(networkResponse.headers);
              headers.set('sw-cache-time', String(Date.now()));
              const timestampedResponse = new Response(networkResponse.clone().body, {
                status: networkResponse.status,
                statusText: networkResponse.statusText,
                headers
              });
              cache.put(request, timestampedResponse);
            }
            return networkResponse;
          }).catch(() => null);

          event.waitUntil(revalidation);

          // No cache? Wait for network
          if (!cachedResponse) {
            return revalidation;
          }
        }

        return cachedResponse;
      })
    );
    return;
  }

  // Handle CDN requests - cache first with background update
  if (url.hostname.includes('cdn.jsdelivr.net') ||
      url.hostname.includes('unpkg.com') ||
      url.hostname.includes('cdnjs.cloudflare.com')) {
    event.respondWith(
      caches.open(CDN_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(request);

        // Fetch fresh in background - use credentials: 'omit' to avoid CORS issues
        const fetchPromise = fetch(request.url, { mode: 'cors', credentials: 'omit' })
          .then((networkResponse) => {
            if (networkResponse.ok) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => null);

        // Return cached immediately if available
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetchPromise;
      })
    );
    return;
  }

  // Skip other API calls and external requests - always go to network
  if (url.pathname.startsWith('/.netlify/') ||
      url.pathname.startsWith('/api/') ||
      url.hostname !== location.hostname ||
      url.hostname.includes('supabase') ||
      url.hostname.includes('replicate')) {
    return;
  }

  // For HTML pages - network first, fallback to cache
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache the fresh response
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Offline - try cache
          return caches.match(request).then((response) => {
            return response || caches.match('/app');
          });
        })
    );
    return;
  }

  // For other assets - cache first, fallback to network
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached version and update cache in background
          fetch(request).then((response) => {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, response);
            });
          }).catch(() => {});
          return cachedResponse;
        }

        // Not in cache - fetch from network
        return fetch(request).then((response) => {
          // Cache the response for next time
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        });
      })
  );
});

// Handle messages from the app (e.g., cache warm-up requests)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'WARM_CACHE') {
    // Pre-fetch and cache API endpoints the user is likely to need next.
    // Called when the app resumes from background to make navigation instant.
    const urls = event.data.urls || [];

    event.waitUntil(
      caches.open(DATA_CACHE).then((cache) => {
        return Promise.allSettled(
          urls.map(async (url) => {
            try {
              const response = await fetch(url, { credentials: 'same-origin' });
              if (response.ok) {
                const headers = new Headers(response.headers);
                headers.set('sw-cache-time', String(Date.now()));
                const timestampedResponse = new Response(response.body, {
                  status: response.status,
                  statusText: response.statusText,
                  headers
                });
                await cache.put(new Request(url), timestampedResponse);
              }
            } catch (err) {
              // Silent fail — cache warming is best-effort
            }
          })
        );
      })
    );
  }

  if (event.data && event.data.type === 'CLEAR_DATA_CACHE') {
    // Clear the data cache (e.g., on logout)
    event.waitUntil(caches.delete(DATA_CACHE));
  }
});

// Handle push notifications (for future use)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body || 'New notification from Ziquecoach',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      vibrate: [100, 50, 100],
      data: {
        url: data.url || '/app'
      }
    };
    event.waitUntil(
      self.registration.showNotification(data.title || 'Ziquecoach', options)
    );
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/app';
  event.waitUntil(
    clients.openWindow(url)
  );
});
