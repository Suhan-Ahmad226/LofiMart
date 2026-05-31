import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowDownRight, ArrowUpRight, Coins, Gift, History, Loader2, RotateCcw, Trophy, Users, Wallet } from 'lucide-react';
import { motion } from 'framer-motion';
import { useUser } from '@/src/context/UserContext';
import { formatPrice } from '@/src/lib/utils';
import { Link } from '@/src/lib/navigation';
import toast from 'react-hot-toast';
import { EmptyState } from '@/src/components/ui/FeedbackState';

type WalletTransaction = {
  id: string;
  type: string;
  amount: number;
  currency: string;
  source: string;
  description: string;
  created_at: string;
  metadata?: {
    orderId?: string;
    requestId?: string;
    refundMode?: string;
  } | null;
};

type EngagementOverview = {
  points: number;
  wallet_balance: number;
  streak: {
    current_streak: number;
    longest_streak: number;
    total_claimed_coins: number;
  };
  referral: {
    code: string;
    successful_referrals: number;
  } | null;
  missions: Array<{
    id: string;
    progress: number;
    claimed_at?: string | null;
    mission: {
      id: string;
      title: string;
      description: string;
      target_count: number;
      reward_coins: number;
    };
  }>;
  spin_rewards: Array<{
    id: string;
    label: string;
    reward_type: string;
    reward_value: number;
  }>;
  last_spin: {
    reward_label: string;
  } | null;
};

function getTransactionLabel(transaction: WalletTransaction) {
  if (transaction.source === 'return_refund') {
    return 'Return refund credited';
  }

  if (transaction.source === 'cashback') {
    return 'Cashback credited';
  }

  return transaction.description;
}

function getTransactionSubcopy(transaction: WalletTransaction) {
  if (transaction.source === 'return_refund') {
    const orderId = transaction.metadata?.orderId;
    return orderId
      ? `Refund from order ${orderId}`
      : 'Refund credited after return approval';
  }

  return transaction.source.replace(/_/g, ' ');
}

