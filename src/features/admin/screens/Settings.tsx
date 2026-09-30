import React, { useEffect, useState } from 'react';
import { Bell, Globe, Loader2, Save, Shield, Truck } from 'lucide-react';
import toast from '@/lib/toast';
import { useNavigate } from '../../../lib/navigation';
import {
  AVAILABLE_CHECKOUT_PAYMENT_METHODS,
  AVAILABLE_COURIER_PROVIDERS,
  AVAILABLE_MANUAL_ORDER_PAYMENT_METHODS,
} from '../../../lib/commerce-channels';
import { useUser } from '../../../features/shared/state/UserContext';
import { CenteredLoader, FormNotice } from '@/features/shared/ui/FeedbackState';

type SettingsState = {
  platform_name: string;
  support_email: string;
  commission_rate: string;
  currency: string;
  require2fa: string;
  autoApproveSellers: string;
  exit_intent_enabled: string;
  exit_intent_title: string;
  exit_intent_message: string;
  exit_intent_code: string;
  exit_intent_primary_cta: string;
  exit_intent_secondary_cta: string;
  enabled_checkout_payment_methods: string;
  enabled_manual_order_payment_methods: string;
  enabled_courier_providers: string;
};

type IntegrationStatusItem = {
  key: string;
  label: string;
  status: 'ready' | 'partial' | 'sandbox' | 'missing';
  value: string;
  description: string;
};

const defaultSettings: SettingsState = {
  platform_name: 'LofiMart',
  support_email: 'support@lofimart.com',
  commission_rate: '12',
  currency: 'BDT',
  require2fa: 'true',
  autoApproveSellers: 'false',
  exit_intent_enabled: 'true',
  exit_intent_title: 'Keep your shortlist moving with a softer first order',
  exit_intent_message: 'Use code',
  exit_intent_code: 'WELCOME10',
  exit_intent_primary_cta: 'Review cart',
  exit_intent_secondary_cta: 'Keep browsing',
  enabled_checkout_payment_methods: 'cod',
  enabled_manual_order_payment_methods: 'cod',
  enabled_courier_providers: 'pathao',
};

const checkoutPaymentLabels: Record<string, string> = {
  cod: 'Cash on delivery',
  bkash: 'bKash',
  bank: 'Bank transfer',
  gateway: 'Online gateway',
};

const manualPaymentLabels: Record<string, string> = {
  cod: 'Cash on delivery',
  cash: 'Cash paid',
  bkash: 'bKash paid',
  nagad: 'Nagad paid',
  bank_transfer: 'Bank transfer',
};

const courierLabels: Record<string, string> = {
  pathao: 'Pathao',
};

