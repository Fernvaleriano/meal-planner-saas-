import { useEffect } from 'react';

const HAPTIC_COOLDOWN_MS = 40;

function isStandaloneMode() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function useNativeFeel() {
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const ua = navigator.userAgent || '';
    const isiOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isStandalone = isStandaloneMode();
    const isTouch = navigator.maxTouchPoints > 0;

    root.classList.toggle('is-ios', isiOS);
    root.classList.toggle('is-standalone', isStandalone);
    root.classList.toggle('is-touch-device', isTouch);
    body.classList.toggle('is-standalone', isStandalone);

    let lastHapticAt = 0;
    const triggerHaptic = (event) => {
      if (!navigator.vibrate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
      }

      const target = event.target instanceof Element
        ? event.target.closest('button, [role="button"], .bottom-nav-item, .quick-action-card, [data-haptic]')
        : null;

      if (!target || target.hasAttribute('disabled') || target.getAttribute('aria-disabled') === 'true') {
        return;
      }

      const now = Date.now();
      if (now - lastHapticAt < HAPTIC_COOLDOWN_MS) {
        return;
      }

      lastHapticAt = now;
      navigator.vibrate(8);
    };

    document.addEventListener('pointerdown', triggerHaptic, { passive: true });

    return () => {
      document.removeEventListener('pointerdown', triggerHaptic);
      root.classList.remove('is-ios', 'is-standalone', 'is-touch-device');
      body.classList.remove('is-standalone');
    };
  }, []);
}

