import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Mail, MessageSquare, Search, TrendingUp, UserPlus, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { formatPrice } from '../../lib/utils';
import { useUser } from '../../context/UserContext';
import { copyText, openMailto } from '../../lib/browser-actions';

interface NetworkStats {
  directReferrals: number;
  networkSize: number;
  networkSales: number;
  activeToday: number;
}

interface DownlineMember {
  id: string;
  name: string;
  joined?: string;
  level: number | string;
  sales: number;
  commission: number;
  status: string;
  email?: string | null;
}

export const ResellerNetwork = () => {
  const { token } = useUser();
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<NetworkStats>({
    directReferrals: 0,
    networkSize: 0,
    networkSales: 0,
    activeToday: 0,
  });
  const [downline, setDownline] = useState<DownlineMember[]>([]);
  const [inviteUrl, setInviteUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchNetwork = async () => {
      if (!token) {
        setError('Please log in as a reseller to view and grow your network.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');
        const [networkResponse, inviteResponse] = await Promise.all([
          fetch('/api/reseller/network', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/reseller/referral-link', {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const networkData = await networkResponse.json().catch(() => null);
        const inviteData = await inviteResponse.json().catch(() => null);
        if (!networkResponse.ok || !inviteResponse.ok) {
          throw new Error(
            networkData?.error || inviteData?.error || 'Failed to load reseller network data',
          );
        }
        setStats({
          directReferrals: Number(networkData.directReferrals || 0),
          networkSize: Number(networkData.networkSize || 0),
          networkSales: Number(networkData.networkSales || 0),
          activeToday: Number(networkData.activeToday || 0),
        });
        setDownline(Array.isArray(networkData.downline) ? networkData.downline : []);
        setInviteUrl(inviteData.url || '');
      } catch (fetchError) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : 'Network data could not be loaded right now. Please try again shortly.',
        );
        setStats({ directReferrals: 0, networkSize: 0, networkSales: 0, activeToday: 0 });
        setDownline([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchNetwork();
  }, [token]);

  const filteredDownline = useMemo(
    () =>
      downline.filter((member) =>
        [member.name, member.email || '', String(member.level || '')]
          .some((value) => value.toLowerCase().includes(search.toLowerCase())),
      ),
    [downline, search],
  );

  const inviteReseller = async () => {
    if (!inviteUrl) {
      toast.error('Invite link is not ready yet.');
      return;
    }

    const copied = await copyText(inviteUrl);
    if (!copied) {
      toast.error('Could not copy the reseller invite link right now.');
      return;
    }

    toast.success('Reseller invite link copied.');
  };

  const contactMember = (member: DownlineMember) => {
    if (!member.email) {
      toast.error('No email found for this reseller.');
      return;
    }

    openMailto(member.email);
  };

  const networkStats = [
    { label: 'Direct Referrals', value: String(stats.directReferrals), icon: <Users className="text-blue-600" /> },
    { label: 'Network Size', value: String(stats.networkSize), icon: <UserPlus className="text-purple-600" /> },
    { label: 'Network Sales', value: formatPrice(stats.networkSales), icon: <ArrowUpRight className="text-emerald-600" /> },
    { label: 'Active Today', value: String(stats.activeToday), icon: <TrendingUp className="text-orange-600" /> },
  ];

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <TrendingUp className="animate-pulse text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Network</h1>
          <p className="text-gray-500">Manage your referrals and track downline performance.</p>
        </div>
        <button
          onClick={() => void inviteReseller()}
          disabled={!inviteUrl}
          className="flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 disabled:opacity-50"
        >
          <UserPlus size={18} />
          <span>Invite Reseller</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {networkStats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="rounded-3xl border border-black/5 bg-white p-6 shadow-sm"
          >
            <div className="flex items-center space-x-4">
              <div className="rounded-2xl bg-gray-50 p-3">{stat.icon}</div>
              <div>
                <p className="text-xs font-medium text-gray-500">{stat.label}</p>
                <p className="text-xl font-bold">{stat.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-50 p-6 md:flex-row md:items-center md:justify-between">
          <h3 className="text-lg font-bold">Downline Members</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search members..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="rounded-xl bg-gray-50 py-2 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Member</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Level</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Total Sales</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Your Commission</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Status</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredDownline.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500">
                    No network members found yet.
                  </td>
                </tr>
              ) : (
                filteredDownline.map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
                          {member.name[0]}
                        </div>
                        <div>
                          <p className="text-sm font-bold">{member.name}</p>
                          <p className="text-xs text-gray-500">
                            Joined {member.joined ? new Date(member.joined).toLocaleDateString() : '-'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium">{member.level}</td>
                    <td className="px-6 py-4 text-sm font-bold">{formatPrice(member.sales)}</td>
                    <td className="px-6 py-4 text-sm font-bold text-emerald-600">
                      +{formatPrice(member.commission)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                          member.status === 'Active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {member.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => contactMember(member)}
                          className="p-2 text-gray-400 transition-colors hover:text-primary"
                        >
                          <Mail size={18} />
                        </button>
                        <button
                          onClick={() => toast.success(`Message draft opened for ${member.name}.`)}
                          className="p-2 text-gray-400 transition-colors hover:text-primary"
                        >
                          <MessageSquare size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
