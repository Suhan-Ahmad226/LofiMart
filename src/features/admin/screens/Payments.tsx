import React, { useEffect, useState } from 'react';
import { CreditCard, AlertTriangle, CheckCircle2, Download, Search } from 'lucide-react';
import { formatPrice } from '../../../lib/utils';
import { useUser } from '../../../features/shared/state/UserContext';
import { CenteredLoader, EmptyState, FormNotice } from '@/features/shared/ui/FeedbackState';
import { useNavigate, useSearchParams } from '../../../lib/navigation';

export const AdminPaymentsPage = () => {
  const { token } = useUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.get('search') || '';
  const urlPayout = searchParams.get('payout') || '';
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [focusedPayoutId, setFocusedPayoutId] = useState('');

  const handleFinancialReportExport = () => {
    const rows = filteredPayouts.map((txn: any) => ({
      id: txn.id,
      seller_name: txn.seller_name || '',
      amount: txn.amount,
      status: txn.status || '',
      date: txn.date ? new Date(txn.date).toISOString() : '',
    }));
    const headers = ['payout_id', 'seller', 'amount', 'status', 'date'];
    const csv = [
      headers.join(','),
      ...rows.map((row: Record<string, unknown>) =>
        headers.map((header) => `"${String(row[header] ?? '').replaceAll('"', '""')}"`).join(','),
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `admin-financial-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (urlSearch) {
      setSearch(urlSearch);
    }
    if (urlPayout) {
      setFocusedPayoutId(urlPayout);
    }
  }, [urlPayout, urlSearch]);

  useEffect(() => {
    const loadPayments = async () => {
      if (!token) {
        setError('Please log in as an admin to view payment activity.');
        setData(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');
        const response = await fetch('/api/admin/payments', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load payment data');
        }
        setData(payload);
      } catch (err) {
        setData(null);
        setError(err instanceof Error ? err.message : 'Failed to load payment data');
      } finally {
        setLoading(false);
      }
    };

    void loadPayments();
  }, [token]);

  const recentPayouts = Array.isArray(data?.recentPayouts) ? data.recentPayouts : [];
  const recentRefunds = Array.isArray(data?.recentRefunds) ? data.recentRefunds : [];
  const filteredPayouts = recentPayouts.filter((txn: any) =>
    [`${txn.id ?? ''}`, txn.seller_name || '', txn.status || '']
      .some((value) => value.toLowerCase().includes(search.toLowerCase()))
  );
  const filteredRefunds = recentRefunds.filter((refund: any) =>
    [
      `${refund.id ?? ''}`,
      refund.order_id || '',
      refund.customer_name || '',
      refund.customer_email || '',
      refund.provider_refund_id || '',
      refund.status || '',
    ].some((value) => value.toLowerCase().includes(search.toLowerCase()))
  );

  useEffect(() => {
    if (!focusedPayoutId || typeof window === 'undefined') return;

    window.requestAnimationFrame(() => {
      document.getElementById(`admin-payout-${focusedPayoutId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [filteredPayouts.length, focusedPayoutId]);

  if (loading) {
    return <CenteredLoader label="Loading payment activity..." className="min-h-[240px]" />;
  }

  return (
    <div className="space-y-8">
      {error ? <FormNotice tone="error">{error}</FormNotice> : null}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Payments & Payouts</h1>
          <p className="text-sm text-gray-500">Monitor marketplace financial transactions</p>
        </div>
        <button
          onClick={handleFinancialReportExport}
          className="flex items-center justify-center space-x-2 rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-bold text-gray-700 transition-all hover:bg-gray-50"
        >
          <Download size={20} />
          <span>Financial Report</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">
        <div className="space-y-2 rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-6">
          <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Total Revenue</p>
          <p className="text-xl font-bold text-gray-900 md:text-2xl">{formatPrice(Number(data?.totalRevenue || 0))}</p>
          <p className="text-xs text-gray-400">
            Paid order volume {Number(data?.paymentSummary?.paidOrders || 0)} order{Number(data?.paymentSummary?.paidOrders || 0) === 1 ? '' : 's'}
          </p>
        </div>
        <div className="space-y-2 rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-6">
          <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Pending Payouts</p>
          <p className="text-xl font-bold text-yellow-600 md:text-2xl">{formatPrice(Number(data?.pendingPayouts || 0))}</p>
          <p className="text-xs text-gray-400">Sellers waiting for clearance</p>
        </div>
        <div className="space-y-2 rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-6">
          <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Awaiting Payment</p>
          <p className="text-xl font-bold text-primary md:text-2xl">{formatPrice(Number(data?.paymentSummary?.awaitingPaymentAmount || 0))}</p>
          <p className="text-xs text-gray-400">
            {Number(data?.paymentSummary?.awaitingPaymentOrders || 0)} order{Number(data?.paymentSummary?.awaitingPaymentOrders || 0) === 1 ? '' : 's'} still waiting for payment completion
          </p>
        </div>
        <div className="space-y-2 rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-6">
          <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Failed Payments</p>
          <p className="text-xl font-bold text-accent md:text-2xl">{formatPrice(Number(data?.paymentSummary?.failedAmount || 0))}</p>
          <p className="text-xs text-gray-400">
            {Number(data?.paymentSummary?.failedOrders || 0)} order{Number(data?.paymentSummary?.failedOrders || 0) === 1 ? '' : 's'} need retry or support follow-up
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="text-emerald-600" size={20} />
            <div>
              <p className="text-sm font-bold text-emerald-900">Paid successfully</p>
              <p className="text-xs text-emerald-700">
                {Number(data?.paymentSummary?.paidOrders || 0)} order{Number(data?.paymentSummary?.paidOrders || 0) === 1 ? '' : 's'} confirmed with successful payment status.
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
          <div className="flex items-center gap-3">
            <CreditCard className="text-sky-600" size={20} />
            <div>
              <p className="text-sm font-bold text-sky-900">Refunded through wallet</p>
              <p className="text-xs text-sky-700">
                {Number(data?.paymentSummary?.refundedOrders || 0)} order{Number(data?.paymentSummary?.refundedOrders || 0) === 1 ? '' : 's'} refunded, total {formatPrice(Number(data?.paymentSummary?.refundedAmount || 0))}.
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-center gap-3">
            <CreditCard className="text-amber-600" size={20} />
            <div>
              <p className="text-sm font-bold text-amber-900">Needs payment completion</p>
              <p className="text-xs text-amber-700">
                Use checkout recovery or customer support follow-up for incomplete online payments.
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-rose-600" size={20} />
            <div>
              <p className="text-sm font-bold text-rose-900">Failed payment watchlist</p>
              <p className="text-xs text-rose-700">
                Focus on failed online payment cases before stock is reallocated or support load increases.
              </p>
            </div>
          </div>
        </div>
      </div>

      {Number(data?.pendingReturnRequests || 0) > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">{Number(data?.pendingReturnRequests || 0)} return request{Number(data?.pendingReturnRequests || 0) === 1 ? '' : 's'} are waiting for review.</p>
          <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>Review customer order history and support context before approving returns or refunds.</p>
            <button
              onClick={() => navigate('/admin/returns')}
              className="inline-flex items-center justify-center rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
            >
              Open returns queue
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 md:flex-row md:items-center md:justify-between md:p-6">
          <h3 className="font-bold">Recent Payouts</h3>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search payouts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border-none bg-bg-light py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/20 md:py-2"
            />
          </div>
        </div>
        <div className="space-y-3 p-4 md:hidden">
          {filteredPayouts.length === 0 ? (
            <EmptyState
              icon={<CreditCard size={24} />}
              title={search ? 'No payouts match this search' : 'No payouts found'}
              description={
                search
                  ? 'Try a different payout ID, seller name, or status.'
                  : 'Seller payout requests and finance review items will appear here.'
              }
              tone="soft"
              className="py-10"
            />
          ) : (
            filteredPayouts.map((txn: any) => (
              <div
                id={`admin-payout-${txn.id}`}
                key={txn.id}
                className={`rounded-2xl border p-4 shadow-sm ${
                  txn.id === focusedPayoutId ? 'border-indigo-300 ring-2 ring-indigo-200 bg-indigo-50/30' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-900">#ASB-{txn.id}</p>
                    <p className="mt-1 text-sm text-gray-500">{txn.seller_name}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${txn.status === 'delivered' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {txn.status}
                  </span>
                </div>
                <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                  <p className="font-bold text-primary">{formatPrice(txn.amount)}</p>
                  <p className="mt-1">{new Date(txn.date).toLocaleDateString()}</p>
                </div>
              </div>
            ))
          )}
        </div>
        <table className="hidden w-full text-left md:table">
          <thead>
            <tr className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider">
              <th className="px-6 py-4">ID</th>
              <th className="px-6 py-4">Seller</th>
              <th className="px-6 py-4">Amount</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredPayouts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-10">
                  <EmptyState
                    icon={<CreditCard size={24} />}
                    title={search ? 'No payouts match this search' : 'No payouts found'}
                    description={
                      search
                        ? 'Try a different payout ID, seller name, or status.'
                        : 'Seller payout requests and finance review items will appear here.'
                    }
                    tone="soft"
                    className="py-10"
                  />
                </td>
              </tr>
            ) : (
              filteredPayouts.map((txn: any) => (
                <tr
                  id={`admin-payout-${txn.id}`}
                  key={txn.id}
                  className={`text-sm ${txn.id === focusedPayoutId ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-200' : ''}`}
                >
                  <td className="px-6 py-4 font-medium">#ASB-{txn.id}</td>
                  <td className="px-6 py-4">{txn.seller_name}</td>
                  <td className="px-6 py-4 font-bold">{formatPrice(txn.amount)}</td>
                  <td className="px-6 py-4 text-gray-500">{new Date(txn.date).toLocaleDateString()}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${txn.status === 'delivered' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {txn.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
        <div className="border-b border-gray-100 p-4 md:p-6">
          <h3 className="font-bold">Recent Refunds</h3>
          <p className="mt-1 text-sm text-gray-500">Wallet-backed return refunds and recorded payment refund trail.</p>
        </div>
        <div className="space-y-3 p-4 md:hidden">
          {filteredRefunds.length === 0 ? (
            <EmptyState
              icon={<AlertTriangle size={24} />}
              title={search ? 'No refunds match this search' : 'No refund records yet'}
              description={
                search
                  ? 'Try a different order ID, customer, provider, or refund status.'
                  : 'Completed and pending refund records will appear here once returns are processed.'
              }
              tone="soft"
              className="py-10"
            />
          ) : (
            filteredRefunds.map((refund: any) => (
              <div key={refund.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-900">{refund.order_id || 'Unlinked order'}</p>
                    <p className="mt-1 text-sm text-gray-500">{refund.customer_name || 'Customer'}</p>
                    {refund.customer_email ? <p className="text-xs text-gray-500">{refund.customer_email}</p> : null}
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                    {refund.status || 'completed'}
                  </span>
                </div>
                <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                  <p className="font-bold text-slate-900">{formatPrice(Number(refund.amount || 0))}</p>
                  <p className="mt-1">{refund.payment_provider || 'wallet'}</p>
                  <p className="mt-1">{refund.created_at ? new Date(refund.created_at).toLocaleDateString() : 'N/A'}</p>
                </div>
              </div>
            ))
          )}
        </div>
        <table className="hidden w-full text-left md:table">
          <thead>
            <tr className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider">
              <th className="px-6 py-4">Order</th>
              <th className="px-6 py-4">Customer</th>
              <th className="px-6 py-4">Amount</th>
              <th className="px-6 py-4">Provider</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredRefunds.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-10">
                  <EmptyState
                    icon={<AlertTriangle size={24} />}
                    title={search ? 'No refunds match this search' : 'No refund records yet'}
                    description={
                      search
                        ? 'Try a different order ID, customer, provider, or refund status.'
                        : 'Completed and pending refund records will appear here once returns are processed.'
                    }
                    tone="soft"
                    className="py-10"
                  />
                </td>
              </tr>
            ) : (
              filteredRefunds.map((refund: any) => (
                <tr key={refund.id} className="text-sm">
                  <td className="px-6 py-4 font-medium">{refund.order_id || 'Unlinked order'}</td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{refund.customer_name || 'Customer'}</div>
                    {refund.customer_email ? <div className="text-xs text-gray-500">{refund.customer_email}</div> : null}
                  </td>
                  <td className="px-6 py-4 font-bold">{formatPrice(Number(refund.amount || 0))}</td>
                  <td className="px-6 py-4 text-gray-600">{refund.payment_provider || 'wallet'}</td>
                  <td className="px-6 py-4 text-gray-500">{refund.created_at ? new Date(refund.created_at).toLocaleDateString() : 'N/A'}</td>
                  <td className="px-6 py-4">
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                      {refund.status || 'completed'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
