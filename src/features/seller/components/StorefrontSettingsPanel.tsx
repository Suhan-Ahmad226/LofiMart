import React, { useEffect, useMemo, useState } from 'react';
import toast from '@/lib/toast';
import { CheckCircle2, ExternalLink, Globe, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useUser } from '../../../features/shared/state/UserContext';
import CloudinaryUpload from '@/features/shared/media/CloudinaryUpload';
import { Link } from '../../../lib/navigation';
import { CenteredLoader, FormNotice } from '@/features/shared/ui/FeedbackState';

type StorefrontSettings = {
  store_name: string;
  bio: string;
  storefront_slug: string;
  storefront_banner_url: string;
  storefront_headline: string;
  storefront_accent_color: string;
  storefront_custom_domain: string;
  storefront_published: boolean;
  seller_status?: string;
  rejection_reason?: string | null;
  suspension_reason?: string | null;
  domain_verification?: {
    domain: string | null;
    status: string;
    token: string | null;
    verified_at: string | null;
    records: Array<{ type: string; host: string; value: string; note: string }>;
  };
};

const initialSettings: StorefrontSettings = {
  store_name: '',
  bio: '',
  storefront_slug: '',
  storefront_banner_url: '',
  storefront_headline: '',
  storefront_accent_color: '#0F766E',
  storefront_custom_domain: '',
  storefront_published: true,
  seller_status: 'draft',
  rejection_reason: null,
  suspension_reason: null,
  domain_verification: {
    domain: null,
    status: 'unverified',
    token: null,
    verified_at: null,
    records: [],
  },
};

