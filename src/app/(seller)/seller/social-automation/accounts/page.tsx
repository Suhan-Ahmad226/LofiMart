'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Facebook, Link2, Loader2, RefreshCw, Unplug } from 'lucide-react';
import { useUser } from '@/features/shared/state/UserContext';
import { SellerEmptyState, SellerPageHeader } from '@/features/seller/components/SellerPageHeader';
import { SocialAutomationNav } from '@/features/social-automation/components/SocialAutomationNav';
import toast from '@/lib/toast';

type Account = {
  id: string;
  platform: string;
  account_id: string | null;
  account_name: string | null;
  status: string;
  connected: boolean;
  token_expires_at: string | null;
  updated_at: string;
};

export default function SocialAutomationAccountsPage() {
  const { token } = useUser();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await fetch('/api/social-automation/accounts', { headers: { Authorization: `Bearer ${token}` } });
      const data = (await response.json().catch(() => null)) as Account[] | { error?: string } | null;
      if (!response.ok || !Array.isArray(data)) throw new Error(data && 'error' in data ? data.error : 'Failed to load accounts.');
      setAccounts(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load accounts.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const connect = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const response = await fetch('/api/social-automation/accounts/oauth', { headers: { Authorization: `Bearer ${token}` } });
      const data = (await response.json().catch(() => null)) as { authUrl?: string; error?: string } | null;
      if (!response.ok || !data?.authUrl) throw new Error(data?.error || 'Failed to start Facebook connection.');
      window.location.href = data.authUrl;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start Facebook connection.');
      setBusy(false);
    }
  };

  const disconnect = async (id: string) => {
    if (!token) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/social-automation/accounts/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || 'Failed to disconnect.');
      toast.success('Facebook Page disconnected.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to disconnect.');
    } finally {
      setBusy(false);
    }
  };

  const connected = accounts.find((account) => account.connected);

  return (
    <div className="space-y-5">
      <SellerPageHeader eyebrow="Social Automation" title="Connected Accounts" description="Choose where LofiMart publishes your product content." />
      <SocialAutomationNav active="accounts" />

      <section className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-950">Social channels</h2>
            <p className="mt-1 text-sm text-slate-500">Connect once, then schedule from your products.</p>
          </div>
          <button type="button" onClick={() => void load()} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label="Refresh accounts">
            <RefreshCw size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1877f2] text-white"><Facebook size={23} /></div>
              <div>
                <p className="font-black text-slate-950">Facebook Page</p>
                <p className="text-sm text-slate-500">{connected?.account_name || 'No Page connected'}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {connected ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700"><CheckCircle2 size={14} /> Connected</span>
                  <button type="button" disabled={busy} onClick={() => void disconnect(connected.id)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Unplug size={15} /> Disconnect</button>
                </>
              ) : (
                <button type="button" disabled={busy} onClick={() => void connect()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50">
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />} Connect Facebook
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-dashed border-slate-200 p-4 opacity-75">
            <div><p className="font-bold text-slate-950">Instagram</p><p className="text-sm text-slate-500">Ready for a future channel integration.</p></div>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-500">Coming soon</span>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-dashed border-slate-200 p-4 opacity-75">
            <div><p className="font-bold text-slate-950">TikTok</p><p className="text-sm text-slate-500">Add more channels later without changing your workflow.</p></div>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-500">Coming soon</span>
          </div>
        </div>

        {loading ? <div className="mt-4 h-12 animate-pulse rounded-xl bg-slate-100" /> : null}
        {!loading && !accounts.length ? <div className="mt-5"><SellerEmptyState message="No social account is connected yet." /></div> : null}
        {!loading && !connected && accounts.some((account) => account.status === 'EXPIRED' || account.status === 'ERROR') ? (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-800"><AlertCircle size={18} /> Your previous Facebook connection needs to be reconnected.</div>
        ) : null}
      </section>
    </div>
  );
}
