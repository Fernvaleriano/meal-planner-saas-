// Zique Fitness PWA Service Worker
const CACHE_NAME = 'zique-fitness-v12';
const STATIC_CACHE = 'zique-static-v12';
const DATA_CACHE = 'zique-data-v9';
const CDN_CACHE = 'zique-cdn-v7';

// Files to cache for offline use
const STATIC_FILES = [
  '/',
  '/index.html',
  '/portal.html',
  '/dashboard.html',
  '/planner.html',
  '/view-plan.html',
  '/manifest.json',
  // Client app pages
  '/client-dashboard.html',
  '/client-diary.html',
  '/client-favorites.html',
  '/client-recipes.html',
  '/client-settings.html',
  '/client-checkin.html',
  '/client-progress.html',
  '/client-plans.html',
  '/client-login.html',
  // Styles
  '/styles/brand.css',
  '/styles/coach-layout.css',
  // Core JS
  '/js/theme.js',
  '/js/branding.js'
];

// CDN resources to cache (long-lived, rarely change)
const CDN_FILES = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0',
  'https://unpkg.com/lucide@0.312.0/dist/umd/lucide.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// API endpoints to cache (stale-while-revalidate)
// Don't cache food-diary - it needs fresh data every time
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
  /\/\.netlify\/functions\/exercises/
];

// Max age for cached API responses (5 minutes).
// Responses older than this are still served instantly but the background
// revalidation is prioritized.
const DATA_CACHE_MAX_AGE = 5 * 60 * 1000;

// Install event - cache static files and CDN resources
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    Promise.all([
      // Cache static files
      caches.open(STATIC_CACHE)
        .then((cache) => {
          console.log('[SW] Caching static files');
          return cache.addAll(STATIC_FILES);
        }),
      // Cache CDN resources
      caches.open(CDN_CACHE)
        .then((cache) => {
          console.log('[SW] Caching CDN resources');
          return Promise.all(
            CDN_FILES.map(url =>
              fetch(url, { mode: 'cors' })
                .then(response => {
                  if (response.ok) {
                    return cache.put(url, response);
                  }
                })
                .catch(err => console.log('[SW] CDN cache error:', url, err))
            )
          );
        })
    ])
    .then(() => self.skipWaiting())
    .catch((err) => console.log('[SW] Cache error:', err))
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  const keepCaches = [CACHE_NAME, STATIC_CACHE, DATA_CACHE, CDN_CACHE];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !keepCaches.includes(name))
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Check if URL matches cacheable API patterns
function isCacheableAPI(url) {
  return CACHEABLE_API_PATTERNS.some(pattern => pattern.test(url.pathname));
}

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // CRITICAL: ALWAYS fetch client-feed.html fresh - never cache it
  // This must be first to prevent any caching issues
  if (url.pathname.includes('client-feed.html')) {
    console.log('[SW] Bypassing ALL caching for client-feed.html');
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
  if (url.pathname.startsWith('/.netlify/') && isCacheableAPI(url)) {
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(request);

        // Fetch fresh data in background
        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse.ok) {
            // Clone and add a timestamp header so we know how old the cache is
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

        // Return cached immediately if available, otherwise wait for network
        if (cachedResponse) {
          // Check cache age — if it's very fresh (<30s), skip background fetch
          const cacheTime = cachedResponse.headers.get('sw-cache-time');
          if (!cacheTime || (Date.now() - Number(cacheTime)) > 30000) {
            // Cache is stale or has no timestamp — revalidate in background
            // fetchPromise runs in background, result ignored here
          }
          return cachedResponse;
        }
        return fetchPromise;
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
            return response || caches.match('/portal.html');
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
    console.log('[SW] Warming cache for', urls.length, 'URLs');

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
              console.log('[SW] Warm cache miss:', url, err.message);
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
      body: data.body || 'New notification from Zique Fitness',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      vibrate: [100, 50, 100],
      data: {
        url: data.url || '/portal.html'
      }
    };
    event.waitUntil(
      self.registration.showNotification(data.title || 'Zique Fitness', options)
    );
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/portal.html';
  event.waitUntil(
    clients.openWindow(url)
  );
});
