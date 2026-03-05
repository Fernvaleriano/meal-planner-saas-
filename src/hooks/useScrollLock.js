import { useEffect, useRef } from 'react';

/**
 * Lock body scroll when a modal/overlay is open.
 *
 * On iOS, `overflow: hidden` on body is enough. On Android Chrome/WebView,
 * the body can still scroll behind overlays with just overflow:hidden.
 * This hook uses the `position: fixed` technique to truly lock scroll:
 * - Saves current scrollY
 * - Sets body to position:fixed with top offset
 * - Restores scroll position on unlock
 *
 * Also locks <html> overflow for iOS Safari compatibility.
 */
export default function useScrollLock(isLocked) {
  const scrollYRef = useRef(0);

  useEffect(() => {
    if (!isLocked) return;

    // Save current scroll position
    scrollYRef.current = window.scrollY;

    const body = document.body;
    const html = document.documentElement;

    // Save originals
    const origBodyOverflow = body.style.overflow;
    const origHtmlOverflow = html.style.overflow;
    const origBodyPosition = body.style.position;
    const origBodyTop = body.style.top;
    const origBodyWidth = body.style.width;

    // Apply scroll lock — position:fixed prevents Android background scroll
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollYRef.current}px`;
    body.style.width = '100%';

    return () => {
      // Restore original styles
      body.style.overflow = origBodyOverflow;
      html.style.overflow = origHtmlOverflow;
      body.style.position = origBodyPosition;
      body.style.top = origBodyTop;
      body.style.width = origBodyWidth;

      // Restore scroll position
      window.scrollTo(0, scrollYRef.current);
    };
  }, [isLocked]);
}

/**
 * Imperative scroll lock for class components or non-hook contexts.
 * Returns an unlock function.
 */
export function lockBodyScroll() {
  const scrollY = window.scrollY;
  const body = document.body;
  const html = document.documentElement;

  const origBodyOverflow = body.style.overflow;
  const origHtmlOverflow = html.style.overflow;
  const origBodyPosition = body.style.position;
  const origBodyTop = body.style.top;
  const origBodyWidth = body.style.width;

  body.style.overflow = 'hidden';
  html.style.overflow = 'hidden';
  body.style.position = 'fixed';
  body.style.top = `-${scrollY}px`;
  body.style.width = '100%';

  return function unlock() {
    body.style.overflow = origBodyOverflow;
    html.style.overflow = origHtmlOverflow;
    body.style.position = origBodyPosition;
    body.style.top = origBodyTop;
    body.style.width = origBodyWidth;
    window.scrollTo(0, scrollY);
  };
}
