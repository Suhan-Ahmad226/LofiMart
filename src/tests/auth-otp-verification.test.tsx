/* @vitest-environment jsdom */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { supabaseMock, routerPush, routerReplace } = vi.hoisted(() => ({
  supabaseMock: {
    auth: {
      // If any production code path calls this directly from the browser the
      // attempt budget would live outside the rate-limited server route.
      verifyOtp: vi.fn(),
      setSession: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signOut: vi.fn(),
      signInWithOAuth: vi.fn(),
    },
  },
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
}));

vi.mock('@/lib/client', () => ({ createClient: vi.fn(() => supabaseMock) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
}));

import { AuthModalProvider, useAuthModal } from '@/features/auth/context/AuthModalContext';
import { UserProvider } from '@/features/shared/state/UserContext';
import AuthModal from '@/features/auth/components/AuthModal';

type FetchCall = { url: string; body: Record<string, unknown> };

const calls: FetchCall[] = [];

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function OpenProbe() {
  const { openAuth } = useAuthModal();

  return (
    <button type="button" onClick={() => openAuth({ returnTo: '/checkout' })}>
      open auth
    </button>
  );
}

function renderAuthModal() {
  render(
    <UserProvider>
      <AuthModalProvider>
        <OpenProbe />
        <AuthModal />
      </AuthModalProvider>
    </UserProvider>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'open auth' }));
}

async function enterIdentifier(value: string) {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value } });

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  });

  await waitFor(() => {
    expect(screen.getAllByRole('textbox')).toHaveLength(6);
  });
}

async function submitOtp(code: string) {
  for (const [index, digit] of [...code].entries()) {
    fireEvent.change(screen.getByLabelText(`Digit ${index + 1} of 6`), { target: { value: digit } });
  }
}

