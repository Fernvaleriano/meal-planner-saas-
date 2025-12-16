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
    return 'light';
  });

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

      const fetchPromise = supabase
        .from('clients')
        .select('id, coach_id, client_name, email, avatar_url, profile_photo_url, can_edit_goals, calorie_goal, protein_goal, carbs_goal, fat_goal')
        .eq('user_id', userId)
        .single();

      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);

      if (error) {
        console.error('SPA: Error fetching client data:', error.message, error.code);
        throw new Error(error.message);
      }

      console.log('SPA: Got client data successfully:', { id: data?.id, name: data?.client_name });

      // Cache successful result to localStorage
      try {
        localStorage.setItem('cachedClientData', JSON.stringify(data));
        console.log('SPA: Cached client data to localStorage');
      } catch (e) {
        console.error('SPA: Failed to cache client data:', e);
      }

      return data;
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
  }, []);

  // Initialize auth state
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      console.log('SPA: Starting auth initialization...');

      // Check if we already have cached client data in localStorage
      let hasCachedData = false;
      try {
        const cached = localStorage.getItem('cachedClientData');
        if (cached) {
          const parsed = JSON.parse(cached);
          hasCachedData = parsed && parsed.id && !parsed.error;
        }
      } catch (e) {
        // Ignore parse errors
      }

      try {
        // Add timeout to prevent hanging forever
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

          // If we have cached data, set loading to false immediately
          // and fetch fresh data in the background
          if (hasCachedData) {
            console.log('SPA: Have cached data, setting loading=false immediately');
            setLoading(false);
            // Fetch fresh data in background (don't await)
            fetchClientData(session.user.id).then(client => {
              if (mounted && client && !client.error) {
                setClientData(client);
              }
            });
          } else {
            // No cached data, wait for fetch to complete
            const client = await fetchClientData(session.user.id);
            if (mounted) {
              setClientData(client);
              setLoading(false);
            }
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
