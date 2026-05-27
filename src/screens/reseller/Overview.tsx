import React, { useEffect, useState } from 'react';
import { DollarSign, Loader2, Share2, ShoppingBag, TrendingUp, Users, Zap } from 'lucide-react';
import { useUser } from '../../context/UserContext';
import { formatPrice } from '../../lib/utils';
import { Link } from '@/src/lib/navigation';

type ResellerStatCard = {
  label: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
};

export const ResellerOverview = () => {
  const { token, user } = useUser();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ResellerStatCard[]>([]);
  const [error, setError] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [referralClicks, setReferralClicks] = useState(0);
  const [onboarding, setOnboarding] = useState<any>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        if (!token) {
          setError('Please log in as a reseller to see live stats.');
          setLoading(false);
          return;
        }

        const response = await fetch('/api/reseller/stats', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(data?.error || 'Unable to load reseller stats.');
        }

        setReferralCode(data.referralCode || '');
        setReferralClicks(Number(data.referralClicks || 0));
        setStats([
          { label: 'Total Earnings', value: formatPrice(data.totalEarnings), helper: 'Paid commissions cleared', icon: <DollarSign className="text-primary" /> },
          { label: 'Pending Earnings', value: formatPrice(data.pendingEarnings || 0), helper: 'Awaiting settlement', icon: <TrendingUp className="text-accent" /> },
          { label: 'Products Shared', value: String(data.productsShared || 0), helper: 'Catalog items promoted', icon: <Share2 className="text-primary" /> },
          { label: 'Successful Referrals', value: String(data.successfulReferrals || 0), helper: 'Orders completed from your links', icon: <Users className="text-accent" /> },
          { label: 'Conversion Rate', value: data.conversionRate || '0%', helper: 'Referral orders vs link clicks', icon: <Zap className="text-primary" /> },
        ]);
        setError('');

        const onboardingResponse = await fetch('/api/reseller/onboarding-status', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (onboardingResponse.ok) {
          const onboardingPayload = await onboardingResponse.json().catch(() => null);
          setOnboarding(onboardingPayload);
        } else {
          setOnboarding(null);
        }
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : 'Unable to load live stats.');
        setStats([]);
        setReferralCode('');
        setReferralClicks(0);
        setOnboarding(null);
      } finally {
        setLoading(false);
      }
    };

    void fetchStats();
  }, [token]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-border bg-[linear-gradient(135deg,rgba(255,76,76,0.08),rgba(40,167,69,0.08))] p-8 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Reseller Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {user?.name}. Here&apos;s what&apos;s happening with your network.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-accent/20 bg-accent/10 p-4 text-sm text-accent">
          {error}
        </div>
      )}

      {onboarding && Number(onboarding.summary?.progress_percent || 0) < 100 ? (
        <div className="rounded-3xl border border-border bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-fuchsia-600/80">Reseller onboarding</p>
              <h2 className="mt-2 text-xl font-bold">Complete the setup that makes your reseller shop earn-ready</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {onboarding.summary?.completed_steps || 0}/{onboarding.summary?.total_steps || 0} onboarding steps complete.
                {onboarding.next_step?.title ? ` Next: ${onboarding.next_step.title}.` : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl bg-secondary/60 px-4 py-3 text-sm">
                <span className="font-bold text-foreground">{onboarding.summary?.progress_percent || 0}%</span>{' '}
                <span className="text-muted-foreground">complete</span>
              </div>
              <Link
                to={onboarding.next_step?.action_path || '/reseller-dashboard/onboarding'}
                className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Continue setup
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <div key={stat.label} className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-2xl bg-secondary p-3">{stat.icon}</div>
              <div className="rounded-lg bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
                Live
              </div>
            </div>
            <p className="mb-1 text-sm text-muted-foreground">{stat.label}</p>
            <h3 className="text-2xl font-bold">{stat.value}</h3>
            <p className="mt-2 text-xs text-muted-foreground">{stat.helper}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="rounded-3xl border border-border bg-card p-8 shadow-sm">
          <h3 className="mb-6 text-lg font-bold">Referral Summary</h3>
          <div className="space-y-6">
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ShoppingBag size={20} />
                </div>
                <div>
                  <p className="text-sm font-bold">Referral code</p>
                  <p className="text-xs text-muted-foreground">{referralCode || 'Code will appear after activation'}</p>
                </div>
              </div>
              <p className="text-sm font-bold text-primary">{referralCode || '-'}</p>
            </div>

            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <p className="text-sm font-bold">Referral clicks</p>
                  <p className="text-xs text-muted-foreground">Tracked from your shared links</p>
                </div>
              </div>
              <p className="text-sm font-bold text-primary">{referralClicks}</p>
            </div>

            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Users size={20} />
                </div>
                <div>
                  <p className="text-sm font-bold">Network health</p>
                  <p className="text-xs text-muted-foreground">Based on active referrals and shared catalog coverage</p>
                </div>
              </div>
              <p className="text-sm font-bold text-primary">{stats.find((item) => item.label === 'Successful Referrals')?.value || '0'}</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-8 shadow-sm">
          <h3 className="mb-6 text-lg font-bold">Performance Snapshot</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {stats.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground md:col-span-2">
                Live reseller performance will appear here once data is available.
              </div>
            ) : (
              stats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-border bg-background/70 p-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                  <p className="mt-2 text-xl font-bold">{stat.value}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
