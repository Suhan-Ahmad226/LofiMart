import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Bot, CheckCircle2, Facebook, Loader2, RefreshCw, Settings2, Unplug, X, Zap } from 'lucide-react';
import { Link, useSearchParams } from '@/lib/navigation';
import { useRouter } from 'next/navigation';
import { useUser } from '@/features/shared/state/UserContext';
import { SellerEmptyState, SellerPageHeader, SellerStatCard } from '@/features/seller/components/SellerPageHeader';
import { ListCardSkeleton } from '@/features/shared/ui/DataSkeletons';
import { SocialAutomationNav } from '@/features/social-automation/components/SocialAutomationNav';
import toast from '@/lib/toast';

type DashboardPayload = {
  account: {
    id: string | null;
    account_name: string | null;
    connected: boolean;
    status: string;
  };
  summary: {
    published: number;
    scheduled: number;
    active_automations: number;
    failed: number;
  };
  settings: SocialSettings;
  active_automations: Array<{
    id: string;
    product_name: string | null;
    schedule_label: string;
    next_run_at: string;
    status: string;
  }>;
  recent_activity: Array<{
    id: string;
    product_name: string | null;
    status: string;
    scheduled_at: string | null;
    created_at: string;
    error_message: string | null;
  }>;
  facebook_publishing_configured: boolean;
  ai_caption_configured: boolean;
};

type SocialSettings = {
  language: string;
  tone: string;
  caption_length: string;
  hashtags: string;
  cta_enabled: boolean;
  ai_caption_enabled: boolean;
  default_interval_days: number;
  default_posting_time: string;
  default_duration_mode: 'forever' | 'number_of_posts' | 'until_date';
  default_max_posts: number | null;
  default_end_at: string | null;
  generate_new_caption_every_time: boolean;
  use_latest_product_data: boolean;
  skip_out_of_stock: boolean;
};

const intervalOptions = [1, 2, 3, 4, 5] as const;

function isApiErrorPayload(value: unknown): value is { error: string } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'error' in value &&
      typeof (value as { error?: unknown }).error === 'string',
  );
}

function isDashboardPayload(value: unknown): value is DashboardPayload {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'account' in value &&
      'settings' in value &&
      'summary' in value,
  );
}

function isSocialSettings(value: unknown): value is SocialSettings {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'language' in value &&
      'default_interval_days' in value &&
      'skip_out_of_stock' in value,
  );
}

function formatDateTime(value: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-BD', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function toInputDate(value: string | null) {
  return value ? value.slice(0, 10) : '';
}

type PendingPage = { id: string; name: string };

function oauthErrorMessage(message: string) {
  if (message === 'facebook_authorization_cancelled') return 'Facebook authorization was cancelled.';
  if (message === 'invalid_or_expired_state') return 'The OAuth session has expired. Please try again.';
  if (message === 'no_facebook_pages_found') return 'No Facebook Pages were found for this account.';
  if (message === 'facebook_oauth_failed') return 'Facebook connection failed. Please try again.';
  return 'Facebook connection failed. Please try again.';
}