describe('auth OTP verification boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'anon-key';

    supabaseMock.auth.verifyOtp.mockResolvedValue({ data: { session: null }, error: null });
    supabaseMock.auth.setSession.mockResolvedValue({ error: null });
    supabaseMock.auth.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'server-minted-access-token',
          refresh_token: 'server-minted-refresh-token',
          user: { id: 'supabase-user-1' },
        },
      },
      error: null,
    });
    supabaseMock.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const body = init?.body ? JSON.parse(String(init.body)) : {};

        if (url.includes('/api/auth/pre-register-otp')) {
          calls.push({ url, body });
          return jsonResponse({ success: true, resendInSeconds: 60 });
        }

        if (url.includes('/api/auth/verify-otp')) {
          calls.push({ url, body });
          return jsonResponse({
            success: true,
            verified: 'register',
            session: {
              access_token: 'server-minted-access-token',
              refresh_token: 'server-minted-refresh-token',
            },
          });
        }

        if (url.includes('/api/auth/complete-registration')) {
          calls.push({ url, body });
          return jsonResponse({
            success: true,
            user: { id: 'local-user-1', name: 'New', email: body.email, role: 'customer' },
          });
        }

        if (url.includes('/api/users/profile')) {
          return jsonResponse({ user: null });
        }

        return jsonResponse({ success: true });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  });

  it('verifies a registration code through the rate-limited server route, never the browser client', async () => {
    renderAuthModal();

    // A new account goes straight from Continue to the code screen.
    await enterIdentifier('newuser@example.com');

    await act(async () => {
      await submitOtp('482719');
    });

    const verifyCall = await waitFor(() => {
      const match = calls.find((call) => call.url.includes('/api/auth/verify-otp'));
      if (!match) throw new Error('verify-otp was never called');
      return match;
    });

    expect(verifyCall.body).toEqual({
      identifier: 'newuser@example.com',
      purpose: 'register',
      pin: '482719',
    });

    // The browser must never be the one validating the code.
    expect(supabaseMock.auth.verifyOtp).not.toHaveBeenCalled();

    // The server hands back the session; the browser only adopts it.
    await waitFor(() => {
      expect(supabaseMock.auth.setSession).toHaveBeenCalledWith({
        access_token: 'server-minted-access-token',
        refresh_token: 'server-minted-refresh-token',
      });
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Create password' })).toBeTruthy();
    });
  });

  it('keeps the password step locked until the code is verified, then accepts a policy-compliant password', async () => {
    renderAuthModal();

    await enterIdentifier('newuser@example.com');
    await act(async () => {
      await submitOtp('482719');
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Create password' })).toBeTruthy();
    });

    const createButton = screen.getByRole('button', { name: 'Create account' }) as HTMLButtonElement;
    expect(createButton.disabled).toBe(true);

    const passwordInput = screen.getByLabelText('Create password', { selector: 'input' });
    fireEvent.change(passwordInput, { target: { value: 'short' } });
    expect((screen.getByRole('button', { name: 'Create account' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(passwordInput, { target: { value: 'longenough1' } });
    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Create account' }) as HTMLButtonElement).disabled).toBe(false);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    });

    await waitFor(() => {
      expect(
        calls.some(
          (call) => call.url.includes('/api/auth/complete-registration') && call.body.password === 'longenough1',
        ),
      ).toBe(true);
    });
  });

  it('creates the account once even when Create account is double-clicked', async () => {
    renderAuthModal();

    await enterIdentifier('newuser@example.com');
    await act(async () => {
      await submitOtp('482719');
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Create password' })).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('Create password', { selector: 'input' }), {
      target: { value: 'longenough1' },
    });

    const createButton = screen.getByRole('button', { name: 'Create account' });

    await act(async () => {
      // Two clicks inside one tick, before the disabled state can re-render.
      fireEvent.click(createButton);
      fireEvent.click(createButton);
    });

    await waitFor(() => {
      expect(calls.some((call) => call.url.includes('/api/auth/complete-registration'))).toBe(true);
    });

    expect(calls.filter((call) => call.url.includes('/api/auth/complete-registration'))).toHaveLength(1);
  });

  it('rejects a wrong registration code without clearing the session or navigating on', async () => {
    vi.mocked(globalThis.fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};

      if (url.includes('/api/auth/pre-register-otp')) {
        calls.push({ url, body });
        return jsonResponse({ success: true, resendInSeconds: 60 });
      }

      if (url.includes('/api/auth/verify-otp')) {
        calls.push({ url, body });
        return jsonResponse({ error: 'Incorrect verification code.', code: 'INVALID' }, 400);
      }

      if (url.includes('/api/users/profile')) return jsonResponse({ user: null });
      return jsonResponse({ success: true });
    });

    renderAuthModal();

    await enterIdentifier('newuser@example.com');
    await act(async () => {
      await submitOtp('111111');
    });

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Incorrect verification code.');
    });

    // §12: the user stays on the code screen and can simply try again.
    expect(screen.getByRole('heading', { name: /Verify your email/ })).toBeTruthy();
    expect(screen.getByText(/Code sent to/)).toBeTruthy();
    expect(supabaseMock.auth.setSession).not.toHaveBeenCalled();
    expect(calls.some((call) => call.url.includes('/api/auth/complete-registration'))).toBe(false);
  });

  it('sends a resend through the server cooldown endpoint rather than re-running registration', async () => {
    // No client cooldown on the initial send, so the resend control is
    // immediately available and the assertion needs no timer control.
    vi.mocked(globalThis.fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};

      if (url.includes('/api/auth/pre-register-otp')) {
        calls.push({ url, body });
        return jsonResponse({ success: true, resendInSeconds: 0 });
      }

      if (url.includes('/api/auth/resend-otp')) {
        calls.push({ url, body });
        return jsonResponse({ success: true, resendInSeconds: 60 });
      }

      if (url.includes('/api/users/profile')) return jsonResponse({ user: null });
      return jsonResponse({ success: true });
    });

    renderAuthModal();

    await enterIdentifier('newuser@example.com');

    const resendButton = await screen.findByRole('button', { name: 'Resend code' });

    await act(async () => {
      fireEvent.click(resendButton);
    });

    await waitFor(() => {
      expect(calls.some((call) => call.url.includes('/api/auth/resend-otp'))).toBe(true);
    });

    const resendCall = calls.find((call) => call.url.includes('/api/auth/resend-otp'));
    expect(resendCall?.body).toMatchObject({ identifier: 'newuser@example.com', purpose: 'register' });

    // Resending must not restart account creation.
    expect(calls.filter((call) => call.url.includes('/api/auth/pre-register-otp'))).toHaveLength(1);
  });
});
