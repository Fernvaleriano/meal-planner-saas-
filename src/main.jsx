import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { BrandingProvider } from './context/BrandingContext';
import { ToastProvider } from './components/Toast';
import './styles/global.css';

// Prevent browser from auto-restoring scroll position on page load/navigation.
// Without this, the browser restores the previous scroll position AFTER React's
// useEffect scroll-to-top calls, causing pages to open semi-scrolled.
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename="/app">
      <AuthProvider>
        <BrandingProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </BrandingProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// Register service worker for PWA support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
