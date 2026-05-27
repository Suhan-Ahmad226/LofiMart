"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Loader2, MapPin, ShieldCheck, Store, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from '@/src/lib/navigation';
import { useUser } from '../../context/UserContext';
import { CenteredLoader, FormNotice } from '../../components/ui/FeedbackState';

type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  status: string;
  action_path: string;
};

type OnboardingStatusPayload = {
  seller?: {
    id: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    store_name?: string | null;
    storefront_slug?: string | null;
    seller_status?: string | null;
    submitted_for_review_at?: string | null;
    approved_at?: string | null;
    rejection_reason?: string | null;
    suspension_reason?: string | null;
  };
  summary: {
    completed_steps: number;
    total_steps: number;
    progress_percent: number;
    ready_for_live_booking: boolean;
    ready_for_admin_review: boolean;
    ready_for_payout: boolean;
    ready_for_storefront_publish: boolean;
  };
  steps: OnboardingStep[];
  next_step?: OnboardingStep | null;
  pickups?: {
    total: number;
    linked_courier_store_count: number;
  };
  verification?: {
    status: string;
    rejection_reason?: string | null;
  } | null;
  approval?: {
    status: string;
    submitted_for_review_at?: string | null;
    approved_at?: string | null;
    rejection_reason?: string | null;
    suspension_reason?: string | null;
    requirements: Array<{ id: string; label: string; completed: boolean }>;
    missing_requirements: Array<{ id: string; label: string; completed: boolean }>;
    can_submit_for_review: boolean;
  } | null;
};

type ProfileResponse = {
  user?: {
    name?: string | null;
    phone?: string | null;
    bio?: string | null;
    store_name?: string | null;
  };
};

type StorefrontResponse = {
  storefront_slug?: string;
  storefront_headline?: string;
  storefront_accent_color?: string;
  storefront_published?: boolean;
};

const emptyStatus: OnboardingStatusPayload = {
  summary: {
    completed_steps: 0,
    total_steps: 0,
    progress_percent: 0,
    ready_for_live_booking: false,
    ready_for_admin_review: false,
    ready_for_payout: false,
    ready_for_storefront_publish: false,
  },
  steps: [],
  next_step: null,
  pickups: {
    total: 0,
    linked_courier_store_count: 0,
  },
  verification: null,
};

