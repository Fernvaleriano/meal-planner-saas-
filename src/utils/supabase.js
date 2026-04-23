import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qewqcjzlfqamqwbccapr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFld3FjanpsZnFhbXF3YmNjYXByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2OTg0NzAsImV4cCI6MjA3OTI3NDQ3MH0.mQnMC33O88oLkLLGWD2oG-oaSHGI-NfHmtQCZxnxSLs';

// Supabase's default browser lock uses navigator.locks with a steal-on-timeout
// policy: if one call holds the auth lock longer than ~10s, the next caller
// preempts it and the preempted caller throws "Lock was released because
// another request stole it". On slow networks (or with many concurrent
// queries fanning out on page load) this cascades — every subsequent call
// steals the previous, and nothing completes cleanly.
//
// We only run one tab per session, so cross-tab synchronization isn't needed.
// An in-process promise-chain lock serializes concurrent auth access within
// this tab without the steal behavior, which eliminates the console storm and
// lets queries actually finish.
const inProcessLocks = new Map();
async function inProcessLock(name, _acquireTimeout, fn) {
  const prev = inProcessLocks.get(name) || Promise.resolve();
  let tailResolve;
  const tail = new Promise((resolve) => { tailResolve = resolve; });
  inProcessLocks.set(name, tail);
  try {
    // Wait for any previous holder to release. We ignore its outcome —
    // whether it succeeded or threw, our turn is next.
    await prev.catch(() => {});
    return await fn();
  } finally {
    tailResolve();
    if (inProcessLocks.get(name) === tail) {
      inProcessLocks.delete(name);
    }
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    lock: inProcessLock,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
