import React from 'react';
import { Award, Lock, Star, TrendingUp, Zap } from 'lucide-react';
import { useNavigate } from '../../../lib/navigation';
import NotificationContainer, { useNotification } from '../../../components/animations/NotificationContainer';

const LoyaltyRewards: React.FC = () => {
  const navigate = useNavigate();
  const { notifications, removeNotification, success, info } = useNotification();

  const redeemCoupon = () => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(
        'amarshop_rewards_redemption',
        JSON.stringify({
          tier: 'gold',
          points: 4820,
          savedAt: new Date().toISOString(),
          source: 'bazaar-loyalty-rewards',
        }),
      );
    }
    success('Your reward redemption reminder has been saved for this session. Review it from your rewards dashboard before checkout.', 3500);
  };

  const features = [
    {
      title: '2x Points',
      desc: 'Earn double points this week on featured orders and selected collections.',
      icon: Zap,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      title: 'Exclusive Access',
      desc: 'Unlock early access to seasonal drops and members-only sales windows.',
      icon: Lock,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
    {
      title: 'Referral Boost',
      desc: 'Invite friends and earn additional loyalty credit after each successful signup.',
      icon: TrendingUp,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-12">
      <NotificationContainer notifications={notifications} onClose={removeNotification} />

      <div className="space-y-4 text-center">
        <div className="inline-flex items-center rounded-full border border-amber-100 bg-amber-50 px-4 py-2 text-xs font-black uppercase tracking-widest text-amber-600">
          <Star className="mr-2 h-4 w-4" />
          Gold Member
        </div>
        <h1 className="text-5xl font-black tracking-tight text-gray-900">
          Your <span className="text-blue-600">Rewards</span>
        </h1>
        <p className="mx-auto max-w-xl text-lg font-medium text-gray-500">
          Shop more, collect points, and unlock loyalty perks across the LofiMart experience.
        </p>
      </div>

      <div className="rounded-[3.5rem] bg-gray-900 p-10 text-white shadow-2xl md:p-16">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-2xl">
                <Award className="h-10 w-10 text-white" />
              </div>
              <div>
                <h2 className="text-3xl font-black">Gold Member</h2>
                <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Status: Active</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between text-sm font-bold">
                <span className="text-gray-400">Progress to Platinum</span>
                <span className="text-white">2,450 / 5,000 points</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-blue-500 to-emerald-500" />
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center space-y-4 rounded-[2.5rem] border border-white/10 bg-white/5 p-8 text-center backdrop-blur">
            <p className="text-xs font-black uppercase tracking-widest text-blue-300">Available Points</p>
            <h3 className="text-5xl font-black text-white">4,820</h3>
            <button
              onClick={redeemCoupon}
              className="w-full rounded-2xl bg-white py-4 text-xs font-black uppercase tracking-widest text-blue-900 shadow-xl hover:bg-blue-50"
            >
              Save Reward Coupon
            </button>
            <button
              onClick={() => {
                info('Rewards overview opened. You can review points, streaks, and redemptions from your account rewards page.', 3600);
                navigate('/account/rewards');
              }}
              className="text-xs font-bold uppercase tracking-widest text-white/70 hover:text-white"
            >
              Open Rewards Dashboard
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {features.map((feature) => (
          <div key={feature.title} className="space-y-4 rounded-[2.5rem] border bg-white p-8 shadow-sm hover:shadow-xl">
            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${feature.bg} ${feature.color}`}>
              <feature.icon className="h-7 w-7" />
            </div>
            <h4 className="font-black text-gray-900">{feature.title}</h4>
            <p className="text-sm font-medium text-gray-500">{feature.desc}</p>
            <button
              onClick={() => navigate('/account/rewards')}
              className="text-xs font-black uppercase tracking-widest text-blue-600 hover:underline"
            >
              Learn More
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LoyaltyRewards;