export const SellerOnboardingPage = () => {
  const { token, user, setUser } = useUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [status, setStatus] = useState<OnboardingStatusPayload>(emptyStatus);
  const [profileForm, setProfileForm] = useState({
    name: '',
    phone: '',
    store_name: '',
    bio: '',
  });
  const [storefrontForm, setStorefrontForm] = useState({
    storefront_slug: '',
    storefront_headline: '',
    storefront_accent_color: '#0F766E',
    storefront_published: false,
  });

  const loadOnboarding = async () => {
    if (!token) return;

    setLoading(true);
    setError('');

    try {
      const [statusRes, profileRes, storefrontRes] = await Promise.all([
        fetch('/api/seller/onboarding-status', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/users/profile', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/seller/storefront-settings', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const statusPayload = await statusRes.json().catch(() => null);
      const profilePayload = await profileRes.json().catch(() => null);
      const storefrontPayload = await storefrontRes.json().catch(() => null);

      if (!statusRes.ok) {
        throw new Error(statusPayload?.error || 'Failed to load seller onboarding status');
      }
      if (!profileRes.ok) {
        throw new Error(profilePayload?.error || 'Failed to load seller profile');
      }
      if (!storefrontRes.ok) {
        throw new Error(storefrontPayload?.error || 'Failed to load seller storefront settings');
      }

      const safeProfile = profilePayload as ProfileResponse;
      const safeStorefront = storefrontPayload as StorefrontResponse;

      setStatus(statusPayload as OnboardingStatusPayload);
      setProfileForm({
        name: safeProfile?.user?.name || '',
        phone: safeProfile?.user?.phone || '',
        store_name: safeProfile?.user?.store_name || '',
        bio: safeProfile?.user?.bio || '',
      });
      setStorefrontForm({
        storefront_slug: safeStorefront?.storefront_slug || '',
        storefront_headline: safeStorefront?.storefront_headline || '',
        storefront_accent_color: safeStorefront?.storefront_accent_color || '#0F766E',
        storefront_published: Boolean(safeStorefront?.storefront_published),
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to load onboarding');
      setStatus(emptyStatus);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOnboarding();
  }, [token]);

  const completionLabel = useMemo(() => {
    const completed = status.summary.completed_steps;
    const total = status.summary.total_steps;
    return total > 0 ? `${completed}/${total} completed` : 'Not started';
  }, [status.summary.completed_steps, status.summary.total_steps]);

  const saveQuickStart = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;

    try {
      setSaving(true);
      setError('');
      setMessage('');

      const [profileRes, storefrontRes] = await Promise.all([
        fetch('/api/users/profile', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: profileForm.name,
            phone: profileForm.phone,
            store_name: profileForm.store_name,
            bio: profileForm.bio,
          }),
        }),
        fetch('/api/seller/storefront-settings', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            storefront_slug: storefrontForm.storefront_slug,
            storefront_headline: storefrontForm.storefront_headline,
            storefront_accent_color: storefrontForm.storefront_accent_color,
            storefront_published: storefrontForm.storefront_published,
          }),
        }),
      ]);

      const profilePayload = await profileRes.json().catch(() => null);
      const storefrontPayload = await storefrontRes.json().catch(() => null);

      if (!profileRes.ok) {
        throw new Error(profilePayload?.error || 'Failed to save seller profile');
      }
      if (!storefrontRes.ok) {
        throw new Error(storefrontPayload?.error || 'Failed to save storefront settings');
      }

      setMessage('Your onboarding basics were saved. Continue with pickup, verification, and payout to go fully live.');
      toast.success('Seller onboarding basics saved.');
      await loadOnboarding();
    } catch (requestError) {
      const nextError = requestError instanceof Error ? requestError.message : 'Failed to save onboarding';
      setError(nextError);
      toast.error(nextError);
    } finally {
      setSaving(false);
    }
  };

  const submitForReview = async () => {
    if (!token) return;

    try {
      setSubmittingReview(true);
      setError('');
      setMessage('');

      const response = await fetch('/api/seller/submit-for-review', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to submit seller account for review');
      }

      toast.success('Submitted for admin review.');
      setMessage('Your seller account was submitted for review. You can keep editing onboarding details while admin reviews it.');
      if (user) {
        setUser({
          ...user,
          seller_status: payload?.seller_status || 'pending_review',
        });
      }
      await loadOnboarding();
    } catch (requestError) {
      const nextError = requestError instanceof Error ? requestError.message : 'Failed to submit seller account for review';
      setError(nextError);
      toast.error(nextError);
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) {
    return <CenteredLoader label="Loading seller onboarding..." className="min-h-[300px]" />;
  }

  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-border bg-[linear-gradient(135deg,rgba(40,167,69,0.10),rgba(15,23,42,0.05))] p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-primary/70">Seller onboarding</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">Set up your store the smart way</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Complete your store identity, pickup readiness, verification, and payout setup from one guided workflow.
            </p>
          </div>
          <div className="rounded-3xl border border-border bg-white/80 px-5 py-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Completion</p>
            <p className="mt-2 text-3xl font-bold text-foreground">{status.summary.progress_percent}%</p>
            <p className="mt-1 text-sm text-muted-foreground">{completionLabel}</p>
          </div>
        </div>
      </div>

      {error ? <FormNotice tone="error">{error}</FormNotice> : null}
      {message ? <FormNotice tone="success">{message}</FormNotice> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="metric-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pickup points</p>
          <p className="mt-2 text-2xl font-bold">{status.pickups?.total || 0}</p>
          <p className="mt-1 text-sm text-muted-foreground">Total seller pickup locations</p>
        </div>
        <div className="metric-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Courier linked</p>
          <p className="mt-2 text-2xl font-bold">{status.pickups?.linked_courier_store_count || 0}</p>
          <p className="mt-1 text-sm text-muted-foreground">Pickup points mapped to courier store</p>
        </div>
        <div className="metric-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Verification</p>
          <p className="mt-2 text-2xl font-bold capitalize">{status.verification?.status || 'none'}</p>
          <p className="mt-1 text-sm text-muted-foreground">Current KYC review state</p>
        </div>
        <div className="metric-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next step</p>
          <p className="mt-2 text-lg font-bold">{status.next_step?.title || 'All set'}</p>
          <p className="mt-1 text-sm text-muted-foreground">{status.next_step?.status || 'Your seller onboarding is in a good state.'}</p>
        </div>
      </div>

      <div className="surface-card p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-primary/70">Approval workflow</p>
            <h2 className="mt-2 text-xl font-bold tracking-tight">Seller approval status</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Finish the required onboarding items, then submit your account for admin review. You can keep creating draft products while you wait.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-700">
                {String(status.approval?.status || status.seller?.seller_status || 'draft').replaceAll('_', ' ')}
              </span>
              {status.approval?.submitted_for_review_at ? (
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                  Submitted {new Date(status.approval.submitted_for_review_at).toLocaleDateString()}
                </span>
              ) : null}
              {status.approval?.approved_at ? (
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Approved {new Date(status.approval.approved_at).toLocaleDateString()}
                </span>
              ) : null}
            </div>
          </div>
          <div className="rounded-3xl border border-border bg-white/80 p-5 shadow-sm lg:max-w-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Review gate</p>
            <p className="mt-2 text-sm text-slate-700">
              {status.approval?.can_submit_for_review
                ? 'All required onboarding checkpoints are complete. You can submit now.'
                : 'Complete every required checklist item below before review can be submitted.'}
            </p>
            <button
              type="button"
              onClick={submitForReview}
              disabled={!status.approval?.can_submit_for_review || submittingReview}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submittingReview ? <Loader2 className="animate-spin" size={16} /> : null}
              {submittingReview ? 'Submitting...' : 'Submit for review'}
            </button>
          </div>
        </div>

        {status.approval?.rejection_reason ? (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Rejection reason: {status.approval.rejection_reason}
          </div>
        ) : null}
        {status.approval?.suspension_reason ? (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Suspension reason: {status.approval.suspension_reason}
          </div>
        ) : null}

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(status.approval?.requirements || []).map((requirement) => (
            <div key={requirement.id} className="rounded-2xl border border-border bg-secondary/20 px-4 py-3">
              <p className="text-sm font-semibold text-foreground">{requirement.label}</p>
              <p className={`mt-1 text-xs font-semibold ${requirement.completed ? 'text-emerald-700' : 'text-amber-700'}`}>
                {requirement.completed ? 'Complete' : 'Missing'}
              </p>
            </div>
          ))}
        </div>
      </div>

      <form id="storefront" onSubmit={saveQuickStart} className="surface-card p-6 sm:p-8">
        <div className="mb-6 flex items-start gap-3">
          <Store className="mt-0.5 text-primary" size={20} />
          <div>
            <h2 className="text-xl font-bold">Quick start basics</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Save the essentials that power your seller profile and public storefront before you move to courier and compliance.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Full name</span>
            <input
              value={profileForm.name}
              onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))}
              className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary"
              placeholder="Seller full name"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Phone number</span>
            <input
              value={profileForm.phone}
              onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))}
              className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary"
              placeholder="01XXXXXXXXX"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Store name</span>
            <input
              value={profileForm.store_name}
              onChange={(event) => setProfileForm((current) => ({ ...current, store_name: event.target.value }))}
              className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary"
              placeholder="Dhaka Main Fashion"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Storefront slug</span>
            <input
              value={storefrontForm.storefront_slug}
              onChange={(event) =>
                setStorefrontForm((current) => ({
                  ...current,
                  storefront_slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                }))
              }
              className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary"
              placeholder="dhaka-main-fashion"
            />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-semibold text-foreground">Store bio</span>
            <textarea
              rows={3}
              value={profileForm.bio}
              onChange={(event) => setProfileForm((current) => ({ ...current, bio: event.target.value }))}
              className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary"
              placeholder="Tell customers what you sell, where you dispatch from, and what makes your store trustworthy."
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Storefront headline</span>
            <input
              value={storefrontForm.storefront_headline}
              onChange={(event) => setStorefrontForm((current) => ({ ...current, storefront_headline: event.target.value }))}
              className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary"
              placeholder="Original products, fast dispatch, and seller-direct support."
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Accent color</span>
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3">
              <input
                type="color"
                value={storefrontForm.storefront_accent_color}
                onChange={(event) => setStorefrontForm((current) => ({ ...current, storefront_accent_color: event.target.value }))}
                className="h-10 w-12 rounded-lg border-0 bg-transparent p-0"
              />
              <input
                value={storefrontForm.storefront_accent_color}
                onChange={(event) => setStorefrontForm((current) => ({ ...current, storefront_accent_color: event.target.value }))}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                placeholder="#0F766E"
              />
            </div>
          </label>
        </div>

        <label className="mt-4 flex items-start gap-3 rounded-2xl border border-border bg-secondary/30 px-4 py-4">
          <input
            type="checkbox"
            checked={storefrontForm.storefront_published}
            onChange={(event) => setStorefrontForm((current) => ({ ...current, storefront_published: event.target.checked }))}
            disabled={status.approval?.status !== 'approved'}
            className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <span>
            <span className="block text-sm font-semibold text-foreground">Publish storefront when ready</span>
              <span className="mt-1 block text-xs text-muted-foreground">
              {status.approval?.status === 'approved'
                ? 'Turn this on when your store basics, pickup setup, and support details are ready to be seen publicly.'
                : 'Publishing stays locked until admin approves your seller account.'}
              </span>
            </span>
          </label>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Need deeper branding controls? You can still use the full store settings page for banner, custom domain, and advanced storefront controls.
          </p>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : null}
            {saving ? 'Saving...' : 'Save onboarding basics'}
          </button>
        </div>
      </form>

      <div className="grid gap-4 xl:grid-cols-2">
        {status.steps.map((step) => (
          <div key={step.id} className="surface-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {step.completed ? (
                    <CheckCircle2 size={18} className="text-emerald-600" />
                  ) : step.id === 'pickup' ? (
                    <MapPin size={18} className="text-primary" />
                  ) : step.id === 'verification' ? (
                    <ShieldCheck size={18} className="text-primary" />
                  ) : step.id === 'payout' ? (
                    <Wallet size={18} className="text-primary" />
                  ) : (
                    <Store size={18} className="text-primary" />
                  )}
                  <h3 className="text-base font-bold text-foreground">{step.title}</h3>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
                  step.completed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}
              >
                {step.completed ? 'Complete' : 'Pending'}
              </span>
            </div>

            <div className="mt-4 rounded-2xl bg-secondary/40 px-4 py-3 text-sm text-slate-700">
              {step.status}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {step.completed ? 'You can still reopen this step to refine or update details.' : 'Finish this step to raise your seller readiness score.'}
              </p>
              <Link
                to={step.action_path}
                className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-primary/20 hover:text-primary"
              >
                Open
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SellerOnboardingPage;
