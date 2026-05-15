/**
 * Supabase load guard
 *
 * Purely additive safety net. Include immediately AFTER the Supabase CDN
 * <script> tag and BEFORE the page's own init script.
 *
 * If the Supabase library global is present (the normal case) this is a
 * no-op and page behaviour is identical. If the CDN failed to load (CDN
 * outage, offline, or a content/script blocker), the page's init code would
 * otherwise throw an uncaught ReferenceError and leave a blank white screen.
 * This replaces that blank screen with a clear, actionable message.
 *
 * Scope: this is a *messaging* safety net, not auto-recovery. It does not
 * retry or load a backup CDN — that requires deferring init and is handled
 * separately.
 */
(function () {
  'use strict';

  // Healthy path: library loaded. Do nothing, behave exactly as before.
  if (typeof window.supabase !== 'undefined' &&
      window.supabase &&
      typeof window.supabase.createClient === 'function') {
    return;
  }

  function showLoadError() {
    if (document.getElementById('zq-load-error')) return;

    var overlay = document.createElement('div');
    overlay.id = 'zq-load-error';
    overlay.setAttribute('role', 'alert');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2147483647',
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:#0f172a', 'color:#e2e8f0', 'text-align:center',
      'padding:24px', 'margin:0',
      'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif'
    ].join(';');

    overlay.innerHTML =
      '<div style="max-width:360px">' +
        '<div style="font-size:22px;font-weight:600;margin-bottom:10px">' +
          'Couldn’t finish loading' +
        '</div>' +
        '<div style="opacity:.8;line-height:1.55;margin-bottom:22px">' +
          'A required component didn’t load. This is usually a brief ' +
          'network hiccup or a content/script-blocking browser extension. ' +
          'Your data is safe — nothing was lost.' +
        '</div>' +
        '<button id="zq-load-error-reload" ' +
          'style="background:#6366f1;color:#fff;border:0;padding:12px 24px;' +
          'border-radius:8px;font-size:15px;font-weight:600;cursor:pointer">' +
          'Reload' +
        '</button>' +
      '</div>';

    (document.body || document.documentElement).appendChild(overlay);

    var btn = document.getElementById('zq-load-error-reload');
    if (btn) {
      btn.addEventListener('click', function () { location.reload(); });
    }
  }

  if (document.body) {
    showLoadError();
  } else {
    document.addEventListener('DOMContentLoaded', showLoadError);
  }
})();
