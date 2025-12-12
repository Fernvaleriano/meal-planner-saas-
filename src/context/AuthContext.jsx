import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../utils/supabase';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [clientData, setClientData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'light';
  });

  // Fetch client data from database
  const fetchClientData = useCallback(async (userId) => {
    console.log('SPA: Fetching client data for user:', userId);
    try {
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((resolve) =>
        setTimeout(() => {
          console.log('SPA: Client data fetch timeout');
          resolve({ id: null, client_name: 'User', error: true, timeout: true });
        }, 8000)
      );

      const fetchPromise = supabase
        .from('clients')
        .select('id, coach_id, client_name, email, avatar_url, profile_photo_url, can_edit_goals, calorie_goal, protein_goal, carbs_goal, fat_goal')
        .eq('user_id', userId)
        .single()
        .then(({ data, error }) => {
          if (error) {
            console.error('SPA: Error fetching client data:', error);
            return { id: null, client_name: 'User', error: true };
          }
          console.log('SPA: Got client data:', data?.client_name);
          return data;
        });

      return await Promise.race([fetchPromise, timeoutPromise]);
    } catch (err) {
      console.error('SPA: Error in fetchClientData:', err);
      return { id: null, client_name: 'User', error: true };
    }
  }, []);

  // Initialize auth state
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      console.log('SPA: Starting auth initialization...');
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
          const client = await fetchClientData(session.user.id);
          if (mounted) {
            setClientData(client);
          }
        }
      } catch (err) {
        console.error('SPA: Auth initialization error:', err);
      } finally {
        if (mounted) {
          console.log('SPA: Setting loading to false');
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
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  }, []);

  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setClientData(null);
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
