'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { normalizeRedirectTarget } from '../../../lib/auth-ui';
import { useAuthModal } from '@/features/auth/context/AuthModalContext';

/**
 * Client-side redirect used by protected layouts after server-side auth is
 * validated. Navigation is performed in an effect (after commit) instead of
 * throwing `redirect()` during the server render pass. This avoids the
 * App-Router mid-render unwind that can trigger the framework "Rendered more
 * hooks" regression (vercel/next.js#63121) when navigating across route groups.
 *
 * When the target is the login page, the current URL (path + query) is kept as
 * `?redirect=...` so the sign-in flow returns the user to the route they
 * originally tried to open.
 */
export function ClientRedirect({ to }: { to: string }) {
  const router = useRouter();
  const { openAuth } = useAuthModal();

  useEffect(() => {
    if (to.startsWith('/login')) {
      const currentUrl = typeof window !== 'undefined'
        ? normalizeRedirectTarget(window.location.pathname + window.location.search)
        : '/';
      openAuth({ returnTo: currentUrl || '/' });
      return;
    }
    router.replace(to);
  }, [to, router, openAuth]);

  return null;
}