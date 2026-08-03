import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CreditCard, Download, Loader2, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatPrice } from '../../../lib/utils';
import { useUser } from '../../../features/shared/state/UserContext';

interface ResellerCommission {
  id: string;
  amount: number;
  status: string;
  product_id?: string | null;
  order_id?: string | null;
  created_at?: string;
}

interface ResellerPayout {
  id: string;
  amount: number;
  status: string;
  created_at: string;
}

interface EarningsData {
  availableBalance: number;
  totalEarned: number;
  pendingAmount: number;
  nextPayout: number;
  commissions: ResellerCommission[];
}

const emptyData: EarningsData = {
  availableBalance: 0,
  totalEarned: 0,
  pendingAmount: 0,
  nextPayout: 0,
  commissions: [],
};

export const ResellerEarnings = () => {
  const { token } = useUser();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<EarningsData>(emptyData);
  const [payouts, setPayouts] = useState<ResellerPayout[]>([]);
  const [requesting, setRequesting] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchEarnings = async () => {
      if (!token) {
        setError('Please log in as a reseller to view earnings and request payouts.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');

        const [earningsRes, payoutsRes] = await Promise.all([
          fetch('/api/reseller/earnings', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/reseller/payouts', { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        const earnings = (await earningsRes.json().catch(() => null)) as EarningsData | null;
        const payoutRows = (await payoutsRes.json().catch(() => null)) as ResellerPayout[] | null;
        if (!earningsRes.ok || !payoutsRes.ok) {
          throw new Error((earnings as any)?.error || (payoutRows as any)?.error || 'Failed to load reseller earnings');
        }
        if (!earnings) {
          throw new Error('Failed to load reseller earnings');
        }
        setData({ ...emptyData, ...earnings, commissions: earnings.commissions ?? [] });
        setPayouts(Array.isArray(payoutRows) ? payoutRows : []);
      } catch (fetchError) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : 'Live earnings could not be loaded right now. Please try again shortly.',
        );
        setData(emptyData);
        setPayouts([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchEarnings();
  }, [token]);

  const transactions = useMemo(() => data.commissions ?? [], [data.commissions]);

  const requestPayout = async () => {
    const numericAmount = Number(amount);
    if (!token) {
      setError('Please log in as a reseller first.');
      return;
    }
    if (!numericAmount || numericAmount < 500) {
      setError('Minimum payout request is 500.');
      return;
    }

    setRequesting(true);
    setError('');
    try {
      const response = await fetch('/api/reseller/payout-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount: numericAmount, notes: note }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to request payout');
      }

      setPayouts((current) => [
        {
          id: `local-${Date.now()}`,
          amount: numericAmount,
          status: 'pending',
          created_at: new Date().toISOString(),
        },
        ...current,
      ]);
      setAmount('');
      setNote('');
      toast.success('Payout request submitted.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to request payout');
    } finally {
      setRequesting(false);
    }
  };

  const handleExportCsv = () => {
    if (transactions.length === 0) {
      toast.error('No commission history is available to export.');
      return;
    }

    const rows = [
      ['Transaction ID', 'Created', 'Product', 'Order', 'Amount', 'Status'],
      ...transactions.map((transaction) => [
        transaction.id,
        transaction.created_at ? new Date(transaction.created_at).toLocaleString() : '-',
        transaction.product_id ?? '-',
        transaction.order_id ?? '-',
        String(transaction.amount),
        transaction.status,
      ]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'reseller-earnings.csv';
    link.click();
    URL.revokeObjectURL(objectUrl);
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="animate-spin text-primary" />
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
          <h1 className="text-2xl font-bold tracking-tight">Earnings & Payouts</h1>
          <p className="text-gray-500">Track your commissions and manage reseller withdrawals.</p>
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <input
            type="number"
            min="0"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="Payout amount"
            className="rounded-xl border bg-gray-50 px-4 py-2 text-sm"
          />
          <input
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Note (optional)"
            className="rounded-xl border bg-gray-50 px-4 py-2 text-sm"
          />
          <button
            onClick={() => void requestPayout()}
            disabled={!amount || requesting}
            className="flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            <CreditCard size={18} />
            <span>{requesting ? 'Requesting...' : 'Request Payout'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 overflow-hidden rounded-[40px] bg-gradient-to-br from-primary to-indigo-700 p-8 text-white shadow-xl">
          <p className="mb-2 text-sm font-medium text-primary-foreground/80">Available Balance</p>
          <h2 className="mb-8 text-4xl font-bold">{formatPrice(data.availableBalance)}</h2>
          <div className="flex gap-8">
            <div>
              <p className="mb-1 text-xs uppercase tracking-wider text-primary-foreground/60">
                Total Earned
              </p>
              <p className="text-lg font-bold">{formatPrice(data.totalEarned)}</p>
            </div>
            <div>
              <p className="mb-1 text-xs uppercase tracking-wider text-primary-foreground/60">
                Pending
              </p>
              <p className="text-lg font-bold">{formatPrice(data.pendingAmount)}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-[40px] border border-black/5 bg-white p-8 shadow-sm">
          <div>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <Wallet size={24} />
            </div>
            <h3 className="mb-1 text-lg font-bold">Next Payout</h3>
            <p className="text-sm text-gray-500">Pending payout requests awaiting review.</p>
          </div>
          <div className="border-t border-gray-50 pt-4">
            <p className="text-2xl font-bold text-emerald-600">{formatPrice(data.nextPayout || 0)}</p>
            <p className="text-xs text-gray-400">Minimum payout: {formatPrice(500)}</p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-50 p-6">
          <h3 className="text-lg font-bold">Payout Requests</h3>
          <span className="text-xs text-gray-500">Latest</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Amount</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Status</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Requested</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {payouts.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-sm text-gray-500">
                    No payout requests yet.
                  </td>
                </tr>
              ) : (
                payouts.map((payout) => (
                  <tr key={payout.id}>
                    <td className="px-6 py-4 text-sm font-bold">{formatPrice(payout.amount)}</td>
                    <td className="px-6 py-4 text-xs font-bold uppercase">
                      <span
                        className={`rounded-full px-2 py-1 ${
                          payout.status === 'paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-orange-100 text-orange-800'
                        }`}
                      >
                        {payout.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(payout.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-50 p-6 md:flex-row md:items-center md:justify-between">
          <h3 className="text-lg font-bold">Commission History</h3>
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 rounded-xl bg-gray-50 px-4 py-2 text-sm font-bold text-gray-600 transition-all hover:bg-gray-100"
          >
            <Download size={18} />
            Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Transaction</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Date</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Amount</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-sm text-gray-500">
                    No commission records yet.
                  </td>
                </tr>
              ) : (
                transactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                          {transaction.amount >= 0 ? <ArrowUpRight size={20} /> : <ArrowDownLeft size={20} />}
                        </div>
                        <div>
                          <p className="text-sm font-bold">
                            {transaction.order_id ? `Order ${transaction.order_id}` : `Product ${transaction.product_id || '-'}`}
                          </p>
                          <p className="text-xs text-gray-500">Commission</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {transaction.created_at ? new Date(transaction.created_at).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-emerald-600">
                      +{formatPrice(transaction.amount)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                          transaction.status === 'paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-orange-100 text-orange-800'
                        }`}
                      >
                        {transaction.status}
                      </span>
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
