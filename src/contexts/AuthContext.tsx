"use client";

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { registerAuthProvider } from "@/lib/api-client";

interface AuthState {
  token: string | null;
  userId: string | null;
  isReady: boolean;
}

interface AuthContextValue extends AuthState {
  waitForFreshToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue>({
  token: null,
  userId: null,
  isReady: false,
  waitForFreshToken: () => Promise.resolve(null),
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    userId: null,
    isReady: false,
  });

  const tokenRef = useRef<string | null>(null);
  const resolversRef = useRef<Array<(token: string | null) => void>>([]);

  const waitForFreshToken = useCallback((): Promise<string | null> => {
    if (tokenRef.current) return Promise.resolve(tokenRef.current);
    return new Promise((resolve) => {
      resolversRef.current.push(resolve);
      setTimeout(() => {
        const idx = resolversRef.current.indexOf(resolve);
        if (idx !== -1) {
          resolversRef.current.splice(idx, 1);
          resolve(tokenRef.current);
        }
      }, 10_000);
    });
  }, []);

  registerAuthProvider(() => tokenRef.current, waitForFreshToken);

  const flushResolvers = useCallback((token: string | null) => {
    for (const resolve of resolversRef.current) {
      resolve(token);
    }
    resolversRef.current = [];
  }, []);

  useEffect(() => {
    if (!supabase) {
      setState({ token: null, userId: null, isReady: true });
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      const t = session?.access_token ?? null;
      const u = session?.user?.id ?? null;
      tokenRef.current = t;
      setState({ token: t, userId: u, isReady: true });
      flushResolvers(t);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const t = session?.access_token ?? null;
        const u = session?.user?.id ?? null;
        tokenRef.current = t;
        setState({ token: t, userId: u, isReady: true });
        flushResolvers(t);
      }
    );

    return () => subscription.unsubscribe();
  }, [flushResolvers]);

  return (
    <AuthContext.Provider value={{ ...state, waitForFreshToken }}>
      {children}
    </AuthContext.Provider>
  );
}
