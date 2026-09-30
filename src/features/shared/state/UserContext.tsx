import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
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
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUserState] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(false);
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
    let supabase: ReturnType<typeof createClient> | null = null;

    const init = async () => {
      try {
        supabase = createClient();
        supabaseRef.current = supabase;

        // getUser() is the verified identity check. Supabase owns the session
        // and token lifecycle; this context only mirrors the application profile.
        const { data: userData } = await supabase.auth.getUser();

        if (!active) return;

        if (userData.user) {
          try {
            const response = await fetch('/api/users/profile', {
              credentials: 'include',
            });

            if (response.ok) {
              const payload = await response.json().catch(() => null);
              if (payload?.user) {
                setInternalUser(
                  {
                    ...payload.user,
                    name: payload.user.name || '',
                  } as User,
                );
              } else {
                setInternalUser(null);
              }
            } else {
              setInternalUser(null);
            }
          } catch {
            setInternalUser(null);
          }
        } else {
          setInternalUser(null);
        }
      } catch {
        if (active) {
          setInternalUser(null);
        }
      } finally {
        if (active) {
          setIsReady(true);
        }
      }
    };

    void init();

    return () => {
      active = false;
    };
  }, [setInternalUser]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let active = true;

    const setupListener = async () => {
      try {
        const supabase = supabaseRef.current ?? createClient();
        supabaseRef.current = supabase;

        const { data } = supabase.auth.onAuthStateChange(async (_event: string, session) => {
          if (!active) return;

          if (!session?.user) {
            setInternalUser(null);
            return;
          }

          try {
            const response = await fetch('/api/users/profile', {
              credentials: 'include',
            });

            if (response.ok) {
              const payload = (await response.json().catch(() => null)) as { user?: User } | null;
              if (payload?.user) {
                setInternalUser(
                  {
                    ...payload.user,
                    name: payload.user.name || '',
                  },
                  session,
                );
              } else {
                setInternalUser(null);
              }
            } else {
              setInternalUser(null);
            }
          } catch {
            setInternalUser(null);
          }
        });

        return () => {
          data?.subscription?.unsubscribe();
        };
      } catch {
        return () => {};
      }
    };

    const cleanup = setupListener();

    return () => {
      void cleanup;
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
