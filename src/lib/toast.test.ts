import { describe, expect, it, vi } from 'vitest';
import toast, { getToastDedupeKey, subscribe } from './toast';

describe('getToastDedupeKey', () => {
  it('returns the same key for identical toast payloads', () => {
    const first = getToastDedupeKey('success', {
      title: 'Profile updated',
      description: 'Your changes were saved.',
    });

    const second = getToastDedupeKey('success', {
      title: 'Profile updated',
      description: 'Your changes were saved.',
    });

    expect(first).toBe(second);
  });

  it('returns different keys for different messages', () => {
    const first = getToastDedupeKey('error', {
      title: 'Payment failed',
      description: 'Please try again.',
    });

    const second = getToastDedupeKey('warning', {
      title: 'Payment failed',
      description: 'Please try again.',
    });

    expect(first).not.toBe(second);
  });

  it('suppresses duplicate toasts while they are queued', () => {
    vi.useFakeTimers();

    let latestToasts: Array<{ title: string }> = [];
    const unsubscribe = subscribe((snapshot) => {
      latestToasts = snapshot.visible.map((item) => ({ title: String(item.title) }));
    });

    const alphaId = toast.success('Alpha');
    const betaId = toast.success('Beta');
    const gammaId = toast.success('Gamma');
    const deltaId = toast.success('Delta');
    const echoId = toast.success('Echo');
    const duplicateEchoId = toast.success('Echo');

    expect(echoId).toBeTruthy();
    expect(duplicateEchoId).toBe(echoId);

    toast.dismiss(alphaId);
    vi.advanceTimersByTime(250);

    toast.dismiss(betaId);
    vi.advanceTimersByTime(250);

    const echoCount = latestToasts.filter((item) => item.title === 'Echo').length;

    unsubscribe();
    vi.useRealTimers();

    expect(echoCount).toBe(1);
  });
});
