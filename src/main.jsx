import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { BrandingProvider } from './context/BrandingContext';
import { ToastProvider } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import './styles/global.css';

// Prevent browser from auto-restoring scroll position on page load/navigation.
// Without this, the browser restores the previous scroll position AFTER React's
// useEffect scroll-to-top calls, causing pages to open semi-scrolled.
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

// Top-level ErrorBoundary catches crashes that originate ABOVE Layout —
// the context providers (AuthProvider, BrandingProvider, ToastProvider),
// App's routing setup, and unauthenticated routes like /login and
// /forgot-password. The existing ErrorBoundary inside Layout.jsx still
// catches errors inside routed pages first (innermost-wins), so this
// outer boundary only fires when something would otherwise white-screen
// the entire app — e.g., a context provider throwing on first render
// from a corrupted cache.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename="/app">
      <ErrorBoundary>
        <AuthProvider>
          <BrandingProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </BrandingProvider>
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>
);

// Register service worker for PWA support + safe auto-update.
// Without update handling an installed (home-screen) app stays pinned to
// whatever code it first cached. We proactively check for a newer worker
// on every launch, and reload ONCE when it takes control — but only when
// it is completely safe to do so:
//   - never on first install (no controller to replace)
//   - never while a workout is active: the guided-workout overlay is open,
//     OR the user is on the workouts route where normal set-logging happens
//     (in those cases the update simply lands on the next cold launch — the
//     service-worker change above makes that reliable on its own)
//   - at most once per browsing session, via a persistent sessionStorage
//     one-shot flag, so a misbehaving worker can never cause a reload loop
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  const RELOAD_FLAG = 'zq-sw-reloaded';
  let refreshing = false;

  const workoutActive = () =>
    !!document.querySelector('.guided-workout-overlay') ||
    /\/workouts(\/|$)/.test(window.location.pathname);

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing || !hadController) return;
    if (workoutActive()) return;
    try {
      if (sessionStorage.getItem(RELOAD_FLAG)) return;
      sessionStorage.setItem(RELOAD_FLAG, '1');
    } catch { /* sessionStorage unavailable — fall through to single reload */ }
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Proactively check for a newer worker on every launch.
      try { reg.update(); } catch { /* ignore */ }
    }).catch(() => {});
  });
}
