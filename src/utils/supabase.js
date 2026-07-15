import { createClient, processLock } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFld3FjanpsZnFhbXF3YmNjYXByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2OTg0NzAsImV4cCI6MjA3OTI3NDQ3MH0.mQnMC33O88oLkLLGWD2oG-oaSHGI-NfHmtQCZxnxSLs';

// Serialize auth-token access with an in-process promise lock instead of
// the browser's Web Locks API (the auth-js default in browsers).
//
// On Android (Chrome / WebView / installed PWA), especially when the app is
// resumed from the background and several requests read the session at once,
// the navigator-lock implementation would time out waiting on the shared
// "sb-<ref>-auth-token" lock and STEAL it from the request currently holding
// it. The stolen request then throws:
//   Lock "lock:sb-qewqcjzlfqamqwbccapr-auth-token" was released because
//   another request stole it
// That rejection propagated out of getSession()/the first authed query in
// AuthContext, exhausted the retries in fetchClientData, and surfaced as the
// "Couldn't load your account" screen at login.
//
// processLock is a simple in-memory queue: concurrent auth calls wait their
// turn, nothing is ever stolen, so this error class disappears. The only
// thing given up vs. navigator locks is cross-browser-tab coordination of
// token refreshes — irrelevant for a single-window mobile PWA, and at worst
// a harmless duplicate refresh elsewhere. All other auth defaults
// (persistSession, autoRefreshToken, detectSessionInUrl, storageKey) are
// left untouched.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    lock: processLock,
  },
});
