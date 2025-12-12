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
    try {
      const { data: client, error } = await supabase
        .from('clients')
        .select('id, coach_id, client_name, email, avatar_url, can_edit_goals, calorie_goal, protein_goal, carbs_goal, fat_goal')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Error fetching client data:', error);
        return null;
      }

      return client;
    } catch (err) {
      console.error('Error in fetchClientData:', err);
      return null;
    }
  }, []);

  // Initialize auth state
  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          setUser(session.user);
          const client = await fetchClientData(session.user.id);
          setClientData(client);
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);
        const client = await fetchClientData(session.user.id);
        setClientData(client);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setClientData(null);
      }
    });

    return () => subscription.unsubscribe();
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
