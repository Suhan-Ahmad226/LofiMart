import React, { useEffect, useState } from 'react';
import { Coins, Gift, Loader2, RotateCcw, Settings2 } from 'lucide-react';
import toast from '@/lib/toast';
import { EmptyState, FormNotice } from '@/features/shared/ui/FeedbackState';
import { useUser } from '../../../features/shared/state/UserContext';

type ConfigResponse = {
  settings: {
    tenant_id?: string;
    signup_bonus_coins: number;
    daily_login_base_coins: number;
    daily_login_max_coins: number;
    referral_inviter_coins: number;
    referral_invitee_coins: number;
    order_cashback_bps: number;
    surprise_reward_chance: number;
    free_shipping_threshold: number;
    spin_enabled: boolean;
    spin_daily_limit: number;
  } | null;
  spin_rewards: Array<{
    id: string;
    label: string;
    reward_type: string;
    reward_value: number;
    probability: number;
  }>;
};

type ConfigFormState = {
  tenant_id: string;
  signup_bonus_coins: number;
  daily_login_base_coins: number;
  daily_login_max_coins: number;
  referral_inviter_coins: number;
  referral_invitee_coins: number;
  order_cashback_bps: number;
  surprise_reward_chance_percent: number;
  free_shipping_threshold: number;
  spin_enabled: boolean;
  spin_daily_limit: number;
};

type SpinRewardFormState = {
  label: string;
  reward_type: 'coins' | 'discount' | 'free_shipping' | 'wallet_credit';
  reward_value: number;
  probability_percent: number;
  display_order: number;
  is_active: boolean;
};

const defaultFormState: ConfigFormState = {
  tenant_id: '',
  signup_bonus_coins: 100,
  daily_login_base_coins: 10,
  daily_login_max_coins: 70,
  referral_inviter_coins: 150,
  referral_invitee_coins: 100,
  order_cashback_bps: 200,
  surprise_reward_chance_percent: 15,
  free_shipping_threshold: 2500,
  spin_enabled: true,
  spin_daily_limit: 1,
};

const defaultSpinRewardForm: SpinRewardFormState = {
  label: '',
  reward_type: 'coins',
  reward_value: 0,
  probability_percent: 10,
  display_order: 0,
  is_active: true,
};

function buildFormState(settings: ConfigResponse['settings']): ConfigFormState {
  if (!settings) {
    return defaultFormState;
  }

  return {
    tenant_id: settings.tenant_id ?? '',
    signup_bonus_coins: settings.signup_bonus_coins ?? 100,
    daily_login_base_coins: settings.daily_login_base_coins ?? 10,
    daily_login_max_coins: settings.daily_login_max_coins ?? 70,
    referral_inviter_coins: settings.referral_inviter_coins ?? 150,
    referral_invitee_coins: settings.referral_invitee_coins ?? 100,
    order_cashback_bps: settings.order_cashback_bps ?? 200,
    surprise_reward_chance_percent: Math.round((settings.surprise_reward_chance ?? 0.15) * 100),
    free_shipping_threshold: settings.free_shipping_threshold ?? 2500,
    spin_enabled: settings.spin_enabled ?? true,
    spin_daily_limit: settings.spin_daily_limit ?? 1,
  };
}

