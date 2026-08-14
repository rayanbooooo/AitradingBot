import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, supabaseConfigured } from './supabaseClient.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // No Supabase credentials configured -- treat as "logged in" with no
  // account system at all (e.g. local dev before Supabase is wired up).
  const [loading, setLoading] = useState(supabaseConfigured);
  const [session, setSession] = useState(null);

  useEffect(() => {
    if (!supabaseConfigured) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const value = {
    enabled: supabaseConfigured,
    loading,
    session,
    user: session?.user ?? null,
    signUp: (email, password) => supabase.auth.signUp({ email, password }),
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signOut: () => supabase.auth.signOut(),
    resetPassword: (email) => supabase.auth.resetPasswordForEmail(email),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
