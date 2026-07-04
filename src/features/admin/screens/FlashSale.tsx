import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Plus, XCircle, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { useUser } from '@/src/context/UserContext';
import { formatPrice } from '@/src/lib/utils';

type FlashSaleEntry = {
  id: string;
  seller_name?: string | null;
  sale_price: number;
  allocated_stock: number;
  status: string;
  note?: string | null;
  rejection_reason?: string | null;
  product?: {
    id: string;
    name: string;
    price: number;
    seller_name?: string;
  } | null;
};

type FlashSaleCampaign = {
  id: string;
  title: string;
  description?: string;
  banner_image?: string;
  starts_at: string;
  ends_at: string;
  status: string;
  entries?: FlashSaleEntry[];
};

const initialForm = {
  title: '',
  description: '',
  bannerImage: '',
  startsAt: '',
  endsAt: '',
  status: 'draft',
};

export const AdminFlashSalePage = () => {
  const { token } = useUser();
  const [campaigns, setCampaigns] = useState<FlashSaleCampaign[]>([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [focusedEntryId, setFocusedEntryId] = useState('');

  const loadCampaigns = async () => {
    if (!token) {
      setError('Please log in as an admin to manage flash sale campaigns.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      const response = await fetch('/api/admin/flash-sale', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load flash sale campaigns');
      }
      setCampaigns(Array.isArray(payload) ? payload : []);
    } catch (requestError) {
      setCampaigns([]);
      setError(requestError instanceof Error ? requestError.message : 'Failed to load flash sale campaigns');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCampaigns();
  }, [token]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const nextEntry = params.get('entry');
    if (nextEntry) {
      setFocusedEntryId(nextEntry);
    }
  }, []);

  const activeCampaigns = useMemo(
    () => campaigns.filter((campaign) => ['live', 'published', 'scheduled', 'draft'].includes(campaign.status)),
    [campaigns],
  );

  useEffect(() => {
    if (!focusedEntryId || typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      document.getElementById(`admin-flash-entry-${focusedEntryId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [campaigns, focusedEntryId]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;

    try {
      setSaving(true);
      const response = await fetch('/api/admin/flash-sale', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to create flash sale campaign');
      }

      toast.success('Flash sale campaign created.');
      setForm(initialForm);
      await loadCampaigns();
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'Failed to create flash sale campaign');
    } finally {
      setSaving(false);
    }
  };

  const handleReview = async (entryId: string, status: 'approved' | 'rejected') => {
    if (!token) return;

    try {
      const response = await fetch(`/api/admin/flash-sale/entries/${entryId}/review`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status,
          rejectionReason: status === 'rejected' ? 'Please adjust pricing or stock allocation and submit again.' : '',
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to review flash sale entry');
      }

      toast.success(`Entry ${status}.`);
      await loadCampaigns();
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'Failed to review flash sale entry');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[32px] border border-black/5 bg-white p-8 shadow-sm">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-primary">
            <Zap size={14} />
            Flash Sale Control
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Marketplace flash sale campaigns</h1>
          <p className="max-w-3xl text-sm text-slate-600">
            Admin owns the campaign, sellers submit products for approval, and resellers promote the published event.
          </p>
        </div>
      </div>

      {error ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[32px] border border-black/5 bg-white p-8 shadow-sm">
          <div className="mb-6">
            <h2 className="text-xl font-bold">Create campaign</h2>
            <p className="text-sm text-slate-500">Set the schedule and publish state before seller approvals start.</p>
          </div>

          <form onSubmit={handleCreate} className="space-y-4">
            <label className="space-y-2 text-sm">
              <span className="font-medium text-slate-700">Title</span>
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                required
              />
            </label>

            <label className="space-y-2 text-sm">
              <span className="font-medium text-slate-700">Description</span>
              <textarea
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                rows={4}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
              />
            </label>

            <label className="space-y-2 text-sm">
              <span className="font-medium text-slate-700">Banner image URL</span>
              <input
                value={form.bannerImage}
                onChange={(event) => setForm((current) => ({ ...current, bannerImage: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Starts at</span>
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                  required
                />
              </label>

              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700">Ends at</span>
                <input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                  required
                />
              </label>
            </div>

            <label className="space-y-2 text-sm">
              <span className="font-medium text-slate-700">Status</span>
              <select
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
              >
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled</option>
                <option value="published">Published</option>
                <option value="live">Live</option>
                <option value="ended">Ended</option>
              </select>
            </label>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white transition hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
              <span>{saving ? 'Creating...' : 'Create campaign'}</span>
            </button>
          </form>
        </section>

        <section className="rounded-[32px] border border-black/5 bg-white p-8 shadow-sm">
          <div className="mb-6">
            <h2 className="text-xl font-bold">Campaigns and seller entries</h2>
            <p className="text-sm text-slate-500">Approve seller products before they appear on the public flash sale page.</p>
          </div>

          <div className="space-y-6">
            {activeCampaigns.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                No flash sale campaigns yet.
              </div>
            ) : (
              activeCampaigns.map((campaign) => (
                <div key={campaign.id} className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">{campaign.title}</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {new Date(campaign.starts_at).toLocaleString()} to {new Date(campaign.ends_at).toLocaleString()}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-700">
                      {campaign.status}
                    </span>
                  </div>

                  <div className="mt-4 space-y-4">
                    {(campaign.entries || []).length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                        No seller entries submitted yet.
                      </div>
                    ) : (
                      (campaign.entries || []).map((entry) => (
                        <div
                          id={`admin-flash-entry-${entry.id}`}
                          key={entry.id}
                          className={`rounded-2xl border border-slate-200 bg-white p-4 ${
                            entry.id === focusedEntryId ? 'border-indigo-300 ring-2 ring-indigo-200 bg-indigo-50/30' : ''
                          }`}
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-1">
                              <h4 className="font-semibold text-slate-900">{entry.product?.name || 'Product entry'}</h4>
                              <p className="text-sm text-slate-500">
                                Seller {entry.seller_name || entry.product?.seller_name || 'Unknown'} â€¢ Base {formatPrice(entry.product?.price || 0)} â€¢ Sale {formatPrice(entry.sale_price)}
                              </p>
                              <p className="text-sm text-slate-500">Allocated stock {entry.allocated_stock}</p>
                              {entry.note ? <p className="text-sm text-slate-600">{entry.note}</p> : null}
                              {entry.rejection_reason ? (
                                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                                  {entry.rejection_reason}
                                </div>
                              ) : null}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-700">
                                {entry.status}
                              </span>
                              <button
                                onClick={() => void handleReview(entry.id, 'approved')}
                                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                              >
                                <CheckCircle2 size={14} />
                                <span>Approve</span>
                              </button>
                              <button
                                onClick={() => void handleReview(entry.id, 'rejected')}
                                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700"
                              >
                                <XCircle size={14} />
                                <span>Reject</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
