import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_KEY = 'pwa_install_dismissed';
const DISMISS_DAYS = 7;

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true ||
         document.referrer.includes('android-app://');
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function isIOSSafari() {
  return isIOS() && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent);
}

function isDismissed() {
  try {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (!dismissed) return false;
    const daysSince = (Date.now() - parseInt(dismissed, 10)) / (1000 * 60 * 60 * 24);
    return daysSince < DISMISS_DAYS;
  } catch {
    return false;
  }
}

export function useInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(isStandalone());
  const [dismissed, setDismissed] = useState(isDismissed());
  const promptRef = useRef(null);

  // Capture the beforeinstallprompt event
  useEffect(() => {
    if (isStandalone()) return;

    const handler = (e) => {
      e.preventDefault();
      promptRef.current = e;
      setInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      promptRef.current = null;
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    const prompt = promptRef.current;
    if (!prompt) return false;

    prompt.prompt();
    const result = await prompt.userChoice;
    if (result.outcome === 'accepted') {
      setIsInstalled(true);
    }
    promptRef.current = null;
    setInstallPrompt(null);
    return result.outcome === 'accepted';
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, Date.now().toString());
    } catch { /* ignore */ }
    setDismissed(true);
  }, []);

  // Can we show the native one-tap install? (Chrome/Edge/Android)
  const canInstallNatively = !!installPrompt;

  // Should we show iOS instructions?
  const showIOSInstructions = isIOSSafari() && !isStandalone();

  // Should the banner be visible at all?
  const showBanner = !isInstalled && !dismissed && (canInstallNatively || showIOSInstructions);

  return {
    showBanner,
    canInstallNatively,
    showIOSInstructions,
    isInstalled,
    triggerInstall,
    dismiss,
  };
}