export function StorefrontSettingsPanel() {
  const { token, user, setUser } = useUser();
  const [settings, setSettings] = useState<StorefrontSettings>(initialSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingToken, setRefreshingToken] = useState(false);
  const [verifyingDomain, setVerifyingDomain] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;

    let mounted = true;
    setLoading(true);
    setError('');
    setMessage('');

    fetch('/api/seller/storefront-settings', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(payload?.error || 'Failed to load storefront settings');
        }
        if (!mounted) return;
        setSettings({
          store_name: payload.store_name || '',
          bio: payload.bio || '',
          storefront_slug: payload.storefront_slug || '',
          storefront_banner_url: payload.storefront_banner_url || '',
          storefront_headline: payload.storefront_headline || '',
          storefront_accent_color: payload.storefront_accent_color || '#0F766E',
          storefront_custom_domain: payload.storefront_custom_domain || '',
          storefront_published: Boolean(payload.storefront_published ?? true),
          seller_status: payload.seller_status || 'draft',
          rejection_reason: payload.rejection_reason || null,
          suspension_reason: payload.suspension_reason || null,
          domain_verification: payload.domain_verification || initialSettings.domain_verification,
        });
      })
      .catch((requestError: unknown) => {
        const nextError = requestError instanceof Error ? requestError.message : 'Failed to load storefront settings';
        toast.error(nextError);
        if (mounted) setError(nextError);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [token]);

  const storefrontUrl = useMemo(
    () => (settings.storefront_slug ? `/store/${settings.storefront_slug}` : ''),
    [settings.storefront_slug],
  );

  const verificationStatusLabel =
    settings.domain_verification?.status === 'verified'
      ? 'Verified'
      : settings.domain_verification?.status === 'pending'
        ? 'Pending DNS setup'
        : 'Unverified';

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;

    try {
      setSaving(true);
      setError('');
      setMessage('');

      const response = await fetch('/api/seller/storefront-settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(settings),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to save storefront settings');
      }

      if (payload?.storefront?.domain_verification) {
        setSettings((current) => ({
          ...current,
          storefront_slug: payload.storefront.storefront_slug ?? current.storefront_slug,
          storefront_banner_url: payload.storefront.storefront_banner_url ?? current.storefront_banner_url,
          storefront_headline: payload.storefront.storefront_headline ?? current.storefront_headline,
          storefront_accent_color: payload.storefront.storefront_accent_color ?? current.storefront_accent_color,
          storefront_custom_domain: payload.storefront.storefront_custom_domain ?? current.storefront_custom_domain,
          storefront_published: Boolean(payload.storefront.storefront_published ?? current.storefront_published),
          domain_verification: payload.storefront.domain_verification,
        }));
      }

      if (user) {
        setUser({
          ...user,
          store_name: payload?.storefront?.store_name ?? settings.store_name,
          storefront_slug: payload?.storefront?.storefront_slug ?? settings.storefront_slug,
          storefront_banner_url: payload?.storefront?.storefront_banner_url ?? settings.storefront_banner_url,
          storefront_headline: payload?.storefront?.storefront_headline ?? settings.storefront_headline,
        });
      }

      toast.success('Storefront settings saved.');
      setMessage('Storefront settings saved successfully.');
    } catch (requestError: unknown) {
      const nextError = requestError instanceof Error ? requestError.message : 'Failed to save storefront settings';
      toast.error(nextError);
      setError(nextError);
    } finally {
      setSaving(false);
    }
  };

  const refreshVerificationToken = async () => {
    if (!token) return;

    try {
      setRefreshingToken(true);
      setError('');
      setMessage('');

      const response = await fetch('/api/storefront-domain/refresh', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to refresh verification token');
      }
      setSettings((current) => ({ ...current, domain_verification: payload.domain_verification }));
      toast.success('Verification token refreshed.');
      setMessage('Verification token refreshed. Update your DNS records if the token changed.');
    } catch (requestError: unknown) {
      const nextError = requestError instanceof Error ? requestError.message : 'Failed to refresh verification token';
      toast.error(nextError);
      setError(nextError);
    } finally {
      setRefreshingToken(false);
    }
  };

  const verifyDomainNow = async () => {
    if (!token) return;

    try {
      setVerifyingDomain(true);
      setError('');
      setMessage('');

      const response = await fetch('/api/storefront-domain/verify', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to verify custom domain');
      }
      setSettings((current) => ({ ...current, domain_verification: payload.domain_verification }));
      toast.success(payload?.success ? 'Custom domain verified.' : 'DNS checked. Finish both TXT and CNAME records to verify.');
      setMessage(payload?.success ? 'Custom domain verified successfully.' : 'DNS checked. Finish both TXT and CNAME records, then verify again.');
    } catch (requestError: unknown) {
      const nextError = requestError instanceof Error ? requestError.message : 'Failed to verify custom domain';
      toast.error(nextError);
      setError(nextError);
    } finally {
      setVerifyingDomain(false);
    }
  };

  if (loading) {
    return <CenteredLoader label="Loading seller storefront settings..." className="min-h-[240px]" />;
  }

  return (
    <section className="surface-card p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-primary">
            <Sparkles size={14} />
            Storefront
          </div>
          <h2 className="mt-4 text-2xl font-bold text-foreground">Your seller storefront</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Make your dashboard feel like your own shop. Publish a branded seller page with your banner, headline,
            product catalog, categories, and live flash sale items.
          </p>
        </div>

        <div className="surface-card-soft p-4 text-sm">
          <p className="font-semibold text-foreground">Public preview</p>
          <p className="mt-1 text-muted-foreground">{storefrontUrl || 'Set a storefront slug to generate your shop link.'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {storefrontUrl ? (
              <Link
                to={storefrontUrl}
                className="interactive-lift inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
              >
                <ExternalLink size={14} />
                Open storefront
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <form onSubmit={saveSettings} className="mt-8 space-y-8">
        {error ? <FormNotice tone="error">{error}</FormNotice> : null}
        {message ? <FormNotice tone="success">{message}</FormNotice> : null}
        {settings.seller_status !== 'approved' ? (
          <FormNotice tone="info">
            {settings.seller_status === 'rejected'
              ? `Your storefront is still locked for publishing. ${settings.rejection_reason || 'Update the required information and submit for review again.'}`
              : settings.seller_status === 'suspended'
                ? settings.suspension_reason || 'Your storefront is suspended right now. Contact an admin to restore live selling access.'
                : 'You can finish branding now, but storefront publishing stays locked until admin approves your seller account.'}
          </FormNotice>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Storefront slug</span>
            <input
              value={settings.storefront_slug}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  storefront_slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                }))
              }
              className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary"
              placeholder="dhaka-main-fashion"
            />
            <p className="text-xs text-muted-foreground">This becomes your public shop URL: `/store/your-slug`</p>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Accent color</span>
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3">
              <input
                type="color"
                value={settings.storefront_accent_color}
                onChange={(event) => setSettings((current) => ({ ...current, storefront_accent_color: event.target.value }))}
                className="h-10 w-12 rounded-lg border-0 bg-transparent p-0"
              />
              <input
                value={settings.storefront_accent_color}
                onChange={(event) => setSettings((current) => ({ ...current, storefront_accent_color: event.target.value }))}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                placeholder="#0F766E"
              />
            </div>
          </label>
        </div>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-foreground">Storefront headline</span>
          <input
            value={settings.storefront_headline}
            onChange={(event) => setSettings((current) => ({ ...current, storefront_headline: event.target.value }))}
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary"
            placeholder="Original fashion picks, fast Dhaka dispatch, and seller-direct support."
          />
        </label>

        <div className="space-y-3">
          <span className="text-sm font-semibold text-foreground">Storefront hero banner</span>
          <CloudinaryUpload
            label="Upload storefront banner"
            helper="Upload a wide brand banner for your public seller shop. Manual URL is optional below."
            onUploaded={(url) => setSettings((current) => ({ ...current, storefront_banner_url: url }))}
          />
          <input
            value={settings.storefront_banner_url}
            onChange={(event) => setSettings((current) => ({ ...current, storefront_banner_url: event.target.value }))}
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary"
            placeholder="https://..."
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Custom domain</span>
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3">
              <Globe size={16} className="text-muted-foreground" />
              <input
                value={settings.storefront_custom_domain}
                onChange={(event) => setSettings((current) => ({ ...current, storefront_custom_domain: event.target.value }))}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                placeholder="shop.yourbrand.com"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Save your custom domain now. Then add the TXT and CNAME records shown below so the domain can be verified and routed live.
            </p>
          </label>

          <label className="flex items-start gap-3 rounded-2xl border border-border bg-secondary/30 px-4 py-4">
            <input
              type="checkbox"
              checked={settings.storefront_published}
              onChange={(event) => setSettings((current) => ({ ...current, storefront_published: event.target.checked }))}
              disabled={settings.seller_status !== 'approved'}
              className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span>
              <span className="block text-sm font-semibold text-foreground">Publish storefront</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                When enabled, your public seller page will show only your products, seller categories, and approved flash sale items.
              </span>
            </span>
          </label>
        </div>

        <div className="rounded-2xl border border-dashed border-border bg-secondary/20 p-4 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">What your storefront already isolates</p>
          <ul className="mt-2 space-y-1">
            <li>Only your products</li>
            <li>Only categories derived from your products</li>
            <li>Only your approved live flash sale items</li>
            <li>Your banner, accent color, and custom headline</li>
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">Your seller shop already works on `/store/slug`. Custom domain is the final branding layer on top.</div>
          <button
            type="submit"
            disabled={saving || refreshingToken || verifyingDomain}
            className="interactive-lift inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : null}
            {saving ? 'Saving storefront...' : 'Save storefront settings'}
          </button>
        </div>

        {settings.domain_verification?.domain ? (
          <div className="rounded-3xl border border-border bg-secondary/20 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Domain verification</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Status: <span className="font-semibold uppercase text-slate-700">{verificationStatusLabel}</span>
                  {settings.domain_verification.verified_at ? ` | Verified ${new Date(settings.domain_verification.verified_at).toLocaleString()}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void refreshVerificationToken()}
                  disabled={refreshingToken || saving || verifyingDomain}
                  className="interactive-lift inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {refreshingToken ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  {refreshingToken ? 'Refreshing...' : 'Refresh token'}
                </button>
                <button
                  type="button"
                  onClick={() => void verifyDomainNow()}
                  disabled={verifyingDomain || saving || refreshingToken}
                  className="interactive-lift inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {verifyingDomain ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  {verifyingDomain ? 'Verifying...' : 'Verify now'}
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-dashed border-border bg-white/70 p-4 text-xs text-slate-600">
              <p className="font-semibold text-slate-900">How verification works</p>
              <ol className="mt-2 space-y-1">
                <li>1. Save your custom domain in this form.</li>
                <li>2. Add the TXT and CNAME records below in your DNS provider.</li>
                <li>3. Wait for DNS propagation, then press `Verify now`.</li>
                <li>4. After verification, root visits for that domain can resolve to this storefront.</li>
              </ol>
            </div>

            <div className="mt-4 grid gap-3">
              {settings.domain_verification.records.map((record) => (
                <div key={`${record.type}-${record.host}`} className="rounded-2xl border border-border bg-white px-4 py-3 text-xs text-slate-600">
                  <p className="font-semibold text-slate-900">{record.type} | {record.host}</p>
                  <p className="mt-1 break-all">{record.value}</p>
                  <p className="mt-1 text-slate-500">{record.note}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </form>
    </section>
  );
}

export default StorefrontSettingsPanel;
