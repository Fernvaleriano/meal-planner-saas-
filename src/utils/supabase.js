import { createClient } from '@supabase/supabase-js';
import { processLock } from '@supabase/auth-js';

const SUPABASE_URL = 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFld3FjanpsZnFhbXF3YmNjYXByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2OTg0NzAsImV4cCI6MjA3OTI3NDQ3MH0.mQnMC33O88oLkLLGWD2oG-oaSHGI-NfHmtQCZxnxSLs';

// Default browser lock uses navigator.locks with a steal-on-timeout policy —
// on slow networks a held lock gets preempted by the next waiter, surfacing as
// "Lock was released because another request stole it" and breaking the request
// that held it. That fails silently, sessions never refresh, workout saves go
// out with no auth token and get rejected. Since this is a single-tab SPA,
// cross-tab synchronization isn't needed; Supabase's own in-process lock is
// safe, handles re-entrancy correctly, and skips the navigator.locks steal
// behavior entirely.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    lock: processLock,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
