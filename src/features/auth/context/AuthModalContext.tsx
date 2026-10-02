'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type AuthView =
  | 'entry'
  | 'login-password'
  | 'signup-start'
  | 'signup-otp'
  | 'signup-password'
  | 'forgot-password'
  | 'reset-otp'
  | 'reset-password'
  | 'success'
  | 'reset-success';

type AuthModalContextValue = {
  isOpen: boolean;
  view: AuthView;
  returnTo: string | null;
  openAuth: (options?: { view?: AuthView; returnTo?: string | null }) => void;
  closeAuth: () => void;
  setView: (view: AuthView) => void;
};

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<AuthView>('entry');
  const [returnTo, setReturnTo] = useState<string | null>(null);

  const openAuth = useCallback((options?: { view?: AuthView; returnTo?: string | null }) => {
    setView(options?.view ?? 'entry');
    setReturnTo(options?.returnTo ?? (typeof window !== 'undefined' ? window.location.pathname + window.location.search : null));
    setIsOpen(true);
  }, []);

  const closeAuth = useCallback(() => setIsOpen(false), []);

  const value = useMemo(
    () => ({ isOpen, view, returnTo, openAuth, closeAuth, setView }),
    [isOpen, view, returnTo, openAuth, closeAuth],
  );

  return <AuthModalContext.Provider value={value}>{children}</AuthModalContext.Provider>;
}

export function useAuthModal() {
  const value = useContext(AuthModalContext);
  if (!value) throw new Error('useAuthModal must be used within AuthModalProvider');
  return value;
}
