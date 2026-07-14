import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../utils/supabase';
import { clearSessionCache, setSessionCache } from '../utils/api';
import { clearBrandingCSS } from './BrandingContext';
import { clearPersistedState } from '../hooks/useStatePersistence';
import { clearTopNavCaches } from '../components/TopNav';

const AuthContext = createContext({});

// Read the auth user.id directly from Supabase's persisted localStorage
// session so cache lookups can be user-scoped BEFORE React state and the
// async getSession() complete. Without this, a shared device would
// hydrate the previous user's cached client row before the new user's
// session validates — and every downstream localStorage key keyed on
// `clientData.id` would point at the wrong account.
function getCurrentAuthUserId() {
  try {
    const keys = Object.keys(localStorage);
    const sbKey = keys.find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (!sbKey) return null;
    const raw = localStorage.getItem(sbKey);
    if (!raw) return null;
    const session = JSON.parse(raw);
    return session?.user?.id || session?.currentSession?.user?.id || null;
  } catch {
    return null;
  }
}

// Read the full user object from Supabase's persisted session so we can
// hydrate React state synchronously on first render. Without this, the
// cached-clientData fast path in initAuth sets loading=false before the
// background getSession() resolves and sets `user` — leaving a brief
// `loading=false, user=null` render that ProtectedRoute treats as
// "logged out" and redirects to /login. That redirect is what shows up
// as a split-second login screen flash between the Play Mode soft-reset
// splash and the workout resuming. Hydrating user (and loading) here
// keeps ProtectedRoute on the authenticated path through the reload.
function getCurrentAuthUser() {
  try {
    const keys = Object.keys(localStorage);
    const sbKey = keys.find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (!sbKey) return null;
    const raw = localStorage.getItem(sbKey);
    if (!raw) return null;
    const session = JSON.parse(raw);
    return session?.user || session?.currentSession?.user || null;
  } catch {
    return null;
  }
}

// Sweep every user-scoped cache from localStorage and sessionStorage so a
// shared device (gym iPad, family tablet) doesn't leak the previous user's
// workouts, diary entries, messages, branding, resume state, etc., to the
// next account that signs in. Theme + install-prompt prefs are device-
// level, not user-level, and are deliberately preserved.
function clearAllUserScopedCaches() {
  // Any localStorage key whose name starts with one of these is user data.
  // Prefixes WITHOUT a trailing separator (e.g. "cachedClientData",
  // "coach_") match both the bare key and any suffixed variants
  // (cachedClientData_<uid>, coach_branding_v4, coach_<id>).
  const LOCAL_PATTERNS = [
    'cachedClientData', 'workouts_', 'diary_', 'dashboard_',
    'plans_full_', 'supplements_', 'week_schedule_', 'messages_',
    'coach_', 'completedExercises_', 'workout-log-id-',
    'zq_workout_draft_', 'grocery-checks-',
    'guided_workout_resume', 'ai_chat_history', 'diary_collapsed_meals',
    'mealImageCache', 'plannerUndoStates', 'dismissedEndingPrograms',
    'trainer-support-chat-history'
  ];
  try {
    Object.keys(localStorage).forEach(key => {
      if (LOCAL_PATTERNS.some(p => key === p || key.startsWith(p))) {
        localStorage.removeItem(key);
      }
    });
  } catch { /* ignore */ }
  try {
    Object.keys(sessionStorage).forEach(key => {
      if (key === 'pendingFoodLog' || key === 'zique_branding' || key.startsWith('favorites_')) {
        sessionStorage.removeItem(key);
      }
    });
  } catch { /* ignore */ }
}

