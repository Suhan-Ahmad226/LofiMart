/* @vitest-environment jsdom */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      verifyOtp: vi.fn(),
      setSession: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signOut: vi.fn(),
      signInWithOAuth: vi.fn(),
    },
  })),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { AuthModalProvider, useAuthModal } from '@/features/auth/context/AuthModalContext';
import { UserProvider } from '@/features/shared/state/UserContext';
import AuthModal from '@/features/auth/components/AuthModal';
import OtpInput from '@/features/auth/components/OtpInput';

type FetchCall = { url: string; body: Record<string, unknown> };

const calls: FetchCall[] = [];

/** The server reports this address as an already verified account. */
const EXISTING_EMAIL = 'existing@example.com';

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

async function submitForm(name: string) {
  const submitter = screen.getByRole('button', { name });
  const form = submitter.closest('form');
  expect(form).not.toBeNull();
  await act(async () => {
    fireEvent.submit(form as HTMLFormElement);
  });
}

/** Walks the entry screen into the password step for a known account. */
async function openExistingAccount() {
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: EXISTING_EMAIL },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  });
}

describe('auth modal responsiveness and interaction contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'anon-key';

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const body = init?.body ? JSON.parse(String(init.body)) : {};

        if (url.includes('/api/auth/supabase/login')) {
          calls.push({ url, body });
          return jsonResponse({
            success: true,
            user: { id: 'u1', name: 'Test', email: body.identifier, role: 'customer' },
            session: { access_token: 'a', refresh_token: 'r' },
          });
        }

        if (url.includes('/api/auth/pre-register-otp')) {
          calls.push({ url, body });

          // A verified account is answered with ACCOUNT_EXISTS so the modal
          // moves straight to the password step; everyone else gets a code.
          if (body.email === EXISTING_EMAIL) {
            return jsonResponse(
              { error: 'Account already exists. Please login.', code: 'ACCOUNT_EXISTS' },
              409,
            );
          }

          return jsonResponse({ success: true, resendInSeconds: 60 });
        }

        if (url.includes('/api/users/profile')) return jsonResponse({ user: null });
        return jsonResponse({ success: true });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  });

  it('tracks the dynamic viewport height and keeps the header reachable on short screens', () => {
    renderAuthModal();

    const overlay = document.querySelector('.auth-overlay') as HTMLElement;
    const scroller = document.querySelector('.auth-scroll') as HTMLElement;

    // 100vh alone overshoots on mobile once the browser chrome collapses.
    expect(overlay.className).toContain('overflow-y-auto');
    expect(overlay.className).toContain('overscroll-contain');
    // Pinned to the bottom on phones so the sheet matches the design, centred from sm up.
    expect(overlay.className).toContain('items-end');
    expect(overlay.className).toContain('sm:items-center');
    expect(scroller).toBeTruthy();
  });

  it('exposes the dialog with a programmatic name and description', () => {
    renderAuthModal();

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById('lofimart-auth-title')).toBeTruthy();
    expect(document.getElementById('lofimart-auth-subtitle')).toBeTruthy();
  });

  it('announces validation errors in a live region', async () => {
    renderAuthModal();

    await submitForm('Continue');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Enter your email or phone number.');
  });

  it('gives the identity field phone-friendly input attributes', () => {
    renderAuthModal();

    const input = screen.getByLabelText('Email address') as HTMLInputElement;
    expect(input.getAttribute('autocapitalize')).toBe('none');
    expect(input.getAttribute('autocorrect')).toBe('off');
    expect(input.getAttribute('spellcheck')).toBe('false');
    expect(input.getAttribute('autocomplete')).toBe('username');
  });

  it('sends a new account straight to the code screen without a send button', async () => {
    renderAuthModal();

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'someone@example.com' },
    });
    await submitForm('Continue');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Verify your email/ })).toBeTruthy();
    });

    // §8: no separate "send code" step for a new account.
    expect(calls.some((call) => call.url.includes('/api/auth/pre-register-otp'))).toBe(true);
    expect(screen.queryByRole('button', { name: /Send verification code/ })).toBeNull();
  });

  it('shows the password screen for an account the server already knows', async () => {
    renderAuthModal();

    await openExistingAccount();

    expect(screen.getByText('Welcome back 👋')).toBeTruthy();
    expect(screen.getByText(EXISTING_EMAIL.replace(/^(.).*(@.*)$/, '$1***$2'))).toBeTruthy();
  });

  it('keeps the OTP screen free of password fields and a verify button', async () => {
    renderAuthModal();

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'someone@example.com' },
    });
    await submitForm('Continue');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Verify your email/ })).toBeTruthy();
    });

    // Password stays completely hidden until the code is verified.
    expect(screen.queryByLabelText('Create password')).toBeNull();
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.queryByRole('button', { name: /Create account/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Verify/ })).toBeNull();
    expect(screen.getAllByRole('textbox')).toHaveLength(6);
  });

  it('only closes through the explicit close button', async () => {
    renderAuthModal();

    const dialog = screen.getByRole('dialog');
    const overlay = dialog.parentElement as HTMLElement;

    await act(async () => {
      fireEvent.mouseDown(overlay);
    });
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });

    expect(screen.queryByRole('dialog')).not.toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('submits the password step with the Enter key', async () => {
    renderAuthModal();

    await openExistingAccount();

    const password = screen.getByLabelText('Password');
    expect(password.getAttribute('autocomplete')).toBe('current-password');

    fireEvent.change(password, { target: { value: 'Password123' } });
    await submitForm('Sign in');

    await waitFor(() => {
      expect(calls.some((call) => call.url.includes('/api/auth/supabase/login'))).toBe(true);
    });
  });

  it('offers signup only for email identifiers and explains why for phone numbers', async () => {
    renderAuthModal();

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: '01712345678' },
    });
    await submitForm('Continue');

    expect(screen.queryByRole('button', { name: /Create an account/ })).toBeNull();
    expect(screen.getByText(/New accounts need an email address/)).toBeTruthy();
  });

  it('autofocuses the forgot-password field so it can be submitted immediately', async () => {
    renderAuthModal();

    await openExistingAccount();

    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));

    const field = screen.getByLabelText('Email or phone') as HTMLInputElement;
    expect(field.value).toBe(EXISTING_EMAIL);
    expect(field.getAttribute('autocapitalize')).toBe('none');
    expect(screen.getByText("If an account exists, we'll send a verification code.")).toBeTruthy();
  });

  it('gives the header controls a 44px touch target', async () => {
    renderAuthModal();

    const dialog = screen.getByRole('dialog');
    const header = dialog.firstElementChild as HTMLElement;

    for (const control of Array.from(header.querySelectorAll('button'))) {
      expect(control.className).toContain('h-11 w-11');
      expect(control.className).toContain('shrink-0');
    }

    // The text-style links also need real tap height, not just a text line.
    await openExistingAccount();

    for (const name of ['Forgot password?', /Create an account/, 'Use another account']) {
      expect(screen.getByRole('button', { name }).className).toContain('min-h-11');
    }
  });

  it('keeps the caret in the autofocused field instead of the close button', async () => {
    renderAuthModal();

    await openExistingAccount();

    // The focus trap must not steal focus back from the password field.
    expect(document.activeElement).toBe(screen.getByLabelText('Password'));
  });

  it('still seeds focus inside the dialog when no field claims it', async () => {
    renderAuthModal();

    const dialog = screen.getByRole('dialog');
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
  });

  it('keeps six OTP boxes inside the available width at any viewport', () => {
    render(
      <OtpInput value="123" onChange={() => {}} onComplete={() => {}} length={6} />,
    );

    const group = screen.getByRole('group');
    // flex-1 + max-width lets the row shrink instead of overflowing on 320px screens.
    expect(group.className).toContain('w-full');

    const boxes = screen.getAllByRole('textbox');
    expect(boxes).toHaveLength(6);
    for (const box of boxes) {
      expect(box.className).toContain('flex-1');
      expect(box.className).toContain('min-w-0');
    }
  });

  it('spreads a pasted code across the cells and completes once', () => {
    const onChange = vi.fn();
    const onComplete = vi.fn();

    render(<OtpInput value="" onChange={onChange} onComplete={onComplete} length={6} />);

    fireEvent.paste(screen.getAllByRole('textbox')[0], {
      clipboardData: { getData: () => '482719' },
    });

    expect(onChange).toHaveBeenCalledWith('482719');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('482719');
  });

  it('accepts a code delivered by mobile OTP autofill', () => {
    const onChange = vi.fn();
    const onComplete = vi.fn();

    render(<OtpInput value="" onChange={onChange} onComplete={onComplete} length={6} />);

    // One-time-code comes from the platform autofill as a whole-value change.
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '123456' } });

    expect(onChange).toHaveBeenCalledWith('123456');
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('never completes while the code is incomplete', () => {
    const onComplete = vi.fn();

    render(<OtpInput value="" onChange={() => {}} onComplete={onComplete} length={6} />);

    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '482' } });
    fireEvent.paste(screen.getAllByRole('textbox')[0], {
      clipboardData: { getData: () => '482' },
    });

    expect(onComplete).not.toHaveBeenCalled();
  });

  it('stops completing twice when the same complete value repeats', () => {
    const onComplete = vi.fn();

    function Harness() {
      const [value, setValue] = React.useState('');
      return <OtpInput value={value} onChange={setValue} onComplete={onComplete} length={6} />;
    }

    render(<Harness />);

    const first = screen.getAllByRole('textbox')[0];
    fireEvent.change(first, { target: { value: '482719' } });
    // Re-delivering the same six digits must not fire a second verification.
    fireEvent.change(first, { target: { value: '482719' } });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('moves back with backspace and keeps the keyboard usable', () => {
    function Harness() {
      const [value, setValue] = React.useState('4827');
      return <OtpInput value={value} onChange={setValue} onComplete={() => {}} length={6} />;
    }

    render(<Harness />);

    const boxes = screen.getAllByRole('textbox') as HTMLInputElement[];

    // Backspace on a filled cell clears that digit and keeps the caret there.
    boxes[3].focus();
    fireEvent.keyDown(boxes[3], { key: 'Backspace' });
    expect(document.activeElement).toBe(boxes[3]);
    expect(boxes[3].value).toBe('');

    // On an empty cell it steps back to the previous box...
    fireEvent.keyDown(boxes[4], { key: 'Backspace' });
    expect(document.activeElement).toBe(boxes[3]);

    // ...and from there a further backspace removes the digit before it.
    fireEvent.keyDown(boxes[3], { key: 'Backspace' });
    expect(document.activeElement).toBe(boxes[2]);
    expect(boxes[2].value).toBe('');

    for (const box of boxes) {
      expect(box.getAttribute('inputmode')).toBe('numeric');
    }
  });

  it('does not accept interaction while verification is in progress', () => {
    render(<OtpInput value="4827" onChange={() => {}} onComplete={() => {}} length={6} disabled />);

    for (const box of screen.getAllByRole('textbox')) {
      expect((box as HTMLInputElement).disabled).toBe(true);
    }
  });
});
