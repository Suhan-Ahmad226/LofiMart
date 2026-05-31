import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Search, ShieldAlert, Undo2, XCircle } from 'lucide-react';
import { useUser } from '@/src/context/UserContext';
import { formatPrice } from '@/src/lib/utils';
import toast from 'react-hot-toast';

type ReturnRequestRecord = {
  id: string;
  order_id: string | null;
  type: string;
  status: string;
  reason: string | null;
  resolution_note: string | null;
  processed_at: string | null;
  created_at: string;
  customer: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  order: {
    id: string;
    total: number;
    status: string;
    payment_status: string | null;
    courier_provider: string | null;
    tracking_id: string | null;
    created_at: string | null;
  } | null;
  processed_by: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
};

type ReturnSummary = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  refunded: number;
};

function getStatusTone(status: string) {
  switch (String(status).toLowerCase()) {
    case 'pending':
      return 'bg-amber-100 text-amber-800';
    case 'approved':
      return 'bg-blue-100 text-blue-800';
    case 'refunded':
      return 'bg-emerald-100 text-emerald-800';
    case 'rejected':
      return 'bg-rose-100 text-rose-800';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

export const AdminReturnsPage = () => {
  const { token } = useUser();
  const [requests, setRequests] = useState<ReturnRequestRecord[]>([]);
  const [summary, setSummary] = useState<ReturnSummary>({ total: 0, pending: 0, approved: 0, rejected: 0, refunded: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'refunded'>('all');
  const [updatingId, setUpdatingId] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});
  const [focusedRequestId, setFocusedRequestId] = useState('');

  const loadReturns = async () => {
    if (!token) {
      setError('Please log in as an admin to review returns.');
      setRequests([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      const response = await fetch('/api/admin/return-requests', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load return requests');
      }
      setRequests(Array.isArray(payload?.requests) ? payload.requests : []);
      setSummary(payload?.summary || { total: 0, pending: 0, approved: 0, rejected: 0, refunded: 0 });
    } catch (err) {
      setRequests([]);
      setSummary({ total: 0, pending: 0, approved: 0, rejected: 0, refunded: 0 });
      setError(err instanceof Error ? err.message : 'Failed to load return requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReturns();
  }, [token]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const nextSearch = params.get('search');
    const nextRequest = params.get('request');

    if (nextSearch) {
      setSearch(nextSearch);
    }
    if (nextRequest) {
      setFocusedRequestId(nextRequest);
    }
  }, []);

  const filteredRequests = useMemo(() => {
    const term = search.trim().toLowerCase();

    return requests.filter((request) => {
      const matchesFilter = filter === 'all' ? true : request.status === filter;
      if (!matchesFilter) return false;
      if (!term) return true;

      return [
        request.id,
        request.order?.id || '',
        request.customer?.name || '',
        request.customer?.email || '',
        request.order?.tracking_id || '',
        request.order?.courier_provider || '',
        request.reason || '',
        request.status || '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [filter, requests, search]);

  useEffect(() => {
    if (!focusedRequestId || filteredRequests.length === 0 || typeof window === 'undefined') return;

    const matched = filteredRequests.find((request) => request.id === focusedRequestId);
    if (!matched) return;

    window.requestAnimationFrame(() => {
      document.getElementById(`admin-return-request-${matched.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [filteredRequests, focusedRequestId]);

  const handleAction = async (request: ReturnRequestRecord, status: 'approved' | 'rejected' | 'refunded') => {
    const resolutionNote = (resolutionNotes[request.id] || '').trim();

    if (status === 'rejected' && resolutionNote.length < 5) {
      toast.error('Add a short rejection note before rejecting the request.');
      return;
    }

    try {
      setUpdatingId(request.id);
      const response = await fetch(`/api/admin/return-requests/${request.id}/review`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status, resolutionNote }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to update return request');
      }

      setRequests((current) =>
        current.map((item) =>
          item.id === request.id
            ? {
                ...item,
                status,
                resolution_note: resolutionNote || item.resolution_note,
                processed_at: payload?.request?.processed_at || new Date().toISOString(),
              }
            : item,
        ),
      );

      setSummary((current) => {
        const next = { ...current };
        const previousStatus = String(request.status || 'pending').toLowerCase() as keyof ReturnSummary;
        const nextStatus = status as keyof ReturnSummary;

        if (previousStatus in next) {
          next[previousStatus] = Math.max(0, Number(next[previousStatus]) - 1);
        }
        if (nextStatus in next) {
          next[nextStatus] = Number(next[nextStatus]) + 1;
        }
        return next;
      });

      toast.success(
        status === 'approved'
          ? 'Return request approved'
          : status === 'rejected'
            ? 'Return request rejected'
            : 'Return marked as refunded',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update return request');
    } finally {
      setUpdatingId('');
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
      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Returns Queue</h1>
          <p className="text-sm text-gray-500">Review customer return requests, approve resolutions, and confirm refund completion.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search order, tracking, customer..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as typeof filter)}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm focus:ring-2 focus:ring-primary/20"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="refunded">Refunded</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Total</p>
          <p className="mt-2 text-xl font-bold text-gray-900 md:text-2xl">{summary.total}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Pending</p>
          <p className="mt-2 text-xl font-bold text-amber-900 md:text-2xl">{summary.pending}</p>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Approved</p>
          <p className="mt-2 text-xl font-bold text-blue-900 md:text-2xl">{summary.approved}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Refunded</p>
          <p className="mt-2 text-xl font-bold text-emerald-900 md:text-2xl">{summary.refunded}</p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-rose-700">Rejected</p>
          <p className="mt-2 text-xl font-bold text-rose-900 md:text-2xl">{summary.rejected}</p>
        </div>
      </div>

      {filteredRequests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center text-sm text-gray-500">
          No return requests match the current filter.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRequests.map((request) => {
            const isUpdating = updatingId === request.id;
            const currentNote = resolutionNotes[request.id] ?? request.resolution_note ?? '';

            return (
              <div
                id={`admin-return-request-${request.id}`}
                key={request.id}
                className={`rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-6 ${
                  request.id === focusedRequestId ? 'border-indigo-300 ring-2 ring-indigo-200 bg-indigo-50/30' : ''
                }`}
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-lg font-bold text-gray-900">Return #{request.id.slice(-8).toUpperCase()}</h2>
                      <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${getStatusTone(request.status)}`}>
                        {String(request.status).replaceAll('_', ' ')}
                      </span>
                    </div>
                    <div className="grid gap-2 text-sm text-gray-600 md:grid-cols-2">
                      <p><span className="font-semibold text-gray-900">Customer:</span> {request.customer?.name || 'Customer'} {request.customer?.email ? `(${request.customer.email})` : ''}</p>
                      <p><span className="font-semibold text-gray-900">Order:</span> {request.order?.id || request.order_id || 'Not linked'}</p>
                      <p><span className="font-semibold text-gray-900">Order total:</span> {request.order ? formatPrice(Number(request.order.total || 0)) : 'N/A'}</p>
                      <p><span className="font-semibold text-gray-900">Payment:</span> {request.order?.payment_status || 'untracked'}</p>
                      <p><span className="font-semibold text-gray-900">Courier:</span> {request.order?.courier_provider || 'Not assigned yet'}</p>
                      <p><span className="font-semibold text-gray-900">Tracking:</span> {request.order?.tracking_id || 'Not available'}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                      <p className="font-semibold text-slate-900">Customer reason</p>
                      <p className="mt-2 whitespace-pre-wrap">{request.reason || 'No reason provided.'}</p>
                    </div>
                    {request.processed_at ? (
                      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
                        <p className="font-semibold">Last resolution update</p>
                        <p className="mt-1">
                          {request.processed_by?.name || 'Admin'} updated this request on {new Date(request.processed_at).toLocaleString()}.
                        </p>
                        {request.resolution_note ? <p className="mt-2">{request.resolution_note}</p> : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="w-full max-w-xl space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <ShieldAlert size={18} className="text-primary" />
                      <span>Resolution workspace</span>
                    </div>
                    <textarea
                      rows={4}
                      value={currentNote}
                      onChange={(event) =>
                        setResolutionNotes((current) => ({
                          ...current,
                          [request.id]: event.target.value,
                        }))
                      }
                      placeholder="Add a review note, refund note, or rejection explanation"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-primary/30 focus:ring-4 focus:ring-primary/10"
                    />
                    <div className="grid gap-3 sm:grid-cols-3">
                      <button
                        onClick={() => void handleAction(request, 'approved')}
                        disabled={isUpdating || request.status !== 'pending'}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isUpdating ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                        <span>Approve</span>
                      </button>
                      <button
                        onClick={() => void handleAction(request, 'rejected')}
                        disabled={isUpdating || !['pending', 'approved'].includes(request.status)}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isUpdating ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                        <span>Reject</span>
                      </button>
                      <button
                        onClick={() => void handleAction(request, 'refunded')}
                        disabled={isUpdating || request.status !== 'approved'}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isUpdating ? <Loader2 size={16} className="animate-spin" /> : <Undo2 size={16} />}
                        <span>Mark refunded</span>
                      </button>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
                      Approve when the request is valid, reject with a clear note when policy does not allow the return, and mark refunded only after the money flow is actually completed.
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