function FacebookPageSelectModal({
  pages,
  connecting,
  error,
  onSelect,
  onCancel,
}: {
  pages: PendingPage[];
  connecting: string | null;
  error: string;
  onSelect: (pageId: string) => void;
  onCancel: () => void;
}) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="page-select-title" className="fixed inset-0 z-50">
      <button type="button" aria-label="Close page selection" onClick={onCancel} className="absolute inset-0 bg-slate-950/45" />
      <div className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl md:inset-y-6 md:left-auto md:right-6 md:w-[26rem] md:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
          <h2 id="page-select-title" className="text-lg font-black text-slate-950">Connect Facebook Page</h2>
          <button type="button" onClick={onCancel} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <p className="text-sm font-semibold text-slate-700">Select a Page</p>
          {error ? (
            <div className="flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
              <AlertCircle size={18} />
              {error}
            </div>
          ) : null}
          {pages.length === 0 ? (
            <SellerEmptyState message="No Facebook Pages are available for this account." />
          ) : (
            pages.map((page) => (
              <div key={page.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1877f2] text-white">
                    <Facebook size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-950">{page.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">Facebook Page</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onSelect(page.id)}
                  disabled={connecting !== null}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {connecting === page.id ? <Loader2 size={15} className="animate-spin" /> : null}
                  <span>{connecting === page.id ? 'Connecting' : 'Select'}</span>
                </button>
              </div>
            ))
          )}
        </div>

        <div className="sticky bottom-0 flex justify-end border-t border-slate-100 bg-white p-5">
          <button type="button" onClick={onCancel} disabled={connecting !== null} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function SocialAutomationDashboard() {
  const { token } = useUser();
  const [searchParams] = useSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'settings'>('overview');
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [settings, setSettings] = useState<SocialSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [oauthMessage, setOauthMessage] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [pendingOAuthState, setPendingOAuthState] = useState<string | null>(null);
  const [pendingPages, setPendingPages] = useState<PendingPage[]>([]);
  const [pageSelectError, setPageSelectError] = useState('');
  const [connectingPage, setConnectingPage] = useState<string | null>(null);

  const loadPendingPages = useCallback(async (state: string) => {
    if (!token) return;
    try {
      const response = await fetch(`/api/social-automation/accounts/oauth/pages?state=${encodeURIComponent(state)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await response.json().catch(() => null)) as { pages?: PendingPage[]; error?: string } | null;
      if (!response.ok) {
        setPageSelectError(data?.error || 'Could not load Facebook Pages.');
        setPendingPages([]);
        return;
      }
      setPendingPages(data?.pages ?? []);
      setPageSelectError('');
    } catch {
      setPageSelectError('Could not load Facebook Pages.');
      setPendingPages([]);
    }
  }, [token]);

  const handleSelectPage = async (pageId: string) => {
    if (!token || !pendingOAuthState) return;
    setConnectingPage(pageId);
    setPageSelectError('');
    try {
      const response = await fetch('/api/social-automation/accounts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ state: pendingOAuthState, pageId }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setPageSelectError(data?.error || 'Could not connect the Facebook Page.');
        return;
      }
      setPendingOAuthState(null);
      setPendingPages([]);
      toast.success('Facebook Page connected.');
      void loadDashboard();
    } catch {
      setPageSelectError('Could not connect the Facebook Page.');
    } finally {
      setConnectingPage(null);
    }
  };

  const closePageSelect = () => {
    if (connectingPage) return;
    setPendingOAuthState(null);
    setPendingPages([]);
    setPageSelectError('');
    if (pendingOAuthState) {
      void fetch('/api/social-automation/accounts/oauth/cancel', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ state: pendingOAuthState }),
      }).catch(() => undefined);
      setPendingOAuthState(null);
    }
  };

  useEffect(() => {
    const oauth = searchParams.get('oauth');
    const msg = searchParams.get('message');
    if (oauth === 'select_page') {
      const state = searchParams.get('state');
      setOauthMessage(null);
      setOauthError(null);
      if (state) {
        setPendingOAuthState(state);
        void loadPendingPages(state);
      }
      void router.replace('/seller/social-automation');
    } else if (oauth === 'success') {
      setOauthMessage('Facebook Page connected successfully!');
      setOauthError(null);
      void router.replace('/seller/social-automation');
    } else if (oauth === 'error' && msg) {
      setOauthError(oauthErrorMessage(msg));
      setOauthMessage(null);
      void router.replace('/seller/social-automation');
    }
  }, [searchParams, router, loadPendingPages]);

  const handleConnect = async () => {
    if (!token) return;
    try {
      const response = await fetch('/api/social-automation/accounts/oauth', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await response.json().catch(() => null)) as { authUrl?: string; error?: string } | null;
      if (!response.ok || !data?.authUrl) {
        toast.error(data?.error || 'Failed to start OAuth.');
        return;
      }
      window.location.href = data.authUrl;
    } catch {
      toast.error('Failed to start OAuth.');
    }
  };

  const handleDisconnect = async () => {
    if (!token || !payload?.account?.id) return;
    try {
      const response = await fetch(`/api/social-automation/accounts/${payload.account.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        toast.error(data?.error || 'Failed to disconnect.');
        return;
      }
      toast.success('Facebook Page disconnected.');
      void loadDashboard();
    } catch {
      toast.error('Failed to disconnect.');
    }
  };

  const loadDashboard = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/social-automation', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await response.json().catch(() => null)) as unknown;
      if (!response.ok || !isDashboardPayload(data)) {
        throw new Error(isApiErrorPayload(data) ? data.error : 'Failed to load social automation.');
      }
      setPayload(data);
      setSettings(data.settings);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Failed to load social automation.';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (searchParams.get('settings') === '1') setActiveTab('settings');
  }, [searchParams]);

  const saveSettings = async () => {
    if (!token || !settings) return;
    setSaving(true);

    try {
      const response = await fetch('/api/social-automation/settings', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          language: settings.language,
          tone: settings.tone,
          captionLength: settings.caption_length,
          hashtags: settings.hashtags,
          ctaEnabled: settings.cta_enabled,
          aiCaptionEnabled: settings.ai_caption_enabled,
          defaultIntervalDays: settings.default_interval_days,
          defaultPostingTime: settings.default_posting_time,
          defaultDurationMode: settings.default_duration_mode,
          defaultMaxPosts: settings.default_max_posts,
          defaultEndAt: settings.default_end_at,
          generateNewCaptionEveryTime: settings.generate_new_caption_every_time,
          useLatestProductData: settings.use_latest_product_data,
          skipOutOfStock: settings.skip_out_of_stock,
        }),
      });
      const data = (await response.json().catch(() => null)) as unknown;
      if (!response.ok || !isSocialSettings(data)) {
        throw new Error(isApiErrorPayload(data) ? data.error : 'Failed to save settings.');
      }
      setSettings(data);
      setPayload((current) => (current ? { ...current, settings: data } : current));
      toast.success('Social automation settings saved.');
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = <Key extends keyof SocialSettings>(key: Key, value: SocialSettings[Key]) => {
    setSettings((current) => (current ? { ...current, [key]: value } : current));
  };

  const stats = useMemo(
    () => [
      { label: 'Published', value: payload?.summary.published ?? 0, tone: 'success' as const },
      { label: 'Scheduled', value: payload?.summary.scheduled ?? 0, tone: 'default' as const },
      { label: 'Active Automations', value: payload?.summary.active_automations ?? 0, tone: 'success' as const },
      { label: 'Failed', value: payload?.summary.failed ?? 0, tone: 'critical' as const },
    ],
    [payload],
  );

  return (
    <div className="space-y-6">
      <SellerPageHeader
        eyebrow="Facebook automation"
        title="Social Automation"
        description="Automate your product promotion across social channels."
        actions={
          <Link to="/seller/social-automation/products" className="btn-primary inline-flex h-11 items-center gap-2">
            <Zap size={18} />
            <span>Post Products</span>
          </Link>
        }
      />

      <SocialAutomationNav active="overview" />


      {error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          <AlertCircle size={18} />
          {error}
        </div>
      ) : null}

      {!payload || payload.facebook_publishing_configured ? null : (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          <AlertCircle size={18} />
          Facebook publishing is not configured. Ask an administrator to set Facebook environment variables.
        </div>
      )}

      {loading ? (
        <ListCardSkeleton rows={5} />
      ) : activeTab === 'overview' && payload ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1877f2] text-white">
                  <Facebook size={24} />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-950">Facebook Page</p>
                  <p className="mt-1 text-sm text-slate-500">{payload.account.account_name || 'Connect your Facebook Page'}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                  payload.account.status === 'CONNECTED' ? 'bg-emerald-50 text-emerald-700' : payload.account.status === 'EXPIRED' ? 'bg-amber-50 text-amber-700' : payload.account.status === 'ERROR' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
                }`}>
                  {payload.account.status === 'CONNECTED' ? <CheckCircle2 size={14} /> : <Unplug size={14} />}
                  {payload.account.status === 'CONNECTED' ? 'Connected' : payload.account.status === 'EXPIRED' ? 'Expired' : payload.account.status === 'ERROR' ? 'Error' : 'Disconnected'}
                </span>
                {payload.account.status === 'CONNECTED' ? (
                  <button type="button" onClick={handleDisconnect} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">
                    Disconnect
                  </button>
                ) : (
                  <button type="button" onClick={handleConnect} className="h-10 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800">
                    Connect Facebook
                  </button>
                )}
              </div>
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <SellerStatCard key={stat.label} label={stat.label} value={stat.value} tone={stat.tone} />
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <section className="rounded-2xl border border-black/5 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-5">
                <h2 className="text-lg font-bold text-slate-950">Active Automations</h2>
              </div>
              <div className="overflow-x-auto">
                {payload.active_automations.length === 0 ? (
                  <div className="p-5">
                    <SellerEmptyState message="No active automations yet." />
                  </div>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-5 py-3">Product</th>
                        <th className="px-5 py-3">Schedule</th>
                        <th className="px-5 py-3">Next Run</th>
                        <th className="px-5 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {payload.active_automations.map((automation) => (
                        <tr key={automation.id}>
                          <td className="px-5 py-4 font-semibold text-slate-900">{automation.product_name}</td>
                          <td className="px-5 py-4 text-slate-600">{automation.schedule_label}</td>
                          <td className="px-5 py-4 text-slate-600">{formatDateTime(automation.next_run_at)}</td>
                          <td className="px-5 py-4">
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{automation.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-950">Recent Activity</h2>
              <div className="mt-4 space-y-3">
                {payload.recent_activity.length === 0 ? (
                  <SellerEmptyState message="No social posts have been scheduled yet." />
                ) : (
                  payload.recent_activity.map((activity) => (
                    <div key={activity.id} className="flex gap-3 rounded-xl border border-slate-100 p-3">
                      <span className={`mt-1 h-2.5 w-2.5 rounded-full ${
                        activity.status === 'FAILED' ? 'bg-rose-500' : activity.status === 'PUBLISHED' ? 'bg-emerald-500' : 'bg-blue-500'
                      }`} />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{activity.product_name || 'Product'} {activity.status.toLowerCase()}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatDateTime(activity.scheduled_at || activity.created_at)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      ) : settings ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
          <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
              <Facebook size={19} />
              Facebook Connection
            </h2>
            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="font-bold text-slate-950">{payload?.account.account_name || 'Facebook Page'}</p>
              <p className="mt-1 text-sm text-slate-500">
                {payload?.account.status === 'CONNECTED'
                  ? 'Connected. Posts will be published to this Page.'
                  : payload?.account.status === 'EXPIRED'
                    ? 'The Facebook connection has expired. Reconnect to publish.'
                    : payload?.account.status === 'ERROR'
                      ? 'The Facebook connection has an error. Reconnect to publish.'
                      : 'Connect your Facebook Page to start publishing products.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={handleConnect} className="h-10 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800">
                  {payload?.account.status === 'CONNECTED' ? 'Reconnect' : 'Connect Facebook'}
                </button>
                {payload?.account.status === 'CONNECTED' ? (
                  <button type="button" onClick={handleDisconnect} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">
                    Disconnect
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          <section className="space-y-6 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
                <Settings2 size={19} />
                Settings
              </h2>
              <button
                type="button"
                onClick={saveSettings}
                disabled={saving}
                className="btn-primary inline-flex h-10 items-center gap-2 px-4 disabled:opacity-60"
              >
                <RefreshCw size={16} className={saving ? 'animate-spin' : ''} />
                <span>{saving ? 'Saving' : 'Save'}</span>
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm font-semibold text-slate-700">
                <span>Language</span>
                <select value={settings.language} onChange={(event) => updateSetting('language', event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3">
                  <option>Bangla + English</option>
                  <option>Bangla</option>
                  <option>English</option>
                </select>
              </label>
              <label className="space-y-2 text-sm font-semibold text-slate-700">
                <span>Tone</span>
                <select value={settings.tone} onChange={(event) => updateSetting('tone', event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3">
                  <option>Friendly</option>
                  <option>Premium</option>
                  <option>Urgent</option>
                </select>
              </label>
              <label className="space-y-2 text-sm font-semibold text-slate-700">
                <span>Caption Length</span>
                <select value={settings.caption_length} onChange={(event) => updateSetting('caption_length', event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3">
                  <option>Short</option>
                  <option>Medium</option>
                  <option>Long</option>
                </select>
              </label>
              <label className="space-y-2 text-sm font-semibold text-slate-700">
                <span>Hashtags</span>
                <select value={settings.hashtags} onChange={(event) => updateSetting('hashtags', event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3">
                  <option>Automatic</option>
                  <option>Disabled</option>
                </select>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="space-y-2 text-sm font-semibold text-slate-700">
                <span>Default Interval</span>
                <select value={settings.default_interval_days} onChange={(event) => updateSetting('default_interval_days', Number(event.target.value))} className="h-11 w-full rounded-xl border border-slate-200 px-3">
                  {intervalOptions.map((value) => <option key={value} value={value}>{value} Day{value === 1 ? '' : 's'}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm font-semibold text-slate-700">
                <span>Default Posting Time</span>
                <input type="time" value={settings.default_posting_time} onChange={(event) => updateSetting('default_posting_time', event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3" />
              </label>
              <label className="space-y-2 text-sm font-semibold text-slate-700">
                <span>Default Duration</span>
                <select value={settings.default_duration_mode} onChange={(event) => updateSetting('default_duration_mode', event.target.value as SocialSettings['default_duration_mode'])} className="h-11 w-full rounded-xl border border-slate-200 px-3">
                  <option value="forever">Forever</option>
                  <option value="number_of_posts">Number of Posts</option>
                  <option value="until_date">Until Date</option>
                </select>
              </label>
            </div>

            {settings.default_duration_mode === 'number_of_posts' ? (
              <input type="number" min={1} max={365} value={settings.default_max_posts ?? 1} onChange={(event) => updateSetting('default_max_posts', Number(event.target.value))} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" />
            ) : null}
            {settings.default_duration_mode === 'until_date' ? (
              <input type="date" value={toInputDate(settings.default_end_at)} onChange={(event) => updateSetting('default_end_at', event.target.value ? new Date(`${event.target.value}T00:00:00`).toISOString() : null)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" />
            ) : null}

            <div className="grid gap-3 text-sm font-semibold text-slate-700 sm:grid-cols-2">
              {[
                ['ai_caption_enabled', 'AI caption generation enabled'],
                ['cta_enabled', 'CTA enabled'],
                ['generate_new_caption_every_time', 'Generate new AI caption every time'],
                ['use_latest_product_data', 'Use latest product price/details'],
                ['skip_out_of_stock', 'Skip if product is out of stock'],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                  <input
                    type="checkbox"
                    checked={Boolean(settings[key as keyof SocialSettings])}
                    onChange={(event) => updateSetting(key as keyof SocialSettings, event.target.checked as never)}
                    className="h-4 w-4"
                  />
                  {label}
                </label>
              ))}
            </div>

            {!payload?.ai_caption_configured ? (
              <div className="flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
                <Bot size={18} />
                AI generation is waiting for provider configuration.
              </div>
            ) : null}
            {oauthMessage ? (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-700">
                <CheckCircle2 size={18} />
                {oauthMessage}
              </div>
            ) : null}
            {oauthError ? (
              <div className="flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">
                <AlertCircle size={18} />
                {oauthError}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {pendingOAuthState ? (
        <FacebookPageSelectModal
          pages={pendingPages}
          connecting={connectingPage}
          error={pageSelectError}
          onSelect={handleSelectPage}
          onCancel={closePageSelect}
        />
      ) : null}
    </div>
  );
}