export const CustomerWalletPage = () => {
  const { token } = useUser();
  const [loading, setLoading] = useState(true);
  const [rewardsLoading, setRewardsLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [points, setPoints] = useState(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [overview, setOverview] = useState<EngagementOverview | null>(null);
  const [spinLoading, setSpinLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setRewardsLoading(false);
      setBalance(0);
      setPoints(0);
      setTransactions([]);
      setOverview(null);
      return;
    }

    fetch('/api/user/wallet', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to load wallet');
        }
        return data;
      })
      .then((data) => {
        setBalance(Number(data.wallet_balance ?? 0));
        setPoints(Number(data.points ?? 0));
        setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
        setError('');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load wallet');
        setBalance(0);
        setPoints(0);
        setTransactions([]);
      })
      .finally(() => setLoading(false));

    fetch('/api/user/engagement/overview', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error('Failed to load rewards');
        }
        return res.json();
      })
      .then((data) => setOverview(data))
      .catch(() => {
        setOverview(null);
      })
      .finally(() => setRewardsLoading(false));
  }, [token]);

  const loadRewardsOverview = React.useCallback(() => {
    if (!token) return;
    setRewardsLoading(true);
    fetch('/api/user/engagement/overview', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error('Failed to load rewards');
        }
        return res.json();
      })
      .then((data) => setOverview(data))
      .catch(() => {
        setOverview(null);
      })
      .finally(() => setRewardsLoading(false));
  }, [token]);

  const spinNow = async () => {
    if (!token) return;
    setSpinLoading(true);
    const response = await fetch('/api/user/spin-wheel/spin', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    setSpinLoading(false);

    if (!response.ok) {
      toast.error(data.error || 'Unable to collect your daily reward right now.');
      return;
    }

    toast.success(
      data.already_spun
        ? 'Your daily member reward has already been used today.'
        : `Today's reward added: ${data.reward?.label || data.history?.reward_label}`,
    );
    loadRewardsOverview();
  };

  const claimMission = async (missionId: string) => {
    if (!token) return;
    const response = await fetch(`/api/user/missions/${missionId}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();

    if (!response.ok) {
      toast.error(data.error || 'Mission claim failed');
      return;
    }

    toast.success('Mission reward added to your account.');
    loadRewardsOverview();
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  const rewardStats = overview
    ? [
        { label: 'Reward coins', value: overview.points.toLocaleString(), icon: <Coins className="h-5 w-5" /> },
        { label: 'Current streak', value: `${overview.streak.current_streak} days`, icon: <RotateCcw className="h-5 w-5" /> },
        { label: 'Referrals', value: `${overview.referral?.successful_referrals ?? 0}`, icon: <Users className="h-5 w-5" /> },
        { label: 'Last bonus', value: overview.last_spin?.reward_label ?? 'Not collected today', icon: <Gift className="h-5 w-5" /> },
      ]
    : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Wallet and Rewards</h1>
        <p className="text-gray-500">Track cashback, refunds, loyalty balance, and reward coin activity from one place.</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl bg-slate-950 p-8 text-white shadow-xl"
        >
          <div className="mb-8 flex items-center justify-between">
            <div className="rounded-2xl bg-white/10 p-3">
              <Wallet className="h-6 w-6" />
            </div>
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200">
              Production wallet
            </span>
          </div>
          <p className="text-sm text-slate-300">Available balance</p>
          <h2 className="mt-2 text-4xl font-bold">{formatPrice(balance)}</h2>
          <p className="mt-4 text-sm text-slate-300">
            Cashback, wallet refunds, manual credits, and surprise rewards are credited here automatically.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="rounded-3xl border border-gray-100 bg-white p-8 shadow-sm"
        >
          <div className="mb-8 flex items-center justify-between">
            <div className="rounded-2xl bg-amber-50 p-3 text-amber-600">
              <Coins className="h-6 w-6" />
            </div>
            <span className="text-sm font-semibold text-primary">1 coin = loyalty value</span>
          </div>
          <p className="text-sm text-gray-500">Reward coins</p>
          <h2 className="mt-2 text-4xl font-bold text-gray-950">{points.toLocaleString()}</h2>
          <p className="mt-4 text-sm text-gray-500">
            Coins come from signup, streaks, spin wheel, referral bonuses, and completed mission rewards.
          </p>
        </motion.div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-gray-400" />
            <h3 className="font-bold">Recent wallet activity</h3>
          </div>
          <span className="text-xs uppercase tracking-[0.2em] text-gray-400">Live data</span>
        </div>
        <div className="divide-y divide-gray-100">
          {transactions.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-gray-500">No wallet activity yet.</div>
          ) : (
            transactions.map((transaction) => {
              const isCredit = transaction.type === 'credit';
              const refundOrderId = transaction.metadata?.orderId;
              return (
                <div key={transaction.id} className="flex items-center justify-between px-6 py-5">
                  <div className="flex items-center gap-4">
                    <div className={`rounded-2xl p-3 ${isCredit ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                      {isCredit ? <ArrowDownRight className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{getTransactionLabel(transaction)}</p>
                      <p className="text-sm text-gray-500">
                        {getTransactionSubcopy(transaction)} - {new Date(transaction.created_at).toLocaleString()}
                      </p>
                      {refundOrderId ? (
                        <div className="mt-2">
                          <Link
                            to={`/account/orders/${refundOrderId}`}
                            className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                          >
                            View refunded order
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className={`font-bold ${isCredit ? 'text-emerald-600' : 'text-red-600'}`}>
                    {isCredit ? '+' : '-'}{formatPrice(transaction.amount)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Rewards inside your wallet</h2>
          <p className="text-gray-500">Daily bonuses, streaks, referrals, and mission rewards now live in the same wallet workspace.</p>
        </div>

        {rewardsLoading ? (
          <div className="flex min-h-[220px] items-center justify-center rounded-3xl border border-gray-100 bg-white shadow-sm">
            <Loader2 className="animate-spin text-primary" size={28} />
          </div>
        ) : overview ? (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {rewardStats.map((stat) => (
                <div key={stat.label} className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                  <div className="mb-4 inline-flex rounded-2xl bg-slate-100 p-3 text-slate-700">{stat.icon}</div>
                  <p className="text-sm text-gray-500">{stat.label}</p>
                  <p className="mt-1 text-2xl font-bold">{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold">Daily member reward</h3>
                    <p className="text-sm text-gray-500">Collect one small loyalty bonus each day with clear, useful rewards.</p>
                  </div>
                  <button
                    onClick={spinNow}
                    disabled={spinLoading}
                    className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                  >
                    {spinLoading ? 'Collecting...' : 'Collect today'}
                  </button>
                </div>
                {overview.spin_rewards.length ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {overview.spin_rewards.map((reward) => (
                      <div key={reward.id} className="rounded-2xl border border-gray-100 bg-slate-50 p-4">
                        <p className="font-semibold text-gray-900">{reward.label}</p>
                        <p className="mt-1 text-sm text-gray-500">{reward.reward_type.replace(/_/g, ' ')}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    className="border border-dashed border-slate-200 bg-slate-50/70 py-10"
                    title="Daily rewards are being prepared"
                    description="Your member bonus options will appear here once the live reward pool is configured."
                    tone="soft"
                  />
                )}
              </div>

              <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-center gap-3">
                  <div className="rounded-2xl bg-amber-50 p-3 text-amber-600">
                    <Trophy className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Referral code</h3>
                    <p className="text-sm text-gray-500">Share a trusted invite link so both accounts can receive a simple loyalty bonus.</p>
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-950 px-5 py-4 text-white">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Your code</p>
                  <p className="mt-2 text-2xl font-bold">{overview.referral?.code ?? 'Loading...'}</p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-center gap-3">
                <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
                  <Gift className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Mission rewards</h3>
                  <p className="text-sm text-gray-500">Complete useful account and shopping milestones to unlock clear loyalty rewards.</p>
                </div>
              </div>
              <div className="space-y-4">
                {overview.missions.map((row) => {
                  const completed = row.progress >= row.mission.target_count;
                  const claimed = Boolean(row.claimed_at);
                  return (
                    <div key={row.id} className="rounded-2xl border border-gray-100 p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="font-semibold text-gray-900">{row.mission.title}</p>
                          <p className="mt-1 text-sm text-gray-500">{row.mission.description}</p>
                          <p className="mt-2 text-sm text-gray-700">
                            Progress: {row.progress}/{row.mission.target_count} - Reward: {row.mission.reward_coins} coins
                          </p>
                        </div>
                        <button
                          onClick={() => claimMission(row.mission.id)}
                          disabled={!completed || claimed}
                          className="rounded-2xl border border-gray-200 px-4 py-2 text-sm font-semibold transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {claimed ? 'Claimed' : completed ? 'Claim reward' : 'In progress'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            className="border border-dashed border-slate-200 bg-slate-50/70 py-12"
            title="Rewards are not ready yet"
            description="Wallet is available, but your rewards overview could not be loaded right now."
            tone="soft"
          />
        )}
      </div>
    </div>
  );
};