export const AdminGamificationPage = () => {
  const { token } = useUser();
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [analytics, setAnalytics] = useState<Record<string, number> | null>(null);
  const [form, setForm] = useState<ConfigFormState>(defaultFormState);
  const [saving, setSaving] = useState(false);
  const [creatingReward, setCreatingReward] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [spinRewardForm, setSpinRewardForm] = useState<SpinRewardFormState>(defaultSpinRewardForm);

  useEffect(() => {
    if (!token) {
      return;
    }

    setLoading(true);

    Promise.all([
      fetch('/api/admin/gamification/config', {
        headers: { Authorization: `Bearer ${token}` },
      }).then(async (res) => {
        if (!res.ok) {
          throw new Error('Failed to load gamification configuration');
        }
        return res.json();
      }),
      fetch('/api/admin/gamification/analytics', {
        headers: { Authorization: `Bearer ${token}` },
      }).then(async (res) => {
        if (!res.ok) {
          throw new Error('Failed to load gamification analytics');
        }
        return res.json();
      }),
    ])
      .then(([configData, analyticsData]) => {
        setConfig(configData);
        setAnalytics(analyticsData);
        setForm(buildFormState(configData.settings));
        setError('');
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load gamification controls');
      })
      .finally(() => setLoading(false));
  }, [token]);

  const updateNumberField = (field: keyof ConfigFormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.target.value;
    setForm((current) => ({
      ...current,
      [field]: rawValue === '' ? 0 : Number(rawValue),
    }));
  };

  const saveConfig = async () => {
    if (!token) {
      toast.error('Admin session missing. Please sign in again.');
      return;
    }

    if (!form.tenant_id) {
      setError('A tenant workspace is required before updating gamification rules.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    const response = await fetch('/api/admin/gamification/config', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tenant_id: form.tenant_id,
        signup_bonus_coins: form.signup_bonus_coins,
        daily_login_base_coins: form.daily_login_base_coins,
        daily_login_max_coins: form.daily_login_max_coins,
        referral_inviter_coins: form.referral_inviter_coins,
        referral_invitee_coins: form.referral_invitee_coins,
        order_cashback_bps: form.order_cashback_bps,
        surprise_reward_chance: form.surprise_reward_chance_percent / 100,
        free_shipping_threshold: form.free_shipping_threshold,
        spin_enabled: form.spin_enabled,
        spin_daily_limit: form.spin_daily_limit,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(data.error || 'Failed to save gamification settings');
      setSaving(false);
      return;
    }

    setConfig((current) => ({
      settings: data.settings,
      spin_rewards: current?.spin_rewards ?? [],
    }));
    setForm(buildFormState(data.settings));
    setMessage('Gamification rules updated successfully.');
    setSaving(false);
  };

  const createSpinReward = async () => {
    if (!token) {
      toast.error('Admin session missing. Please sign in again.');
      return;
    }

    if (!form.tenant_id) {
      setError('A tenant workspace is required before adding spin rewards.');
      return;
    }

    if (!spinRewardForm.label.trim()) {
      setError('Reward label is required.');
      return;
    }

    setCreatingReward(true);
    setError('');
    setMessage('');

    const response = await fetch('/api/admin/gamification/spin-rewards', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tenant_id: form.tenant_id,
        label: spinRewardForm.label,
        reward_type: spinRewardForm.reward_type,
        reward_value: spinRewardForm.reward_value,
        probability: spinRewardForm.probability_percent / 100,
        display_order: spinRewardForm.display_order,
        is_active: spinRewardForm.is_active,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(data.error || 'Failed to add spin reward');
      setCreatingReward(false);
      return;
    }

    setConfig((current) => ({
      settings: current?.settings ?? null,
      spin_rewards: [...(current?.spin_rewards ?? []), data.reward],
    }));
    setSpinRewardForm(defaultSpinRewardForm);
    setMessage('Spin reward added successfully.');
    setCreatingReward(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  const statCards = [
    { label: 'Coins issued', value: analytics?.total_coins_issued ?? 0, icon: <Coins className="h-5 w-5" /> },
    { label: 'Wallet volume', value: analytics?.wallet_volume ?? 0, icon: <Gift className="h-5 w-5" /> },
    { label: 'Successful referrals', value: analytics?.successful_referrals ?? 0, icon: <RotateCcw className="h-5 w-5" /> },
    { label: 'Total spins', value: analytics?.total_spins ?? 0, icon: <Settings2 className="h-5 w-5" /> },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gamification Control</h1>
          <p className="text-gray-500">Production-safe loyalty controls, daily member rewards, and engagement analytics for operators.</p>
        </div>
        <button
          onClick={saveConfig}
          disabled={saving}
          className="rounded-2xl border border-gray-200 px-4 py-2 text-sm font-semibold hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </div>

      {error ? <FormNotice tone="error">{error}</FormNotice> : null}
      {message ? <FormNotice tone="success">{message}</FormNotice> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4 inline-flex rounded-2xl bg-slate-100 p-3 text-slate-700">{stat.icon}</div>
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className="mt-1 text-2xl font-bold">{Number(stat.value).toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">Current reward policy</h2>
          <div className="mt-5 space-y-4 text-sm text-gray-700">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <span>Signup bonus</span>
              <span className="font-semibold">{config?.settings?.signup_bonus_coins ?? 0} coins</span>
            </div>
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <span>Daily login base</span>
              <span className="font-semibold">{config?.settings?.daily_login_base_coins ?? 0} coins</span>
            </div>
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <span>Referral inviter bonus</span>
              <span className="font-semibold">{config?.settings?.referral_inviter_coins ?? 0} coins</span>
            </div>
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <span>Referral invitee bonus</span>
              <span className="font-semibold">{config?.settings?.referral_invitee_coins ?? 0} coins</span>
            </div>
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <span>Order cashback</span>
              <span className="font-semibold">{((config?.settings?.order_cashback_bps ?? 0) / 100).toFixed(2)}%</span>
            </div>
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <span>Surprise reward chance</span>
              <span className="font-semibold">{Math.round((config?.settings?.surprise_reward_chance ?? 0) * 100)}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Daily reward access</span>
              <span className="font-semibold">
                {config?.settings?.spin_enabled ? `Enabled - ${config?.settings?.spin_daily_limit ?? 0}/day` : 'Disabled'}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">Live controls</h2>
              <p className="mt-1 text-sm text-gray-500">Update loyalty rules without touching code, while keeping member-facing rewards clear and reviewable.</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-3 py-2 text-right text-xs text-slate-500">
              <p className="font-semibold text-slate-700">Tenant</p>
              <p className="mt-1 break-all">{form.tenant_id || 'Not linked'}</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Signup bonus coins</span>
              <input value={form.signup_bonus_coins} onChange={updateNumberField('signup_bonus_coins')} type="number" min={0} className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Daily login base coins</span>
              <input value={form.daily_login_base_coins} onChange={updateNumberField('daily_login_base_coins')} type="number" min={0} className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Daily login max coins</span>
              <input value={form.daily_login_max_coins} onChange={updateNumberField('daily_login_max_coins')} type="number" min={0} className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Order cashback (bps)</span>
              <input value={form.order_cashback_bps} onChange={updateNumberField('order_cashback_bps')} type="number" min={0} className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Referral inviter bonus</span>
              <input value={form.referral_inviter_coins} onChange={updateNumberField('referral_inviter_coins')} type="number" min={0} className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Referral invitee bonus</span>
              <input value={form.referral_invitee_coins} onChange={updateNumberField('referral_invitee_coins')} type="number" min={0} className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Surprise reward chance (%)</span>
              <input value={form.surprise_reward_chance_percent} onChange={updateNumberField('surprise_reward_chance_percent')} type="number" min={0} max={100} className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Free shipping threshold</span>
              <input value={form.free_shipping_threshold} onChange={updateNumberField('free_shipping_threshold')} type="number" min={0} className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Spin daily limit</span>
              <input value={form.spin_daily_limit} onChange={updateNumberField('spin_daily_limit')} type="number" min={0} max={20} className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" />
            </label>
            <label className="flex items-center justify-between rounded-2xl border border-gray-200 px-4 py-3 text-sm font-medium text-slate-700">
              <span>Spin wheel enabled</span>
              <input checked={form.spin_enabled} onChange={(event) => setForm((current) => ({ ...current, spin_enabled: event.target.checked }))} type="checkbox" className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary/20" />
            </label>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Daily reward options</h2>
        {config?.spin_rewards.length ? (
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {config.spin_rewards.map((reward) => (
              <div key={reward.id} className="rounded-2xl border border-gray-100 bg-slate-50 p-4">
                <p className="font-semibold text-gray-900">{reward.label}</p>
                <p className="mt-1 text-sm text-gray-500">
                  {reward.reward_type.replace(/_/g, ' ')} - Probability {(reward.probability * 100).toFixed(0)}%
                </p>
                <p className="mt-2 text-sm font-medium text-gray-700">Value: {reward.reward_value}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            className="mt-5 border border-dashed border-slate-200 bg-slate-50/70 py-10"
            title="No daily rewards configured yet"
            description="Add at least one active reward so customers see a clear daily member perk instead of an empty reward area."
            tone="soft"
          />
        )}

        <div className="mt-6 rounded-2xl border border-gray-100 bg-slate-50 p-5">
          <div className="mb-4">
            <h3 className="text-base font-bold text-slate-900">Add daily reward option</h3>
            <p className="mt-1 text-sm text-slate-500">Create clear, low-friction member perks directly from the admin dashboard.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-2 text-sm font-medium text-slate-700 xl:col-span-2">
              <span>Reward label</span>
              <input
                value={spinRewardForm.label}
                onChange={(event) => setSpinRewardForm((current) => ({ ...current, label: event.target.value }))}
                type="text"
                placeholder="Daily 50 coins"
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Reward type</span>
              <select
                value={spinRewardForm.reward_type}
                onChange={(event) =>
                  setSpinRewardForm((current) => ({
                    ...current,
                    reward_type: event.target.value as SpinRewardFormState['reward_type'],
                  }))
                }
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
              >
                <option value="coins">Coins</option>
                <option value="discount">Discount</option>
                <option value="free_shipping">Free shipping</option>
                <option value="wallet_credit">Wallet credit</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Reward value</span>
              <input
                value={spinRewardForm.reward_value}
                onChange={(event) => setSpinRewardForm((current) => ({ ...current, reward_value: Number(event.target.value || 0) }))}
                type="number"
                min={0}
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Probability (%)</span>
              <input
                value={spinRewardForm.probability_percent}
                onChange={(event) => setSpinRewardForm((current) => ({ ...current, probability_percent: Number(event.target.value || 0) }))}
                type="number"
                min={0}
                max={100}
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Display order</span>
              <input
                value={spinRewardForm.display_order}
                onChange={(event) => setSpinRewardForm((current) => ({ ...current, display_order: Number(event.target.value || 0) }))}
                type="number"
                min={0}
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
            </label>
            <label className="flex items-center justify-between rounded-2xl border border-gray-200 px-4 py-3 text-sm font-medium text-slate-700">
              <span>Reward active</span>
              <input
                checked={spinRewardForm.is_active}
                onChange={(event) => setSpinRewardForm((current) => ({ ...current, is_active: event.target.checked }))}
                type="checkbox"
                className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary/20"
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={createSpinReward}
              disabled={creatingReward}
              className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creatingReward ? 'Adding reward...' : 'Add reward'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