export const AdminSettingsPage = () => {
  const { token, logout } = useUser();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [adminCurrentPassword, setAdminCurrentPassword] = useState('');
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminPasswordLoading, setAdminPasswordLoading] = useState(false);
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [courierProviders, setCourierProviders] = useState<Array<{
    code: string;
    name: string;
    mode: 'manual' | 'api';
    enabled?: boolean;
    setupStatus?: 'manual_ready' | 'api_ready' | 'missing_config';
    setupMessage?: string;
    brandColor?: string;
    shortLabel?: string;
  }>>([]);
  const [integrationStatus, setIntegrationStatus] = useState<{
    updatedAt: string;
    items: IntegrationStatusItem[];
    summary: {
      ready: number;
      partial: number;
      sandbox: number;
      missing: number;
    };
  } | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const parseCsvSetting = (value: string) =>
    String(value || '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);

  const toggleCsvSetting = (key: keyof SettingsState, entry: string, checked: boolean) => {
    setSettings((current) => {
      const values = new Set(parseCsvSetting(current[key]));
      if (checked) values.add(entry);
      else values.delete(entry);
      return {
        ...current,
        [key]: Array.from(values).join(','),
      };
    });
  };

  useEffect(() => {
    if (!token) {
      return;
    }

    fetch('/api/admin/settings', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to fetch settings');
        }
        return data;
      })
      .then((data) => {
        setSettings({
          ...defaultSettings,
          ...data,
        });
        setError('');
        setMessage('');
      })
      .catch((err) => {
        setSettings(defaultSettings);
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      })
      .finally(() => setFetching(false));
  }, [token]);

  useEffect(() => {
    fetch('/api/logistics/providers?includeDisabled=true', {
      cache: 'no-store',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((response) => response.json())
      .then((data) => {
        setCourierProviders(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        setCourierProviders([]);
      });
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    fetch('/api/admin/integrations/status', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load integration status');
        }
        return payload;
      })
      .then((payload) => {
        setIntegrationStatus(payload);
      })
      .catch(() => {
        setIntegrationStatus(null);
      });
  }, [token]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      setError('');
      setMessage('');
      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(settings),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to save settings');
      }

      toast.success('System settings updated successfully.');
      setMessage('System settings updated successfully.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update settings';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleAdminPasswordChange = async () => {
    if (!adminCurrentPassword || !adminNewPassword) {
      setError('Enter both your current and new password.');
      return;
    }
    if (adminNewPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    setAdminPasswordLoading(true);
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: adminCurrentPassword, newPassword: adminNewPassword }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to update password');
      toast.success('Password updated. Please sign in again with your new password.');
      logout();
      navigate('/login?notice=password_changed', { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update password';
      setError(msg);
      toast.error(msg);
    } finally {
      setAdminPasswordLoading(false);
    }
  };

  if (fetching) {
    return <CenteredLoader label="Loading system settings..." className="min-h-[240px]" />;
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">System Settings</h1>

      {error ? <FormNotice tone="error">{error}</FormNotice> : null}
      {message ? <FormNotice tone="success">{message}</FormNotice> : null}

      <form onSubmit={handleSave} className="divide-y divide-gray-100 rounded-2xl border border-black/5 bg-white shadow-sm">
        <div className="space-y-6 p-8">
          <h3 className="flex items-center space-x-2 text-lg font-bold">
            <Globe size={20} className="text-primary" />
            <span>General Configuration</span>
          </h3>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Platform Name</label>
              <input
                type="text"
                value={settings.platform_name}
                onChange={(e) => setSettings({ ...settings, platform_name: e.target.value })}
                className="w-full rounded-xl border-none bg-bg-light px-4 py-3 focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Support Email</label>
              <input
                type="email"
                value={settings.support_email}
                onChange={(e) => setSettings({ ...settings, support_email: e.target.value })}
                className="w-full rounded-xl border-none bg-bg-light px-4 py-3 focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Seller Commission (%)</label>
              <input
                type="number"
                value={settings.commission_rate}
                onChange={(e) => setSettings({ ...settings, commission_rate: e.target.value })}
                className="w-full rounded-xl border-none bg-bg-light px-4 py-3 focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Currency Symbol</label>
              <input
                type="text"
                value={settings.currency}
                onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                className="w-full rounded-xl border-none bg-bg-light px-4 py-3 focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
        </div>

        <div className="space-y-6 p-8">
          <h3 className="flex items-center space-x-2 text-lg font-bold">
            <Shield size={20} className="text-primary" />
            <span>Security & Access</span>
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-bg-light p-4">
              <div>
                <p className="text-sm font-bold">Two-Factor Authentication</p>
                <p className="text-xs text-gray-500">Require 2FA for all admin accounts</p>
              </div>
              <input
                type="checkbox"
                checked={settings.require2fa === 'true'}
                onChange={(e) => setSettings((current) => ({ ...current, require2fa: String(e.target.checked) }))}
                className="rounded text-primary focus:ring-primary"
              />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-bg-light p-4">
              <div>
                <p className="text-sm font-bold">New Seller Auto-Approval</p>
                <p className="text-xs text-gray-500">Automatically approve new seller registrations</p>
              </div>
              <input
                type="checkbox"
                checked={settings.autoApproveSellers === 'true'}
                onChange={(e) => setSettings((current) => ({ ...current, autoApproveSellers: String(e.target.checked) }))}
                className="rounded text-primary focus:ring-primary"
              />
            </div>
            <div className="rounded-xl border border-dashed border-gray-200 bg-white p-4 space-y-3">
              <div>
                <p className="text-sm font-bold text-gray-900">Change your admin password</p>
                <p className="text-xs text-gray-500">Updates your own admin account password. All other sessions (including this one) will be signed out automatically.</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  id="admin-current-password"
                  name="adminCurrentPassword"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Current password"
                  value={adminCurrentPassword}
                  onChange={(e) => setAdminCurrentPassword(e.target.value)}
                  className="rounded-xl border-none bg-bg-light px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20"
                />
                <input
                  id="admin-new-password"
                  name="adminNewPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="New password"
                  value={adminNewPassword}
                  onChange={(e) => setAdminNewPassword(e.target.value)}
                  className="rounded-xl border-none bg-bg-light px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleAdminPasswordChange()}
                disabled={adminPasswordLoading}
                className="btn-primary inline-flex items-center space-x-2 px-5 py-2 text-sm"
              >
                {adminPasswordLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Shield size={16} />
                )}
                <span>{adminPasswordLoading ? 'Updating...' : 'Update password'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6 p-8">
          <h3 className="flex items-center space-x-2 text-lg font-bold">
            <Truck size={20} className="text-primary" />
            <span>Checkout, Payment & Courier Controls</span>
          </h3>
          <div className="grid gap-6 xl:grid-cols-3">
            <div className="rounded-2xl border border-gray-100 bg-bg-light p-5">
              <h4 className="text-sm font-bold text-gray-900">Customer checkout payments</h4>
              <p className="mt-1 text-xs text-gray-500">Enable only the payment methods you want customers to see at checkout.</p>
              <div className="mt-4 space-y-3">
                {AVAILABLE_CHECKOUT_PAYMENT_METHODS.map((method) => (
                  <label key={method} className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-sm text-gray-700">
                    <span>{checkoutPaymentLabels[method] || method}</span>
                    <input
                      type="checkbox"
                      checked={parseCsvSetting(settings.enabled_checkout_payment_methods).includes(method)}
                      onChange={(event) => toggleCsvSetting('enabled_checkout_payment_methods', method, event.target.checked)}
                      className="rounded text-primary focus:ring-primary"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-bg-light p-5">
              <h4 className="text-sm font-bold text-gray-900">Manual order payments</h4>
              <p className="mt-1 text-xs text-gray-500">Control which payment labels seller and reseller teams can use for manual orders.</p>
              <div className="mt-4 space-y-3">
                {AVAILABLE_MANUAL_ORDER_PAYMENT_METHODS.map((method) => (
                  <label key={method} className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-sm text-gray-700">
                    <span>{manualPaymentLabels[method] || method}</span>
                    <input
                      type="checkbox"
                      checked={parseCsvSetting(settings.enabled_manual_order_payment_methods).includes(method)}
                      onChange={(event) => toggleCsvSetting('enabled_manual_order_payment_methods', method, event.target.checked)}
                      className="rounded text-primary focus:ring-primary"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-bg-light p-5">
              <h4 className="text-sm font-bold text-gray-900">Courier providers</h4>
              <p className="mt-1 text-xs text-gray-500">Turn couriers on or off without code changes. Seller courier tools will follow this list.</p>
              <div className="mt-4 space-y-3">
                {AVAILABLE_COURIER_PROVIDERS.map((providerCode) => {
                  const provider = courierProviders.find((item) => item.code === providerCode);
                  return (
                    <label key={providerCode} className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-sm text-gray-700">
                      <div>
                        <div>{courierLabels[providerCode] || providerCode}</div>
                        <div className="mt-1 text-[11px] text-gray-500">
                          {provider?.setupMessage || 'Enable this courier when its booking and operational flow is ready.'}
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={parseCsvSetting(settings.enabled_courier_providers).includes(providerCode)}
                        onChange={(event) => toggleCsvSetting('enabled_courier_providers', providerCode, event.target.checked)}
                        className="rounded text-primary focus:ring-primary"
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6 p-8">
          <h3 className="flex items-center space-x-2 text-lg font-bold">
            <Truck size={20} className="text-primary" />
            <span>Courier Provider Readiness</span>
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {courierProviders.length === 0 ? (
              <div className="rounded-xl bg-bg-light p-4 text-sm text-gray-500 md:col-span-2">
                Courier provider registry is not available right now.
              </div>
            ) : (
              courierProviders.map((provider) => (
                <div key={provider.code} className="rounded-xl border border-gray-100 bg-bg-light p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-xl text-xs font-black text-white shadow-sm"
                        style={{ backgroundColor: provider.brandColor || '#0f172a' }}
                      >
                        {provider.shortLabel || provider.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">{provider.name}</p>
                        <p className="mt-1 text-xs uppercase tracking-wide text-gray-400">{provider.code}</p>
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                        provider.setupStatus === 'api_ready'
                          ? 'bg-emerald-100 text-emerald-800'
                          : provider.setupStatus === 'missing_config'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {provider.setupStatus === 'api_ready'
                        ? 'API Ready'
                        : provider.setupStatus === 'missing_config'
                          ? 'Config Needed'
                          : 'Manual Ready'}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-gray-600">
                    {provider.setupMessage || 'This provider is available for shipment operations.'}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-6 p-8">
          <h3 className="flex items-center space-x-2 text-lg font-bold">
            <Bell size={20} className="text-primary" />
            <span>Integration Readiness</span>
          </h3>
          {integrationStatus ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {[
                  { label: 'Ready', value: integrationStatus.summary.ready, tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                  { label: 'Partial', value: integrationStatus.summary.partial, tone: 'bg-amber-50 text-amber-700 border-amber-200' },
                  { label: 'Sandbox', value: integrationStatus.summary.sandbox, tone: 'bg-sky-50 text-sky-700 border-sky-200' },
                  { label: 'Missing', value: integrationStatus.summary.missing, tone: 'bg-rose-50 text-rose-700 border-rose-200' },
                ].map((entry) => (
                  <div key={entry.label} className={`rounded-xl border p-4 ${entry.tone}`}>
                    <p className="text-xs font-bold uppercase tracking-wider">{entry.label}</p>
                    <p className="mt-2 text-2xl font-bold">{entry.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {integrationStatus.items.map((item) => (
                  <div key={item.key} className="rounded-xl border border-gray-100 bg-bg-light p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-bold text-gray-900">{item.label}</p>
                        <p className="mt-1 text-xs uppercase tracking-wide text-gray-400">{item.value}</p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                          item.status === 'ready'
                            ? 'bg-emerald-100 text-emerald-800'
                            : item.status === 'partial'
                              ? 'bg-amber-100 text-amber-800'
                              : item.status === 'sandbox'
                                ? 'bg-sky-100 text-sky-800'
                                : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-gray-600">{item.description}</p>
                  </div>
                ))}
              </div>

              <p className="text-xs text-gray-500">
                Last checked {new Date(integrationStatus.updatedAt).toLocaleString()}.
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-bg-light p-4 text-sm text-gray-500">
              Integration diagnostics are not available right now.
            </div>
          )}
        </div>

        <div className="space-y-6 p-8">
          <h3 className="flex items-center space-x-2 text-lg font-bold">
            <Bell size={20} className="text-primary" />
            <span>Exit Intent Offer</span>
          </h3>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Offer Status</label>
              <select
                value={settings.exit_intent_enabled}
                onChange={(e) => setSettings({ ...settings, exit_intent_enabled: e.target.value })}
                className="w-full rounded-xl border-none bg-bg-light px-4 py-3 focus:ring-2 focus:ring-primary/20"
              >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Offer Code</label>
              <input
                type="text"
                value={settings.exit_intent_code}
                onChange={(e) => setSettings({ ...settings, exit_intent_code: e.target.value.toUpperCase() })}
                className="w-full rounded-xl border-none bg-bg-light px-4 py-3 focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-gray-700">Headline</label>
              <input
                type="text"
                value={settings.exit_intent_title}
                onChange={(e) => setSettings({ ...settings, exit_intent_title: e.target.value })}
                className="w-full rounded-xl border-none bg-bg-light px-4 py-3 focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-gray-700">Message Prefix</label>
              <textarea
                value={settings.exit_intent_message}
                onChange={(e) => setSettings({ ...settings, exit_intent_message: e.target.value })}
                className="h-24 w-full rounded-xl border-none bg-bg-light px-4 py-3 focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Primary CTA</label>
              <input
                type="text"
                value={settings.exit_intent_primary_cta}
                onChange={(e) => setSettings({ ...settings, exit_intent_primary_cta: e.target.value })}
                className="w-full rounded-xl border-none bg-bg-light px-4 py-3 focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Secondary CTA</label>
              <input
                type="text"
                value={settings.exit_intent_secondary_cta}
                onChange={(e) => setSettings({ ...settings, exit_intent_secondary_cta: e.target.value })}
                className="w-full rounded-xl border-none bg-bg-light px-4 py-3 focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end p-8">
          <button type="submit" disabled={loading} className="btn-primary flex items-center space-x-2 px-8 py-3">
            {loading ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
            <span>{loading ? 'Saving changes...' : 'Save All Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
