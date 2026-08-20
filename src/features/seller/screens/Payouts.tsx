import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, CreditCard, Loader2, Wallet } from 'lucide-react';
import toast from '@/lib/toast';
import { SellerEmptyState, SellerPageHeader, SellerStatCard } from '@/features/seller/components/SellerPageHeader';
import { useUser } from '../../../features/shared/state/UserContext';
import { formatPrice } from '../../../lib/utils';

type PayoutMethod = {
  id: string;
  provider?: string | null;
  type?: string | null;
  account_name?: string | null;
  account_number?: string | null;
  mobile_number?: string | null;
  is_default?: boolean;
};

type PayoutTransaction = {
  id: string;
  amount: number;
  status: string;
  created_at?: string;
  notes?: string | null;
};

type EarningsResponse = {
  totalEarnings: number;
  transactions: Array<{ amount: number; status: string }>;
};

export const SellerPayoutsPage = () => {
  const { token, user } = useUser();
  const sellerApproved = user?.seller_status === 'approved';
  const [methods, setMethods] = useState<PayoutMethod[]>([]);
  const [transactions, setTransactions] = useState<PayoutTransaction[]>([]);
  const [availableBalance, setAvailableBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ amount: '', payout_method_id: '', notes: '' });

  const loadData = async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [profileRes, earningsRes] = await Promise.all([
        fetch('/api/users/profile', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/seller/earnings', { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const profilePayload = await profileRes.json().catch(() => null);
      const earningsPayload = (await earningsRes.json().catch(() => null)) as EarningsResponse | null;

      if (!profileRes.ok) throw new Error(profilePayload?.error || 'Failed to load payout setup');
      if (!earningsRes.ok) throw new Error((earningsPayload as any)?.error || 'Failed to load payout balance');

      const nextMethods = Array.isArray(profilePayload?.payout_methods) ? profilePayload.payout_methods : [];
      const nextTransactions = Array.isArray(profilePayload?.transaction_history) ? profilePayload.transaction_history : [];
      const earningsTransactions = Array.isArray(earningsPayload?.transactions) ? earningsPayload.transactions : [];
      const pendingClearance = earningsTransactions
        .filter((transaction) => String(transaction.status || '').toLowerCase() !== 'delivered')
        .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);

      setMethods(nextMethods);
      setTransactions(nextTransactions);
      setAvailableBalance(Math.max(0, Number(earningsPayload?.totalEarnings || 0) - pendingClearance));
      setForm((current) => ({
        ...current,
        payout_method_id: current.payout_method_id || nextMethods.find((method: PayoutMethod) => method.is_default)?.id || nextMethods[0]?.id || '',
      }));
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to load payouts.');
      setMethods([]);
      setTransactions([]);
      setAvailableBalance(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [token]);

  const pendingRequests = useMemo(
    () =>
      transactions
        .filter((transaction) => String(transaction.status || '').toLowerCase() === 'pending')
        .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0),
    [transactions],
  );

  const submitRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;

    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid payout amount.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/users/payout-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount,
          payout_method_id: form.payout_method_id || null,
          notes: form.notes || null,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Failed to submit payout request');
      toast.success('Payout request submitted.');
      setForm((current) => ({ ...current, amount: '', notes: '' }));
      await loadData();
    } catch (requestError: unknown) {
      const nextError = requestError instanceof Error ? requestError.message : 'Failed to submit payout request.';
      setError(nextError);
      toast.error(nextError);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {!sellerApproved ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Payout withdrawals stay locked until admin approves your seller account. You can still configure payout methods from seller settings.
        </div>
      ) : null}

      <SellerPageHeader
        eyebrow="Finance operations"
        title="Payouts"
        description="Request withdrawals, review payout methods, and track settlement history from one seller finance screen."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <SellerStatCard label="Available" value={formatPrice(availableBalance)} />
        <SellerStatCard label="Pending requests" value={formatPrice(pendingRequests)} tone="warning" />
        <SellerStatCard label="Methods" value={methods.length} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Request a payout</h2>
          <p className="mt-1 text-sm text-slate-500">Send a live payout request to the currently configured seller payout backend.</p>
          <form onSubmit={submitRequest} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Amount</span>
              <input
                type="number"
                min="1"
                step="0.01"
                value={form.amount}
                onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-primary"
                placeholder="1500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Payout method</span>
              <select
                value={form.payout_method_id}
                onChange={(event) => setForm((current) => ({ ...current, payout_method_id: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-primary"
              >
                <option value="">Use default account</option>
                {methods.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.provider || method.type || 'Payout method'} â€¢ {method.account_name || method.mobile_number || method.account_number || method.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Notes</span>
              <textarea
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                className="min-h-[120px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-primary"
                placeholder="Optional note for finance team"
              />
            </label>
            <button type="submit" disabled={submitting || !sellerApproved} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
              Submit payout request
            </button>
          </form>
        </section>

        <section className="space-y-6">
          <div className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <CreditCard size={18} className="text-primary" />
              <h2 className="text-lg font-bold text-slate-950">Configured payout methods</h2>
            </div>
            <div className="mt-5 space-y-3">
              {methods.length === 0 ? (
                <SellerEmptyState message="No payout method found yet. Add one from seller settings before requesting withdrawals." />
              ) : (
                methods.map((method) => (
                  <div key={method.id} className="rounded-2xl border border-slate-200 px-4 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-slate-900">{method.provider || method.type || 'Payout method'}</p>
                        <p className="mt-1 text-xs text-slate-500">{method.account_name || method.mobile_number || method.account_number || method.id}</p>
                      </div>
                      {method.is_default ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Default</span> : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <ArrowUpRight size={18} className="text-slate-500" />
              <h2 className="text-lg font-bold text-slate-950">Recent payout history</h2>
            </div>
            <div className="mt-5 space-y-3">
              {transactions.length === 0 ? (
                <SellerEmptyState message="No payout requests or finance transactions found yet." />
              ) : (
                transactions.slice(0, 10).map((transaction) => (
                  <div key={transaction.id} className="rounded-2xl border border-slate-200 px-4 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-slate-900">{formatPrice(Number(transaction.amount || 0))}</p>
                        <p className="mt-1 text-xs text-slate-500">{transaction.created_at ? new Date(transaction.created_at).toLocaleString() : 'No timestamp'}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${String(transaction.status || '').toLowerCase() === 'completed' ? 'bg-emerald-50 text-emerald-700' : String(transaction.status || '').toLowerCase() === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                        {transaction.status}
                      </span>
                    </div>
                    {transaction.notes ? <p className="mt-2 text-xs text-slate-500">{transaction.notes}</p> : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default SellerPayoutsPage;
