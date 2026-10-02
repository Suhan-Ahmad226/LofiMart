'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthModal } from '@/features/auth/context/AuthModalContext';
import { CheckCircle2, Package, ArrowRight, ShieldCheck, Loader2 } from 'lucide-react';
import { Link, useSearchParams } from '../../../lib/navigation';
import OtpInput from '@/features/auth/components/OtpInput';
import { useUser } from '@/features/shared/state/UserContext';

type RecentOrder = {
  orderId?: string;
  total?: number;
  placedAt?: string;
  guest?: boolean;
  guestEmail?: string;
  guestPhone?: string;
};

function readRecentOrder(orderIdParam: string | null): RecentOrder {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem('amarshop_recent_order');
    if (!raw) return {};
    const parsed = JSON.parse(raw) as RecentOrder;
    if (orderIdParam && parsed.orderId !== orderIdParam) {
      return { guest: parsed.guest };
    }
    return parsed;
  } catch {
    return {};
  }
}

export default function OrderSuccessPage() {
  const { openAuth } = useAuthModal();
  const [params] = useSearchParams();
  const { token, isAuthenticated } = useUser();
  const orderIdParam = useMemo(() => params.get('orderId'), [params]);

  const [recentOrder, setRecentOrder] = useState<RecentOrder>(() =>
    readRecentOrder(orderIdParam),
  );

  useEffect(() => {
    setRecentOrder(readRecentOrder(orderIdParam));
  }, [orderIdParam]);

  const isGuest =
    Boolean(recentOrder.guest) || (!isAuthenticated && Boolean(recentOrder.guestEmail));

  const [claimState, setClaimState] = useState<'idle' | 'otpSent' | 'claiming' | 'claimed' | 'error'>('idle');
   const [pin, setPin] = useState('');
  const [claimChallengeId, setClaimChallengeId] = useState('');
  const [claimMessage, setClaimMessage] = useState('');

  const orderId = recentOrder.orderId || orderIdParam || '';

  const orderClaimRedirect = useMemo(() => {
    if (!orderId) return null;
    return `/order-success?orderId=${encodeURIComponent(orderId)}`;
  }, [orderId]);

  const handleRequestOtp = useCallback(async () => {
    if (!orderId || !token) return;
    setClaimState('claiming');
    setClaimMessage('');
    try {
      const response = await fetch('/api/orders/claim-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'OTP পাঠানো ব্যর্থ হয়েছে।');
      }
      setClaimChallengeId(String(payload.challengeId || ''));
      setClaimState('otpSent');
      setClaimMessage('A verification code was sent to the email on your order.');
    } catch (claimError) {
      setClaimState('error');
      setClaimMessage(claimError instanceof Error ? claimError.message : 'OTP পাঠানো ব্যর্থ হয়েছে।');
    }
  }, [orderId, token]);

  const handleClaim = useCallback(async () => {
    if (!orderId || !token || !pin) return;
    setClaimState('claiming');
    setClaimMessage('');
    try {
      const response = await fetch('/api/orders/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId, pin, challengeId: claimChallengeId || undefined }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'অর্ডার claim করা ব্যর্থ হয়েছে।');
      }
      setClaimState('claimed');
      setClaimMessage('Order successfully linked to your account.');
    } catch (claimError) {
      setClaimState('error');
      setClaimMessage(claimError instanceof Error ? claimError.message : 'অর্ডার claim করা ব্যর্থ হয়েছে।');
    }
  }, [orderId, pin, token, claimChallengeId]);

  const claimBusy = claimState === 'claiming';

  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <div className="bg-card border border-border rounded-3xl shadow-sm p-8 md:p-12 text-center space-y-6">
        <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <CheckCircle2 size={40} />
        </div>

        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-primary">Order Confirmed</p>
          <h1 className="text-3xl md:text-4xl font-bold">Thank you for your purchase</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Your order has been placed successfully. We are preparing it now and you can track progress from your account.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 text-left">
          <div className="rounded-2xl bg-secondary/60 border border-border p-5">
            <div className="flex items-center gap-3 mb-2 text-primary">
              <Package size={18} />
              <span className="font-semibold">What happens next</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {isGuest
                ? 'We will update shipping and delivery status on this order. You can claim it below to track it in your account.'
                : 'You will see the order in your dashboard, and our team will update shipping and delivery status as it moves.'}
            </p>
          </div>

          <div className="rounded-2xl bg-secondary/60 border border-border p-5">
            <div className="flex items-center gap-3 mb-2 text-accent">
              <CheckCircle2 size={18} />
              <span className="font-semibold">Need anything else?</span>
            </div>
            <p className="text-sm text-muted-foreground">
              You can continue shopping now or open your orders page to review the purchase details.
            </p>
          </div>
        </div>

        {isGuest ? (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5 text-left space-y-4">
            <div className="flex items-start gap-3">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-sky-600" />
              <div>
                <p className="text-sm font-semibold text-sky-900">Claim this order to your account</p>
                <p className="mt-1 text-sm leading-6 text-sky-700">
                  We will send a verification code to the email and phone used for this order. Confirm it to link the
                  order to your account and track it in My Orders.
                </p>
              </div>
            </div>

            {!isAuthenticated ? (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  className="btn-primary inline-flex items-center gap-2"
                 onClick={() => openAuth({ returnTo: typeof window !== "undefined" ? window.location.pathname + window.location.search : "/" })}>
                  Register to claim
                  <ArrowRight size={16} />
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 px-6 py-2 rounded-lg font-semibold border border-border bg-card hover:bg-secondary transition-colors"
                 onClick={() => openAuth({ returnTo: typeof window !== "undefined" ? window.location.pathname + window.location.search : "/" })}>
                  Login
                </button>
              </div>
            ) : claimState === 'claimed' ? (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-medium text-emerald-700">
                Order linked to your account. View it in My Orders.
              </div>
            ) : (
              <div className="space-y-3">
                {claimState !== 'otpSent' ? (
                  <button
                    type="button"
                    onClick={() => void handleRequestOtp()}
                    disabled={claimState === 'claiming' || !token}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {claimState === 'claiming' ? (
                      <>
                        <Loader2 className="animate-spin" size={16} aria-hidden="true" />
                        Sending code...
                      </>
                    ) : (
                      <>Send verification code</>
                    )}
                  </button>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-3">
                      <OtpInput
                        value={pin}
                        onChange={setPin}
                        length={6}
                        ariaLabel="Order claim verification code"
                        onComplete={(next) => {
                          if (next.length === 6) void handleClaim();
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => void handleClaim()}
                        disabled={!pin || claimBusy}
                        className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {claimBusy ? (
                          <>
                            <Loader2 className="animate-spin" size={16} aria-hidden="true" />
                            Verifying...
                          </>
                        ) : (
                          <>Claim order</>
                        )}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRequestOtp()}
                      disabled={claimBusy}
                      className="text-xs font-semibold text-sky-700 underline-offset-4 hover:underline"
                    >
                      Resend code
                    </button>
                  </>
                )}
                {claimMessage ? (
                  <p className="text-sm font-medium text-sky-800">{claimMessage}</p>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link to="/account/orders" className="btn-primary inline-flex items-center gap-2">
            View My Orders
            <ArrowRight size={16} />
          </button>
          <Link
            to="/shop"
            className="inline-flex items-center gap-2 px-6 py-2 rounded-lg font-semibold border border-border bg-card hover:bg-secondary transition-colors"
          >
            Continue Shopping
          </button>
        </div>
      </div>
    </div>
  );
}