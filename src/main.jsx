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

// Register service worker for PWA support + auto-update.
// Without this, an installed (home-screen) app stays pinned to whatever
// code it first cached and never picks up new deploys. We reload ONCE when
// a new service worker takes control — but only when it's safe: never the
// first install, never mid-guided-workout, and guarded against reload loops.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let refreshing = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    if (!hadController) return; // first install — nothing to refresh
    // Never yank the page out from under an active guided workout.
    if (document.querySelector('.guided-workout-overlay')) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Proactively check for a newer service worker on every launch.
      try { reg.update(); } catch { /* ignore */ }
    }).catch(() => {});
  });
}
