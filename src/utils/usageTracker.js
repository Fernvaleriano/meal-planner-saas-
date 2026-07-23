// In-house usage tracker (first-party, no cookies, no IP stored).
// Fire-and-forget: a tracking failure must never surface in the app.
import { supabase } from './supabase';

export async function trackEvent(event, page, role = 'client') {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    fetch('/.netlify/functions/track-event', {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` })
      },
      body: JSON.stringify({ event, page, role })
    }).catch(() => {});
  } catch {
    // never break the app for analytics
  }
}

export function trackPageview(pathname) {
  trackEvent('pageview', `app:${pathname}`);
}
