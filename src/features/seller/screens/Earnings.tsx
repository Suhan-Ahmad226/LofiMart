import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Download, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatPrice } from '@/src/lib/utils';
import { useUser } from '@/src/context/UserContext';

interface SellerTransaction {
  order_id: string | number;
  date: string;
  amount: number;
  status: string;
}

interface SellerEarningsResponse {
  totalEarnings: number;
  transactions: SellerTransaction[];
}

const emptyData: SellerEarningsResponse = {
  totalEarnings: 0,
  transactions: [],
};

export const SellerEarningsPage = () => {
  const { token } = useUser();
  const [data, setData] = useState<SellerEarningsResponse>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchEarnings = async () => {
      if (!token) {
        setError('Please log in as a seller to view earnings.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');
        const response = await fetch('/api/seller/earnings', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || 'Failed to load seller earnings');
        }

        const payload = (await response.json()) as SellerEarningsResponse;
        setData({
          totalEarnings: Number(payload.totalEarnings || 0),
          transactions: Array.isArray(payload.transactions) ? payload.transactions : [],
        });
      } catch (fetchError) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : 'Live earnings could not be loaded right now. Please try again shortly.',
        );
        setData(emptyData);
      } finally {
        setLoading(false);
      }
    };

    void fetchEarnings();
  }, [token]);

  const pendingClearance = useMemo(
    () =>
      data.transactions
        .filter((transaction) => transaction.status !== 'delivered')
        .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0),
    [data.transactions],
  );

  const totalWithdrawn = useMemo(
    () => Math.max(0, data.totalEarnings - pendingClearance),
    [data.totalEarnings, pendingClearance],
  );

  const handleExportReport = () => {
    if (data.transactions.length === 0) {
      toast.error('No transactions are available to export.');
      return;
    }

    const rows = [
      ['Order ID', 'Date', 'Amount', 'Status'],
      ...data.transactions.map((transaction) => [
        `ASB-${transaction.order_id}`,
        new Date(transaction.date).toLocaleString(),
        String(transaction.amount),
        transaction.status,
      ]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'seller-earnings-report.csv';
    link.click();
    URL.revokeObjectURL(objectUrl);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-primary" size={32} />
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

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Earnings</h1>
          <p className="text-sm text-gray-500">Track your seller revenue and cleared payouts.</p>
        </div>
        <button
          onClick={handleExportReport}
          className="flex items-center space-x-2 rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-bold text-gray-700 transition-all hover:bg-gray-50"
        >
          <Download size={20} />
          <span>Download Report</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="space-y-2 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">Available Balance</p>
          <p className="text-3xl font-bold text-primary">{formatPrice(totalWithdrawn)}</p>
          <p className="text-xs text-gray-400">Based on delivered and cleared orders.</p>
        </div>
        <div className="space-y-2 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">Pending Clearance</p>
          <p className="text-3xl font-bold text-gray-900">{formatPrice(pendingClearance)}</p>
          <p className="text-xs text-gray-400">Awaiting delivery or status completion.</p>
        </div>
        <div className="space-y-2 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">Gross Earnings</p>
          <p className="text-3xl font-bold text-gray-900">{formatPrice(data.totalEarnings)}</p>
          <p className="text-xs text-gray-400">Total revenue from non-cancelled orders.</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
        <div className="border-b border-gray-100 p-6">
          <h3 className="font-bold">Transaction History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-500">
                <th className="px-6 py-4">Order ID</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    No transactions found.
                  </td>
                </tr>
              ) : (
                data.transactions.map((transaction) => (
                  <tr key={transaction.order_id} className="text-sm">
                    <td className="px-6 py-4 font-medium">#ASB-{transaction.order_id}</td>
                    <td className="px-6 py-4 text-gray-500">
                      {new Date(transaction.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 capitalize">
                      <div className="flex items-center space-x-2">
                        <ArrowUpRight size={14} className="text-primary" />
                        <span>Sale</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-bold text-primary">
                      {formatPrice(transaction.amount)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                          transaction.status === 'delivered'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
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
