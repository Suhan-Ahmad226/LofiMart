"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Loader2, Share2, Sparkles, Store, Wallet } from 'lucide-react';
import toast from '@/lib/toast';
import { Link } from '../../../lib/navigation';
import { useUser } from '../../../features/shared/state/UserContext';
import { CenteredLoader, FormNotice } from '@/features/shared/ui/FeedbackState';

type ResellerStep = {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  status: string;
  action_path: string;
};

type ResellerOnboardingPayload = {
  summary: {
    completed_steps: number;
    total_steps: number;
    progress_percent: number;
  };
  steps: ResellerStep[];
  next_step?: ResellerStep | null;
  metrics?: {
    referral_clicks: number;
    products_added: number;
    payout_method_count: number;
  };
};

export const ResellerOnboardingPage = () => {
  const { token } = useUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<ResellerOnboardingPayload | null>(null);
  const [profileForm, setProfileForm] = useState({ name: '', phone: '', bio: '' });
  const [storefrontForm, setStorefrontForm] = useState({
    storefront_headline: '',
    storefront_accent_color: '#D946EF',
    storefront_custom_domain: '',
    storefront_published: false,
  });

  const loadOnboarding = async () => {
    if (!token) return;
    setLoading(true);
    setError('');

    try {
      const [statusRes, profileRes, storefrontRes] = await Promise.all([
        fetch('/api/reseller/onboarding-status', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/users/profile', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/reseller/storefront-settings', { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const statusPayload = await statusRes.json().catch(() => null);
      const profilePayload = await profileRes.json().catch(() => null);
      const storefrontPayload = await storefrontRes.json().catch(() => null);

      if (!statusRes.ok) throw new Error(statusPayload?.error || 'Failed to load reseller onboarding status');
      if (!profileRes.ok) throw new Error(profilePayload?.error || 'Failed to load reseller profile');
      if (!storefrontRes.ok) throw new Error(storefrontPayload?.error || 'Failed to load reseller storefront settings');

      setStatus(statusPayload);
      setProfileForm({
        name: profilePayload?.user?.name || '',
        phone: profilePayload?.user?.phone || '',
        bio: profilePayload?.user?.bio || '',
      });
      setStorefrontForm({
        storefront_headline: storefrontPayload?.storefront_headline || '',
        storefront_accent_color: storefrontPayload?.storefront_accent_color || '#D946EF',
        storefront_custom_domain: storefrontPayload?.storefront_custom_domain || '',
        storefront_published: Boolean(storefrontPayload?.storefront_published),
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to load onboarding');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOnboarding();
  }, [token]);

  const completionLabel = useMemo(() => {
    if (!status) return 'Not started';
    return `${status.summary.completed_steps}/${status.summary.total_steps} completed`;
  }, [status]);

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
          body: JSON.stringify(profileForm),
        }),
        fetch('/api/reseller/storefront-settings', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(storefrontForm),
        }),
      ]);

      const profilePayload = await profileRes.json().catch(() => null);
      const storefrontPayload = await storefrontRes.json().catch(() => null);
      if (!profileRes.ok) throw new Error(profilePayload?.error || 'Failed to save reseller profile');
      if (!storefrontRes.ok) throw new Error(storefrontPayload?.error || 'Failed to save reseller storefront');

      setMessage('Reseller basics saved. Next, add products, setup payout, and start promoting.');
      toast.success('Reseller onboarding basics saved.');
      await loadOnboarding();
    } catch (requestError) {
      const nextError = requestError instanceof Error ? requestError.message : 'Failed to save onboarding';
      setError(nextError);
      toast.error(nextError);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <CenteredLoader label="Loading reseller onboarding..." className="min-h-[300px]" />;
  }

  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-border bg-[linear-gradient(135deg,rgba(217,70,239,0.10),rgba(15,23,42,0.05))] p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="section-kicker text-fuchsia-600/80">Reseller onboarding</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">Build your reseller shop and earning flow</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Complete your reseller identity, activate link sharing, add products, and prepare payout from one guided workflow.
            </p>
          </div>
          <div className="rounded-3xl border border-border bg-white/80 px-5 py-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Completion</p>
            <p className="mt-2 text-3xl font-bold text-foreground">{status?.summary.progress_percent || 0}%</p>
            <p className="mt-1 text-sm text-muted-foreground">{completionLabel}</p>
          </div>
        </div>
      </div>

      {error ? <FormNotice tone="error">{error}</FormNotice> : null}
      {message ? <FormNotice tone="success">{message}</FormNotice> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="metric-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Referral clicks</p>
          <p className="mt-2 text-2xl font-bold">{status?.metrics?.referral_clicks || 0}</p>
        </div>
        <div className="metric-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Products added</p>
          <p className="mt-2 text-2xl font-bold">{status?.metrics?.products_added || 0}</p>
        </div>
        <div className="metric-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payout methods</p>
          <p className="mt-2 text-2xl font-bold">{status?.metrics?.payout_method_count || 0}</p>
        </div>
      </div>

      <form onSubmit={saveQuickStart} className="surface-card p-6 sm:p-8">
        <div className="mb-6 flex items-start gap-3">
          <Sparkles className="mt-0.5 text-fuchsia-600" size={20} />
          <div>
            <h2 className="text-xl font-bold">Quick start basics</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Save your reseller profile and storefront basics before you move into catalog, promotions, and payout setup.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Full name</span>
            <input value={profileForm.name} onChange={(e) => setProfileForm((c) => ({ ...c, name: e.target.value }))} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Phone number</span>
            <input value={profileForm.phone} onChange={(e) => setProfileForm((c) => ({ ...c, phone: e.target.value }))} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary" />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-semibold text-foreground">Reseller bio</span>
            <textarea rows={3} value={profileForm.bio} onChange={(e) => setProfileForm((c) => ({ ...c, bio: e.target.value }))} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Storefront headline</span>
            <input value={storefrontForm.storefront_headline} onChange={(e) => setStorefrontForm((c) => ({ ...c, storefront_headline: e.target.value }))} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Accent color</span>
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3">
              <input type="color" value={storefrontForm.storefront_accent_color} onChange={(e) => setStorefrontForm((c) => ({ ...c, storefront_accent_color: e.target.value }))} className="h-10 w-12 rounded-lg border-0 bg-transparent p-0" />
              <input value={storefrontForm.storefront_accent_color} onChange={(e) => setStorefrontForm((c) => ({ ...c, storefront_accent_color: e.target.value }))} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            </div>
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-semibold text-foreground">Custom domain</span>
            <input value={storefrontForm.storefront_custom_domain} onChange={(e) => setStorefrontForm((c) => ({ ...c, storefront_custom_domain: e.target.value }))} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary" />
          </label>
        </div>

        <label className="mt-4 flex items-start gap-3 rounded-2xl border border-border bg-secondary/30 px-4 py-4">
          <input type="checkbox" checked={storefrontForm.storefront_published} onChange={(e) => setStorefrontForm((c) => ({ ...c, storefront_published: e.target.checked }))} className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <span>
            <span className="block text-sm font-semibold text-foreground">Publish storefront when ready</span>
            <span className="mt-1 block text-xs text-muted-foreground">Turn this on when your branding and catalog are ready for public promotion.</span>
          </span>
        </label>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Use this page for fast setup, then continue with catalog, promotions, payout, and settings from the linked steps below.</p>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? <Loader2 className="animate-spin" size={16} /> : null}
            {saving ? 'Saving...' : 'Save onboarding basics'}
          </button>
        </div>
      </form>

      <div className="grid gap-4 xl:grid-cols-2">
        {(status?.steps || []).map((step) => (
          <div key={step.id} className="surface-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {step.completed ? <CheckCircle2 size={18} className="text-emerald-600" /> : step.id === 'promotion' || step.id === 'referral' ? <Share2 size={18} className="text-fuchsia-600" /> : step.id === 'payout' ? <Wallet size={18} className="text-fuchsia-600" /> : <Store size={18} className="text-fuchsia-600" />}
                  <h3 className="text-base font-bold text-foreground">{step.title}</h3>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${step.completed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{step.completed ? 'Complete' : 'Pending'}</span>
            </div>
            <div className="mt-4 rounded-2xl bg-secondary/40 px-4 py-3 text-sm text-slate-700">{step.status}</div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">{step.completed ? 'You can reopen this step any time to refine your reseller setup.' : 'Finish this step to move closer to live selling and payout readiness.'}</p>
              <Link to={step.action_path} className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-primary/20 hover:text-primary">
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

export default ResellerOnboardingPage;