// Track client activity - call the API to update last_activity_at
const trackClientActivity = async (userId) => {
  if (!userId) return;

  try {
    const response = await fetch('/.netlify/functions/track-client-activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });

    if (response.ok) {
    }
  } catch (err) {
    // Silent fail - don't disrupt user experience for tracking
    console.error('SPA: Failed to track activity:', err.message);
  }
};

export function AuthProvider({ children }) {
  // Hydrate user from the cached Supabase session synchronously so the
  // cached-clientData fast path below can render Layout without the
  // login screen flashing in between (see getCurrentAuthUser comment).
  const [user, setUser] = useState(() => getCurrentAuthUser());
  // Track last time we sent an activity ping (timestamp, not boolean)
  const lastActivityPingRef = useRef(0);
  const activityIntervalRef = useRef(null);
  // Initialize clientData from a user-keyed localStorage cache so a shared
  // device can never hydrate the previous user's row. If sb-*-auth-token
  // is missing or doesn't match a stored cache, return null and let the
  // normal fetch path run.
  const [clientData, setClientData] = useState(() => {
    try {
      const uid = getCurrentAuthUserId();
      if (!uid) return null;
      const cached = localStorage.getItem(`cachedClientData_${uid}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.id && !parsed.error) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('SPA: Error reading cached client data:', e);
    }
    return null;
  });
  // When user + clientData are both hydrated from cache, skip the loading
  // state too — otherwise ProtectedRoute renders LoadingScreen for one
  // tick before the fast-path setLoading(false) runs, which produces a
  // logo+spinner flash between the soft-reset splash and the workout.
  const [loading, setLoading] = useState(() => {
    try {
      const uid = getCurrentAuthUserId();
      if (!uid) return true;
      const cached = localStorage.getItem(`cachedClientData_${uid}`);
      if (!cached) return true;
      const parsed = JSON.parse(cached);
      if (parsed && parsed.id && !parsed.error) return false;
    } catch { /* ignore */ }
    return true;
  });
  const [theme, setTheme] = useState(() => {
    // Use 'zique-theme' key for consistency with standalone HTML pages
    // Migrate from old 'theme' key if exists
    const newKey = localStorage.getItem('zique-theme');
    const oldKey = localStorage.getItem('theme');
    if (newKey) {
      return newKey;
    }
    if (oldKey) {
      // Migrate old key to new key
      try {
        localStorage.setItem('zique-theme', oldKey);
        localStorage.removeItem('theme');
      } catch { /* ignore quota / private mode */ }
      return oldKey;
    }
    return 'dark';
  });

  // Check if user is a coach by querying the coaches table
  const checkIsCoach = useCallback(async (userId) => {
    try {
      // Use maybeSingle() instead of single() to avoid 406 errors when no row exists
      // This prevents RLS/permissions errors when user is not a coach
      const { data, error } = await supabase
        .from('coaches')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      // PGRST116 = no rows found, which is expected for non-coaches
      if (error && error.code !== 'PGRST116') {
        // Log non-expected errors but don't break the flow.
        // Return null ("unknown") — NOT false — so a flaky query can't
        // demote a coach; callers fall back to the last known value.
        console.warn('SPA: Coach check returned error:', error.code, error.message);
        return null;
      }
      return !!data;
    } catch (err) {
      // Couldn't check coach status — return null ("unknown") so the
      // caller keeps the previously known value instead of demoting.
      console.warn('SPA: Error checking coach status:', err.message);
      return null;
    }
  }, []);

  // Fetch client data from database with retry logic
  const fetchClientData = useCallback(async (userId, retryCount = 0) => {
    const maxRetries = 2;

    try {
      // Add timeout to prevent hanging - 10 seconds
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => {
          reject(new Error('timeout'));
        }, 10000)
      );

      // Fetch client data and check coach status in parallel
      const fetchPromise = supabase
        .from('clients')
        .select('id, coach_id, client_name, email, avatar_url, profile_photo_url, can_edit_goals, can_edit_micronutrient_goals, calorie_goal, protein_goal, carbs_goal, fat_goal, gender, preferred_exercise_gender, unit_preference, age, weight, height_ft, height_in, activity_level, diet_type, allergies, disliked_foods, preferred_foods, cooking_equipment, meal_count, use_protein_powder, protein_powder_brand, protein_powder_calories, protein_powder_protein, protein_powder_carbs, protein_powder_fat, budget, unit_system, water_goal, water_unit, access_status, fitness_level, exercise_frequency, workout_duration, equipment_access, exercise_types, health_concerns, fitness_goal_details, macro_preference, email_verified_at')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();

      // Guard the coach check with the same timeout so a hanging coaches
      // query can't stall the whole Promise.all (infinite LoadingScreen).
      // Timeout resolves to null ("unknown"), matching checkIsCoach errors.
      const [clientResult, coachCheckResult] = await Promise.all([
        Promise.race([fetchPromise, timeoutPromise]),
        Promise.race([checkIsCoach(userId), timeoutPromise]).catch(() => null)
      ]);

      const { data, error } = clientResult;

      if (error) {
        console.error('SPA: Error fetching client data:', error.message, error.code);
        throw new Error(error.message);
      }

      if (!data) {
        console.warn('SPA: No client record found for user:', userId);
        return { id: null, client_name: 'User', error: true, errorMessage: 'No client record found' };
      }

      // Resolve coach status. null means "couldn't check" (error/timeout) —
      // fall back to the last known cached value instead of demoting to
      // false, so one flaky coaches query can't persistently strip coach
      // access. Only a confirmed false (query succeeded, no row) demotes.
      let isCoach = coachCheckResult;
      if (isCoach === null) {
        try {
          const cached = localStorage.getItem(`cachedClientData_${userId}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && typeof parsed.is_coach === 'boolean') {
              isCoach = parsed.is_coach;
            }
          }
        } catch { /* ignore */ }
        // No prior knowledge — default to false (same as legacy behavior)
        if (isCoach === null) isCoach = false;
      }

      // Add isCoach flag to the client data
      const enrichedData = { ...data, is_coach: isCoach };

      // Cache successful result to localStorage keyed by the auth user.id
      // so multi-user devices keep separate snapshots that can't be
      // hydrated across accounts.
      try {
        localStorage.setItem(`cachedClientData_${userId}`, JSON.stringify(enrichedData));
      } catch (e) {
        console.error('SPA: Failed to cache client data:', e);
      }

      return enrichedData;
    } catch (err) {
      console.error('SPA: Error in fetchClientData:', err.message);

      // Retry with exponential backoff
      if (retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchClientData(userId, retryCount + 1);
      }

      // All retries failed - try to use the user-keyed cached data
      // (userId is the auth user.id passed into this fetch).
      try {
        const cached = localStorage.getItem(`cachedClientData_${userId}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.id && !parsed.error) {
            return parsed;
          }
        }
      } catch (e) {
        console.error('SPA: Error reading cache after fetch failure:', e);
      }

      // No cache available, return fallback
      return { id: null, client_name: 'User', error: true, errorMessage: err.message };
    }
  }, [checkIsCoach]);

  // Initialize auth state
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {

      // Check if we already have user-keyed cached client data in
      // localStorage. Same scoping as the useState initializer so a
      // shared device can't surface the previous user's row.
      let hasCachedData = false;
      let cachedData = null;
      try {
        const uid = getCurrentAuthUserId();
        if (uid) {
          const cached = localStorage.getItem(`cachedClientData_${uid}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && parsed.id && !parsed.error) {
              hasCachedData = true;
              cachedData = parsed;
            }
          }
        }
      } catch (e) {
        // Ignore parse errors
      }

      // CRITICAL: If we have valid cached data, show the app immediately!
      // Don't wait for getSession() - it can be slow on poor networks
      if (hasCachedData && cachedData) {
        setClientData(cachedData);
        setLoading(false);

        // Run auth validation in background (non-blocking)
        (async () => {
          try {
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Auth timeout')), 10000)
            );
            const sessionPromise = supabase.auth.getSession();
            const { data, error } = await Promise.race([sessionPromise, timeoutPromise]);
            const session = data?.session;

            if (session?.user && mounted) {
              setUser(session.user);

              // Track client activity (throttled to every 5 minutes)
              const now = Date.now();
              if (now - lastActivityPingRef.current > 5 * 60 * 1000) {
                lastActivityPingRef.current = now;
                trackClientActivity(session.user.id);
              }

              // Fetch fresh data in background
              fetchClientData(session.user.id).then(client => {
                if (mounted && client && !client.error) {
                  setClientData(client);
                }
              });
            } else if (!session && !error && mounted) {
              // Confirmed signed-out (no session AND no error). If getSession
              // returned an error (e.g. failed token refresh while offline),
              // we keep the cached state instead — same as the timeout path
              // below — so a flaky network can't hard-log-out the user.
              // Session expired — clear cached data for whichever user we
              // had hydrated (best-effort via sb-* if still present) and
              // legacy unkeyed cache. Other users' caches on this device
              // are independent and stay put.
              const expiredUid = getCurrentAuthUserId();
              if (expiredUid) localStorage.removeItem(`cachedClientData_${expiredUid}`);
              localStorage.removeItem('cachedClientData');
              setClientData(null);
              setUser(null);
            } else if (error && mounted) {
              console.warn('SPA: Background session check errored, keeping cached state:', error.message);
            }
          } catch (err) {
            console.error('SPA: Background auth error:', err);
            // Keep using cached data on background auth failure
          }
        })();
        return;
      }

      // No cached data - must wait for auth
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Auth timeout')), 10000)
        );

        const sessionPromise = supabase.auth.getSession();
        const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);

        if (session?.user && mounted) {
          setUser(session.user);

          // Track client activity (throttled to every 5 minutes)
          {
            const now = Date.now();
            if (now - lastActivityPingRef.current > 5 * 60 * 1000) {
              lastActivityPingRef.current = now;
              trackClientActivity(session.user.id);
            }
          }

          // No cached data, wait for fetch to complete
          const client = await fetchClientData(session.user.id);
          if (mounted) {
            setClientData(client);
            setLoading(false);
          }
        } else if (mounted) {
          // No session, clear loading
          setLoading(false);
        }
      } catch (err) {
        console.error('SPA: Auth initialization error:', err);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);

        // Track client activity on sign in
        lastActivityPingRef.current = Date.now();
        trackClientActivity(session.user.id);

        const client = await fetchClientData(session.user.id);
        setClientData(client);
      } else if (event === 'TOKEN_REFRESHED') {
        // Supabase auto-refreshes tokens in the background and passes the
        // new session here. Prime the API session cache directly so the
        // next API call uses the new token without a second getSession()
        // round-trip — that round-trip is exactly the iOS-resume hang the
        // 2.5s timeout fix in api.js is meant to dodge. If session is
        // somehow absent, setSessionCache(null) falls back to clearing
        // (same behavior as the previous clearSessionCache call).
        setSessionCache(session);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setClientData(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchClientData]);

  // Periodic activity tracking - update last_activity_at every 5 minutes while app is open
  useEffect(() => {
    if (!user) {
      if (activityIntervalRef.current) {
        clearInterval(activityIntervalRef.current);
        activityIntervalRef.current = null;
      }
      return;
    }

    activityIntervalRef.current = setInterval(() => {
      const now = Date.now();
      if (now - lastActivityPingRef.current > 5 * 60 * 1000) {
        lastActivityPingRef.current = now;
        trackClientActivity(user.id);
      }
    }, 5 * 60 * 1000); // Check every 5 minutes

    return () => {
      if (activityIntervalRef.current) {
        clearInterval(activityIntervalRef.current);
        activityIntervalRef.current = null;
      }
    };
  }, [user]);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('zique-theme', theme); } catch { /* ignore quota / private mode */ }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
    // Mark that the user manually chose a theme (overrides coach default)
    try { localStorage.setItem('zique-theme-user-override', 'true'); } catch {}
  }, []);

  const logout = useCallback(async () => {
    try {
      // Use local scope to avoid network delays and 403 errors
      // This only clears the local session without making a server request
      await supabase.auth.signOut({ scope: 'local' });
    } catch (err) {
      console.error('Logout error:', err);
      // Continue to clear local state even if signOut fails
    }

    // Always clear local state regardless of signOut result
    setUser(null);
    setClientData(null);
    // Sweep every user-scoped cache so the next account that signs in on
    // this device can't see the previous user's data. Theme + install-
    // prompt prefs are device-level and deliberately preserved.
    clearAllUserScopedCaches();
    // 'login_coach_id' is deliberately KEPT: it's the device's gym
    // association, not user data. Logging out of a Huracan Fitness account
    // must land on the Huracan-branded login — the same way a gym's own app
    // is still the gym's app after sign-out. A different gym's member
    // signing in later overwrites it (see Login's handleLogin), and it
    // holds nothing private — it only picks which brand the login shows.
    // Reset the previous user's brand colors on :root and drop the
    // 'zique_branding_preload' cold-start snapshot, so the next account on
    // a shared device doesn't see (or replay) the old coach's branding.
    // (The Login page immediately re-applies the right gym's branding from
    // login_coach_id, so the member-facing result is a branded login.)
    clearBrandingCSS();
    // Clear API session cache
    clearSessionCache();
    // Reset in-memory caches that live on module scope (not localStorage)
    // so the next user's first render doesn't briefly show the previous
    // user's notification count or story state.
    clearTopNavCaches();
    // Clear persisted state snapshots (sessionStorage)
    clearPersistedState();
    // Tell Service Worker to clear data cache
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_DATA_CACHE' });
    }
  }, []);

  const refreshClientData = useCallback(async () => {
    if (user) {
      const client = await fetchClientData(user.id);
      setClientData(client);
      return client;
    }
    return null;
  }, [user, fetchClientData]);

  const value = {
    user,
    clientData,
    loading,
    theme,
    toggleTheme,
    logout,
    refreshClientData
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
