import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

interface User {
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
  token: string | null;
  refreshToken: string | null;
  login: (user: User, token: string, refreshToken?: string | null) => void;
  logout: () => void;
  setUser: (user: User | null) => void;
  isAuthenticated: boolean;
  isReady: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

function getTokenExpiryMs(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')),
    );

    const exp = Number(payload.exp);
    return Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const logoutTimerRef = useRef<number | null>(null);

  const clearLogoutTimer = useCallback(() => {
    if (logoutTimerRef.current !== null) {
      window.clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
  }, []);

  const logout = useCallback(() => {
    clearLogoutTimer();
    setUser(null);
    setToken(null);
    setRefreshToken(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
    }
  }, [clearLogoutTimer]);

  const scheduleLogout = useCallback(
    (accessToken: string) => {
      clearLogoutTimer();
      const expiryMs = getTokenExpiryMs(accessToken);
      if (!expiryMs) return;

      const delay = expiryMs - Date.now();
      if (delay <= 0) {
        logout();
        return;
      }

      logoutTimerRef.current = window.setTimeout(() => {
        logout();
      }, delay + 1000);
    },
    [clearLogoutTimer, logout],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let active = true;

    const hydrateSession = async () => {
      try {
        const savedUser = localStorage.getItem('user');
        const savedToken = localStorage.getItem('token');
        const savedRefreshToken = localStorage.getItem('refreshToken');

        if (!savedUser || !savedRefreshToken) {
          localStorage.removeItem('user');
          localStorage.removeItem('token');
          localStorage.removeItem('refreshToken');
          if (active) {
            setUser(null);
            setToken(null);
            setRefreshToken(null);
          }
          return;
        }

        const parsedUser = JSON.parse(savedUser) as User;
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: savedRefreshToken }),
        });
        const refreshPayload = await refreshResponse.json().catch(() => null);

        if (!refreshResponse.ok || !refreshPayload?.token || !refreshPayload?.refreshToken) {
          throw new Error('Session refresh failed');
        }

        if (!active) {
          return;
        }

        setUser(parsedUser);
        setToken(refreshPayload.token);
        setRefreshToken(refreshPayload.refreshToken);
        localStorage.setItem('user', JSON.stringify(parsedUser));
        localStorage.setItem('token', refreshPayload.token);
        localStorage.setItem('refreshToken', refreshPayload.refreshToken);
        scheduleLogout(refreshPayload.token);
      } catch {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        if (active) {
          setUser(null);
          setToken(null);
          setRefreshToken(null);
        }
      } finally {
        if (active) {
          setIsReady(true);
        }
      }
    };

    void hydrateSession();

    return () => {
      active = false;
    };
  }, [scheduleLogout]);

  useEffect(() => {
    if (typeof window === 'undefined' || !token) return;

    let active = true;

    const refreshUserProfile = async () => {
      try {
        const response = await fetch('/api/users/profile', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.user || !active) {
          return;
        }

        setUser((current) => {
          const nextUser = { ...(current || {}), ...data.user } as User;
          if (typeof window !== 'undefined') {
            localStorage.setItem('user', JSON.stringify(nextUser));
          }
          return nextUser;
        });
      } catch {
        // Silent refresh only. We keep the existing session snapshot.
      }
    };

    void refreshUserProfile();

    return () => {
      active = false;
    };
  }, [token]);

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

  const login = useCallback(
    (user: User, accessToken: string, nextRefreshToken?: string | null) => {
      setUser(user);
      setToken(accessToken);
      setRefreshToken(nextRefreshToken ?? null);
      if (typeof window !== 'undefined') {
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('token', accessToken);
        if (nextRefreshToken) {
          localStorage.setItem('refreshToken', nextRefreshToken);
        } else {
          localStorage.removeItem('refreshToken');
        }
      }
      scheduleLogout(accessToken);
    },
    [scheduleLogout],
  );

  return (
    <UserContext.Provider
      value={{
        user,
        token,
        refreshToken,
        login,
        logout,
        setUser,
        isAuthenticated: !!token,
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
