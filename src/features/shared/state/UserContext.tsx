import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';

import { createClient } from '@/lib/client';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  alternate_phone?: string | null;
  email_verified?: number;
  email_verified_at?: string;
  role: 'customer' | 'seller' | 'admin' | 'reseller';
  avatar_url?: string | null;
  bio?: string | null;
  store_name?: string | null;
  storefront_slug?: string | null;
  storefront_banner_url?: string | null;
  storefront_headline?: string | null;
  seller_status?: 'draft' | 'pending_review' | 'under_review' | 'approved' | 'rejected' | 'suspended';
  points?: number;
}

interface UserContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  setUser: (user: User | null) => void;
  isAuthenticated: boolean;
  isReady: boolean;
  /** Supabase access token for legacy API transport. Supabase remains the auth authority. */
  token: string | null;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUserState] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  const setInternalUser = useCallback((nextUser: User | null) => {
    setUserState(nextUser);
  }, []);

  const logout = useCallback(() => {
    void fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).catch(() => {});

    try {
      if (supabaseRef.current) {
        void supabaseRef.current.auth.signOut();
      }
    } catch {
      // ignore
    }

    setInternalUser(null);
    setToken(null);
  }, [setInternalUser]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleAuthLogout = () => {
      logout();
    };

    window.addEventListener('auth:logout', handleAuthLogout);
    return () => {
      window.removeEventListener('auth:logout', handleAuthLogout);
    };
  }, [logout]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let active = true;
    let subscription: { unsubscribe: () => void } | null = null;
    let hydrated = false;

    const loadProfile = async (session: Session | null) => {
      if (!active) return;

      if (!session?.user) {
        setInternalUser(null);
        setToken(null);
        return;
      }

      setToken(session.access_token ?? null);

      try {
        const response = await fetch('/api/users/profile?minimal=1', {
          credentials: 'include',
          headers: session.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : undefined,
        });

        if (!active) return;

        if (!response.ok) {
          setInternalUser(null);
          return;
        }

        const payload = (await response.json().catch(() => null)) as { user?: User } | null;
        if (payload?.user) {
          setInternalUser({
            ...payload.user,
            name: payload.user.name || '',
          });
        } else {
          setInternalUser(null);
        }
      } catch {
        if (active) setInternalUser(null);
      }
    };

    const init = async () => {
      try {
        const supabase = createClient();
        supabaseRef.current = supabase;

        // Supabase owns the session lifecycle. The short-lived access token is
        // only mirrored in memory for legacy API transport; authorization stays
        // server-side.
        const { data: sessionData } = await supabase.auth.getSession();
        if (!active) return;

        hydrated = true;
        await loadProfile(sessionData.session);
      } catch {
        if (active) {
          setInternalUser(null);
          setToken(null);
        }
      } finally {
        if (active) setIsReady(true);
      }
    };

    void init();

    const supabase = supabaseRef.current ?? createClient();
    supabaseRef.current = supabase;

    const { data } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      if (!active) return;

      // getSession() above is the single initial hydration path. Supabase can
      // emit INITIAL_SESSION immediately as well; ignoring pre-hydration events
      // prevents duplicate profile requests and dashboard flicker.
      if (!hydrated) return;

      void loadProfile(session);
    });
    subscription = data.subscription;

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [setInternalUser]);

  const login = useCallback(
    (nextUser: User) => {
      setInternalUser(nextUser);
    },
    [setInternalUser],
  );

  const setUser = useCallback(
    (nextUser: User | null) => {
      setInternalUser(nextUser);
    },
    [setInternalUser],
  );

  return (
    <UserContext.Provider
      value={{
        user,
        login,
        logout,
        setUser,
        isAuthenticated: !!user,
        isReady,
        token,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) throw new Error('useUser must be used within a UserProvider');
  return context;
};
