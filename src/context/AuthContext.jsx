import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../utils/supabase';
import { clearSessionCache } from '../utils/api';

const AuthContext = createContext({});

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
      console.log('SPA: Client activity tracked');
    }
  } catch (err) {
    // Silent fail - don't disrupt user experience for tracking
    console.error('SPA: Failed to track activity:', err.message);
  }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Track if we've already tracked activity this session
  const activityTrackedRef = useRef(false);
  // Initialize clientData from localStorage cache if available
  const [clientData, setClientData] = useState(() => {
    try {
      const cached = localStorage.getItem('cachedClientData');
      if (cached) {
        const parsed = JSON.parse(cached);
        // Only use cache if it's valid (has id and no error)
        if (parsed && parsed.id && !parsed.error) {
          console.log('SPA: Using cached client data:', parsed.client_name);
          return parsed;
        }
      }
    } catch (e) {
      console.error('SPA: Error reading cached client data:', e);
    }
    return null;
  });
  const [loading, setLoading] = useState(true);
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
      localStorage.setItem('zique-theme', oldKey);
      localStorage.removeItem('theme');
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
        // Log non-expected errors but don't break the flow
        console.warn('SPA: Coach check returned error:', error.code, error.message);
        return false;
      }
      return !!data;
    } catch (err) {
      // Silent fail - if we can't check coach status, assume they're not a coach
      console.warn('SPA: Error checking coach status:', err.message);
      return false;
    }
  }, []);

  // Fetch client data from database with retry logic
  const fetchClientData = useCallback(async (userId, retryCount = 0) => {
    const maxRetries = 2;
    console.log('SPA: Fetching client data for user:', userId, retryCount > 0 ? `(retry ${retryCount})` : '');

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
        .select('id, coach_id, client_name, email, avatar_url, profile_photo_url, can_edit_goals, calorie_goal, protein_goal, carbs_goal, fat_goal, gender')
        .eq('user_id', userId)
        .single();

      const [clientResult, isCoach] = await Promise.all([
        Promise.race([fetchPromise, timeoutPromise]),
        checkIsCoach(userId)
      ]);

      const { data, error } = clientResult;

      if (error) {
        console.error('SPA: Error fetching client data:', error.message, error.code);
        throw new Error(error.message);
      }

      // Add isCoach flag to the client data
      const enrichedData = { ...data, is_coach: isCoach };
      console.log('SPA: Got client data successfully:', { id: enrichedData?.id, name: enrichedData?.client_name, isCoach });

      // Cache successful result to localStorage
      try {
        localStorage.setItem('cachedClientData', JSON.stringify(enrichedData));
        console.log('SPA: Cached client data to localStorage');
      } catch (e) {
        console.error('SPA: Failed to cache client data:', e);
      }

      return enrichedData;
    } catch (err) {
      console.error('SPA: Error in fetchClientData:', err.message);

      // Retry with exponential backoff
      if (retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s
        console.log(`SPA: Retrying client data fetch in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchClientData(userId, retryCount + 1);
      }

      // All retries failed - try to use cached data
      try {
        const cached = localStorage.getItem('cachedClientData');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.id && !parsed.error) {
            console.log('SPA: Using cached client data after fetch failure:', parsed.client_name);
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
      console.log('SPA: Starting auth initialization...');

      // Check if we already have cached client data in localStorage
      let hasCachedData = false;
      let cachedData = null;
      try {
        const cached = localStorage.getItem('cachedClientData');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.id && !parsed.error) {
            hasCachedData = true;
            cachedData = parsed;
          }
        }
      } catch (e) {
        // Ignore parse errors
      }

      // CRITICAL: If we have valid cached data, show the app immediately!
      // Don't wait for getSession() - it can be slow on poor networks
      if (hasCachedData && cachedData) {
        console.log('SPA: Have cached data, showing app immediately');
        setClientData(cachedData);
        setLoading(false);

        // Run auth validation in background (non-blocking)
        (async () => {
          try {
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Auth timeout')), 10000)
            );
            const sessionPromise = supabase.auth.getSession();
            const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);

            if (session?.user && mounted) {
              setUser(session.user);

              // Track client activity on app load (only once per session)
              if (!activityTrackedRef.current) {
                activityTrackedRef.current = true;
                trackClientActivity(session.user.id);
              }

              // Fetch fresh data in background
              fetchClientData(session.user.id).then(client => {
                if (mounted && client && !client.error) {
                  setClientData(client);
                }
              });
            } else if (!session && mounted) {
              // Session expired, clear cached data and redirect to login
              console.log('SPA: Session expired, clearing cache');
              localStorage.removeItem('cachedClientData');
              setClientData(null);
              setUser(null);
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

        console.log('SPA: Got session:', !!session);

        if (session?.user && mounted) {
          setUser(session.user);

          // Track client activity on app load (only once per session)
          if (!activityTrackedRef.current) {
            activityTrackedRef.current = true;
            trackClientActivity(session.user.id);
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
      console.log('SPA: Auth state change:', event);
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);

        // Track client activity on sign in
        trackClientActivity(session.user.id);

        const client = await fetchClientData(session.user.id);
        setClientData(client);
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

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('zique-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  }, []);

  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setClientData(null);
      // Clear cached client data on logout
      localStorage.removeItem('cachedClientData');
      // Clear API session cache
      clearSessionCache();
    } catch (err) {
      console.error('Logout error:', err);
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
