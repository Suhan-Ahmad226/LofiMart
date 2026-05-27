import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, Copy, ExternalLink, Globe, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useUser } from '../../context/UserContext';
import CloudinaryUpload from '../media/CloudinaryUpload';
import { Link } from '@/src/lib/navigation';
import { CenteredLoader, FormNotice } from '../ui/FeedbackState';
import { copyText } from '../../lib/browser-actions';

type ResellerStorefrontSettings = {
  store_name: string;
  bio: string;
  storefront_code: string;
  storefront_banner_url: string;
  storefront_headline: string;
  storefront_accent_color: string;
  storefront_custom_domain: string;
  storefront_published: boolean;
  domain_verification?: {
    domain: string | null;
    status: string;
    token: string | null;
    verified_at: string | null;
    records: Array<{ type: string; host: string; value: string; note: string }>;
  };
};

const initialSettings: ResellerStorefrontSettings = {
  store_name: '',
  bio: '',
  storefront_code: '',
  storefront_banner_url: '',
  storefront_headline: '',
  storefront_accent_color: '#0F766E',
  storefront_custom_domain: '',
  storefront_published: true,
  domain_verification: {
    domain: null,
    status: 'unverified',
    token: null,
    verified_at: null,
    records: [],
  },
};

export function ResellerStorefrontSettingsPanel() {
  const { token } = useUser();
  const [settings, setSettings] = useState<ResellerStorefrontSettings>(initialSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingToken, setRefreshingToken] = useState(false);
  const [verifyingDomain, setVerifyingDomain] = useState(false);
  const [copyingLink, setCopyingLink] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;

    let mounted = true;
    setLoading(true);
    setError('');
    setMessage('');

    fetch('/api/reseller/storefront-settings', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(payload?.error || 'Failed to load reseller storefront settings');
        }
        if (!mounted) return;
        setSettings({
          store_name: payload.store_name || '',
          bio: payload.bio || '',
          storefront_code: payload.storefront_code || '',
          storefront_banner_url: payload.storefront_banner_url || '',
          storefront_headline: payload.storefront_headline || '',
          storefront_accent_color: payload.storefront_accent_color || '#0F766E',
          storefront_custom_domain: payload.storefront_custom_domain || '',
          storefront_published: Boolean(payload.storefront_published ?? true),
          domain_verification: payload.domain_verification || initialSettings.domain_verification,
        });
      })
      .catch((requestError: unknown) => {
        const nextError = requestError instanceof Error ? requestError.message : 'Failed to load reseller storefront settings';
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

  const storefrontUrl = settings.storefront_code ? `/r/${settings.storefront_code}` : '';

  const verificationStatusLabel =
    settings.domain_verification?.status === 'verified'
      ? 'Verified'
      : settings.domain_verification?.status === 'pending'
        ? 'Pending DNS setup'
        : 'Unverified';

  const copyLink = async () => {
    if (typeof window === 'undefined' || !settings.storefront_code) return;

    try {
      setCopyingLink(true);
      setError('');
      setMessage('');
      const url = `${window.location.origin}/r/${settings.storefront_code}`;
      const copied = await copyText(url);
      if (!copied) {
        throw new Error('Could not copy the reseller storefront link on this device.');
      }
      toast.success('Reseller storefront link copied.');
      setMessage('Reseller storefront link copied successfully.');
    } catch (requestError: unknown) {
      const nextError =
        requestError instanceof Error
          ? requestError.message
          : 'Could not copy the reseller storefront link on this device.';
      toast.error(nextError);
      setError(nextError);
    } finally {
      setCopyingLink(false);
    }
  };

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;

    try {
      setSaving(true);
      setError('');
      setMessage('');

      const response = await fetch('/api/reseller/storefront-settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(settings),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to save reseller storefront settings');
      }

      if (payload?.storefront?.domain_verification) {
        setSettings((current) => ({ ...current, domain_verification: payload.storefront.domain_verification }));
      }

      toast.success('Reseller storefront settings saved.');
      setMessage('Reseller storefront settings saved successfully.');
    } catch (requestError: unknown) {
      const nextError = requestError instanceof Error ? requestError.message : 'Failed to save reseller storefront settings';
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
    return <CenteredLoader label="Loading reseller storefront settings..." className="min-h-[240px]" />;
  }

  return (
    <section className="surface-card p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-primary">
            <Sparkles size={14} />
            Reseller storefront
          </div>
          <h2 className="mt-4 text-2xl font-bold text-foreground">Your branded reseller page</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Turn your reseller dashboard into your own mini-store. Brand your public referral storefront and show only
            your curated reseller catalog and selling prices.
          </p>
        </div>

        <div className="surface-card-soft p-4 text-sm">
          <p className="font-semibold text-foreground">Public preview</p>
          <p className="mt-1 text-muted-foreground">{storefrontUrl || 'Referral code is being prepared.'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {storefrontUrl ? (
              <>
                <Link
                  to={storefrontUrl}
                  className="interactive-lift inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                >
                  <ExternalLink size={14} />
                  Open storefront
                </Link>
                <button
                  type="button"
                  onClick={() => void copyLink()}
                  disabled={copyingLink}
                  className="interactive-lift inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {copyingLink ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
                  {copyingLink ? 'Copying...' : 'Copy link'}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <form onSubmit={saveSettings} className="mt-8 space-y-8">
        {error ? <FormNotice tone="error">{error}</FormNotice> : null}
        {message ? <FormNotice tone="success">{message}</FormNotice> : null}

        <label className="space-y-2">
          <span className="text-sm font-semibold text-foreground">Storefront headline</span>
          <input
            value={settings.storefront_headline}
            onChange={(event) => setSettings((current) => ({ ...current, storefront_headline: event.target.value }))}
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary"
            placeholder="Curated deals, cash collection support, and fast reseller follow-up."
          />
        </label>

        <div className="space-y-3">
          <span className="text-sm font-semibold text-foreground">Storefront hero banner</span>
          <CloudinaryUpload
            label="Upload reseller banner"
            helper="Upload a storefront banner so your referral shop feels like your own website."
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

          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Custom domain</span>
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3">
              <Globe size={16} className="text-muted-foreground" />
              <input
                value={settings.storefront_custom_domain}
                onChange={(event) => setSettings((current) => ({ ...current, storefront_custom_domain: event.target.value }))}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                placeholder="share.yourbrand.com"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Save your reseller domain now. Then add the TXT and CNAME records below so it can be verified and routed to your branded storefront.
            </p>
          </label>
        </div>

        <label className="flex items-start gap-3 rounded-2xl border border-border bg-secondary/30 px-4 py-4">
          <input
            type="checkbox"
            checked={settings.storefront_published}
            onChange={(event) => setSettings((current) => ({ ...current, storefront_published: event.target.checked }))}
            className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <span>
            <span className="block text-sm font-semibold text-foreground">Publish reseller storefront</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              When enabled, your `/r/code` page shows only your curated reseller catalog and your own resale prices.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">Your reseller page already works on `/r/code`. Custom domain gives it a more independent storefront feel.</div>
          <button
            type="submit"
            disabled={saving || refreshingToken || verifyingDomain || copyingLink}
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
                <li>1. Save your reseller custom domain here.</li>
                <li>2. Add the TXT and CNAME records below in your DNS provider.</li>
                <li>3. Wait for DNS propagation, then press `Verify now`.</li>
                <li>4. After verification, root visits for that domain can resolve to your reseller storefront.</li>
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

export default ResellerStorefrontSettingsPanel;
