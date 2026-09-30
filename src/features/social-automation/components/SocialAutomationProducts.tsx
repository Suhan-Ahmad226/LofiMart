import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarClock, Eye, Facebook, PackageSearch, RefreshCw, Search, Send, Sparkles, X, Zap } from 'lucide-react';
import { useUser } from '@/features/shared/state/UserContext';
import { SellerEmptyState, SellerPageHeader } from '@/features/seller/components/SellerPageHeader';
import { TableSkeleton } from '@/features/shared/ui/DataSkeletons';
import OptimizedImage from '@/features/shared/ui/OptimizedImage';
import { formatPrice } from '@/lib/utils';
import toast from '@/lib/toast';

type SocialAutomation = {
  id: string;
  schedule_label: string;
  next_run_at: string;
  status: string;
};

type SocialProduct = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number | null;
  old_price: number | null;
  image: string | null;
  gallery_images: unknown[];
  category: string | null;
  stock: number;
  product_status: string;
  automation: SocialAutomation | null;
};

type DashboardDefaults = {
  account: {
    account_name: string | null;
    connected: boolean;
  };
  settings: {
    ai_caption_enabled: boolean;
    default_interval_days: number;
    default_posting_time: string;
    default_duration_mode: 'forever' | 'number_of_posts' | 'until_date';
    default_max_posts: number | null;
    default_end_at: string | null;
    generate_new_caption_every_time: boolean;
    use_latest_product_data: boolean;
    skip_out_of_stock: boolean;
  };
};

type PostForm = {
  postingType: 'one_time' | 'recurring';
  scheduleMode: 'now' | 'scheduled';
  date: string;
  time: string;
  intervalDays: number;
  durationMode: 'forever' | 'number_of_posts' | 'until_date';
  maxPosts: number;
  endDate: string;
  caption: string;
  generateCaption: boolean;
  generateNewCaption: boolean;
  useLatestProductData: boolean;
  skipOutOfStock: boolean;
};

const intervalOptions = [1, 2, 3, 4, 5] as const;

function isDashboardDefaults(value: unknown): value is DashboardDefaults {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'account' in value &&
      'settings' in value,
  );
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(value: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-BD', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function buildIso(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

function createDefaultForm(defaults: DashboardDefaults | null): PostForm {
  return {
    postingType: 'recurring',
    scheduleMode: 'scheduled',
    date: todayInputValue(),
    time: defaults?.settings.default_posting_time || '20:00',
    intervalDays: defaults?.settings.default_interval_days || 3,
    durationMode: defaults?.settings.default_duration_mode || 'forever',
    maxPosts: defaults?.settings.default_max_posts || 5,
    endDate: defaults?.settings.default_end_at?.slice(0, 10) || '',
    caption: '',
    generateCaption: false,
    generateNewCaption: defaults?.settings.generate_new_caption_every_time ?? true,
    useLatestProductData: defaults?.settings.use_latest_product_data ?? true,
    skipOutOfStock: defaults?.settings.skip_out_of_stock ?? true,
  };
}

function ProductPostModal({
  product,
  defaults,
  token,
  onClose,
  onCreated,
}: {
  product: SocialProduct;
  defaults: DashboardDefaults | null;
  token: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<PostForm>(() => createDefaultForm(defaults));
  const [submitting, setSubmitting] = useState(false);
  const [generatingCaption, setGeneratingCaption] = useState(false);
  const [regeneratingCaption, setRegeneratingCaption] = useState(false);
  const [generatedCaption, setGeneratedCaption] = useState<string | null>(null);
  const [captionError, setCaptionError] = useState<string | null>(null);
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [captionEditMode, setCaptionEditMode] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [idempotencyKey] = useState(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `sap-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  const connected = Boolean(defaults?.account.connected);
  const postingNow = form.postingType === 'one_time' && form.scheduleMode === 'now';
  const blockedByStock = postingNow && form.skipOutOfStock && product.stock <= 0;
  const blockedByConnection = postingNow && !connected;

  const updateForm = <Key extends keyof PostForm>(key: Key, value: PostForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleGenerateCaption = async () => {
    setGeneratingCaption(true);
    setCaptionError(null);
    setGeneratedCaption(null);
    setShowRegenerate(true);
    setCaptionEditMode(false);
    try {
      const response = await fetch('/api/social-automation/posts/generate-caption', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ productId: product.id }),
      });
      const data = (await response.json().catch(() => null)) as { ok: boolean; caption?: string; message?: string; code?: string } | null;
      if (!response.ok || !data?.ok) {
        setCaptionError(data?.message || 'Failed to generate caption.');
        return;
      }
      setGeneratedCaption(data.caption ?? '');
      updateForm('caption', data.caption ?? '');
    } catch {
      setCaptionError('Failed to generate caption.');
    } finally {
      setGeneratingCaption(false);
    }
  };

  const handleRegenerateCaption = async () => {
    setRegeneratingCaption(true);
    setCaptionError(null);
    try {
      const response = await fetch('/api/social-automation/posts/generate-caption', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ productId: product.id }),
      });
      const data = (await response.json().catch(() => null)) as { ok: boolean; caption?: string; message?: string; code?: string } | null;
      if (!response.ok || !data?.ok) {
        setCaptionError(data?.message || 'Failed to regenerate caption.');
        return;
      }
      setGeneratedCaption(data.caption ?? '');
      updateForm('caption', data.caption ?? '');
      setCaptionEditMode(false);
    } catch {
      setCaptionError('Failed to regenerate caption.');
    } finally {
      setRegeneratingCaption(false);
    }
  };

  const submit = async () => {
    if (blockedByStock || blockedByConnection) return;
    setSubmitting(true);
    try {
      const response = await fetch('/api/social-automation/posts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: product.id,
          postingType: form.postingType,
          scheduleMode: form.scheduleMode,
          scheduledAt: form.scheduleMode === 'scheduled' ? buildIso(form.date, form.time) : null,
          intervalDays: form.postingType === 'recurring' ? form.intervalDays : undefined,
          durationMode: form.durationMode,
          maxPosts: form.durationMode === 'number_of_posts' ? form.maxPosts : null,
          endAt: form.durationMode === 'until_date' && form.endDate ? buildIso(form.endDate, form.time) : null,
          caption: form.caption || null,
          generateCaption: generatedCaption !== null,
          generateNewCaption: form.generateNewCaption,
          useLatestProductData: form.useLatestProductData,
          skipOutOfStock: form.skipOutOfStock,
          idempotencyKey: form.postingType === 'one_time' && form.scheduleMode === 'now' ? idempotencyKey : undefined,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        kind?: string;
        duplicate?: boolean;
        post?: { status?: string; error_message?: string | null };
      } | null;
      if (!response.ok || data?.error) throw new Error(data?.error || 'Failed to create post.');
      if (data?.post?.status === 'FAILED') {
        throw new Error(data.post.error_message || 'Facebook publishing failed. Please try again.');
      }
      if (data?.kind === 'automation') {
        toast.success('Recurring automation created.');
      } else if (data?.duplicate) {
        toast.success(data?.post?.status === 'PUBLISHED' ? 'Post already published.' : 'Post already created.');
      } else {
        toast.success(form.scheduleMode === 'now' ? 'Post published to Facebook.' : 'Post scheduled.');
      }
      onCreated();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create post.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="post-product-title" className="fixed inset-0 z-50">
      <button type="button" aria-label="Close post product" onClick={onClose} className="absolute inset-0 bg-slate-950/45" />
      <div className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl md:inset-y-6 md:left-auto md:right-6 md:w-[30rem] md:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
          <h2 id="post-product-title" className="text-lg font-black text-slate-950">Post Product</h2>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <section className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-center gap-3">
              <Facebook size={20} className="text-[#1877f2]" />
              <div>
                <p className="text-sm font-bold text-slate-950">{defaults?.account.account_name || 'Facebook Page'}</p>
                <p className={`text-xs font-semibold ${defaults?.account.connected ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {defaults?.account.connected ? 'Connected' : 'Disconnected'}
                </p>
              </div>
            </div>
          </section>

          <section className="flex gap-3 rounded-xl border border-slate-100 p-3">
            <OptimizedImage src={product.image} alt={product.name} widthHint={96} heightHint={96} className="h-16 w-16 rounded-lg object-cover bg-slate-100" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-950">{product.name}</p>
              <p className="mt-1 text-sm font-bold text-primary">{formatPrice(Number(product.price || 0))}</p>
              <p className="mt-1 text-xs text-slate-500">Stock: {product.stock}</p>
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="rounded-xl border border-slate-100 p-3 text-sm font-semibold">
              <input type="radio" checked={form.postingType === 'one_time'} onChange={() => updateForm('postingType', 'one_time')} className="mr-2" />
              One Time
            </label>
            <label className="rounded-xl border border-slate-100 p-3 text-sm font-semibold">
              <input type="radio" checked={form.postingType === 'recurring'} onChange={() => updateForm('postingType', 'recurring')} className="mr-2" />
              Recurring
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="rounded-xl border border-slate-100 p-3 text-sm font-semibold">
              <input type="radio" checked={form.scheduleMode === 'now'} onChange={() => updateForm('scheduleMode', 'now')} className="mr-2" />
              Post Now
            </label>
            <label className="rounded-xl border border-slate-100 p-3 text-sm font-semibold">
              <input type="radio" checked={form.scheduleMode === 'scheduled'} onChange={() => updateForm('scheduleMode', 'scheduled')} className="mr-2" />
              Schedule
            </label>
          </div>

          {form.scheduleMode === 'scheduled' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-semibold text-slate-700">
                <span>Date</span>
                <input type="date" value={form.date} onChange={(event) => updateForm('date', event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3" />
              </label>
              <label className="space-y-2 text-sm font-semibold text-slate-700">
                <span>Time</span>
                <input type="time" value={form.time} onChange={(event) => updateForm('time', event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3" />
              </label>
            </div>
          ) : null}

          {form.postingType === 'recurring' ? (
            <>
              <label className="space-y-2 text-sm font-semibold text-slate-700">
                <span>Repeat</span>
                <select value={form.intervalDays} onChange={(event) => updateForm('intervalDays', Number(event.target.value))} className="h-11 w-full rounded-xl border border-slate-200 px-3">
                  {intervalOptions.map((value) => <option key={value} value={value}>Every {value} Day{value === 1 ? '' : 's'}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm font-semibold text-slate-700">
                <span>Duration</span>
                <select value={form.durationMode} onChange={(event) => updateForm('durationMode', event.target.value as PostForm['durationMode'])} className="h-11 w-full rounded-xl border border-slate-200 px-3">
                  <option value="forever">Forever</option>
                  <option value="number_of_posts">Number of Posts</option>
                  <option value="until_date">Until Date</option>
                </select>
              </label>
              {form.durationMode === 'number_of_posts' ? (
                <input type="number" min={1} max={365} value={form.maxPosts} onChange={(event) => updateForm('maxPosts', Number(event.target.value))} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" />
              ) : null}
              {form.durationMode === 'until_date' ? (
                <input type="date" value={form.endDate} onChange={(event) => updateForm('endDate', event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" />
              ) : null}
            </>
          ) : null}

          <label className="space-y-2 text-sm font-semibold text-slate-700">
            <span>AI Caption</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleGenerateCaption}
                disabled={generatingCaption || regeneratingCaption}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <Sparkles size={16} />
                <span>{generatingCaption ? 'Generating...' : regeneratingCaption ? 'Regenerating...' : 'Generate with AI'}</span>
              </button>
              {showRegenerate && generatedCaption ? (
                <>
                  <button
                    type="button"
                    onClick={handleRegenerateCaption}
                    disabled={regeneratingCaption}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    <RefreshCw size={16} className={regeneratingCaption ? 'animate-spin' : ''} />
                    <span>Regenerate</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCaptionEditMode((v) => !v)}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <span>{captionEditMode ? 'Done' : 'Edit'}</span>
                  </button>
                </>
              ) : null}
            </div>
          </label>

          {generatedCaption || captionError ? (
            <div className={`rounded-xl border p-4 text-sm ${captionError ? 'border-rose-100 bg-rose-50 text-rose-700' : 'border-emerald-100 bg-emerald-50 text-emerald-700'}`}>
              {captionError ? (
                <p>{captionError}</p>
              ) : (
                <p className="whitespace-pre-wrap">{generatedCaption}</p>
              )}
            </div>
          ) : null}

          {captionEditMode && generatedCaption ? (
            <textarea
              value={form.caption}
              onChange={(event) => updateForm('caption', event.target.value)}
              placeholder="Edit your caption..."
              className="min-h-28 w-full rounded-xl border border-slate-200 p-3 text-sm"
            />
          ) : null}

          {!captionEditMode ? (
            <textarea value={form.caption} onChange={(event) => updateForm('caption', event.target.value)} placeholder="AI generated caption or custom caption..." className="min-h-28 w-full rounded-xl border border-slate-200 p-3 text-sm" />
          ) : null}

          <div className="grid gap-2 text-sm font-semibold text-slate-700">
            {[
              ['generateNewCaption', 'Generate new caption every cycle'],
              ['useLatestProductData', 'Use latest product data'],
              ['skipOutOfStock', 'Skip if out of stock'],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                <input
                  type="checkbox"
                  checked={Boolean(form[key as keyof PostForm])}
                  onChange={(event) => updateForm(key as keyof PostForm, event.target.checked as never)}
                  className="h-4 w-4"
                />
                {label}
              </label>
            ))}
          </div>

          <section className="rounded-xl border border-slate-100 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-slate-950">Preview</p>
              <button
                type="button"
                onClick={() => setShowPreview((value) => !value)}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                <Eye size={16} />
                <span>{showPreview ? 'Hide Preview' : 'Show Preview'}</span>
              </button>
            </div>
            {showPreview ? (
              <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1877f2] text-white">
                    <Facebook size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-950">{defaults?.account.account_name || 'Facebook Page'}</p>
                    <p className="text-xs text-slate-500">
                      {form.scheduleMode === 'now' ? 'Now' : new Date(`${form.date}T${form.time}`).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-sm text-slate-800">
                  {form.caption || `Check out ${product.name} — ${formatPrice(Number(product.price || 0))}. Shop now at ${window.location.origin}/product/...`}
                </p>
                <OptimizedImage src={product.image} alt={product.name} widthHint={480} heightHint={480} className="h-64 w-full rounded-lg object-cover bg-slate-100" />
                <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
                  <p className="truncate text-sm font-bold text-slate-950">{product.name}</p>
                  <p className="shrink-0 text-sm font-bold text-primary">{formatPrice(Number(product.price || 0))}</p>
                </div>
              </div>
            ) : null}
          </section>

          {blockedByStock ? (
            <div className="flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
              <AlertCircle size={18} />
              This product is out of stock and "Skip if out of stock" is enabled, so it will not be published.
            </div>
          ) : null}
          {blockedByConnection ? (
            <div className="flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
              <AlertCircle size={18} />
              Connect a Facebook Page before publishing a post right away.
            </div>
          ) : null}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-100 bg-white p-5">
          <button type="button" onClick={onClose} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={submitting || blockedByStock || blockedByConnection} className="btn-primary inline-flex h-11 items-center gap-2 px-5 disabled:opacity-60">
            <Send size={16} />
            <span>{submitting ? 'Creating' : postingNow ? 'Publish Now' : 'Create Post'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function SocialAutomationProducts() {
  const { token } = useUser();
  const [products, setProducts] = useState<SocialProduct[]>([]);
  const [defaults, setDefaults] = useState<DashboardDefaults | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<SocialProduct | null>(null);
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'out_of_stock'>('all');
  const [automationFilter, setAutomationFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProducts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');

    try {
      const [productsResponse, dashboardResponse] = await Promise.all([
        fetch('/api/social-automation/products', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/social-automation', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const productsPayload = (await productsResponse.json().catch(() => null)) as SocialProduct[] | { error?: string } | null;
      const dashboardPayload = (await dashboardResponse.json().catch(() => null)) as unknown;
      if (!productsResponse.ok || !Array.isArray(productsPayload)) throw new Error('Failed to load products.');
      if (dashboardResponse.ok && isDashboardDefaults(dashboardPayload)) setDefaults(dashboardPayload);
      setProducts(productsPayload);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Failed to load products.';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        const query = search.trim().toLowerCase();
        const matchesSearch =
          !query ||
          product.name.toLowerCase().includes(query) ||
          String(product.category || '').toLowerCase().includes(query) ||
          product.slug.toLowerCase().includes(query);
        const matchesStock =
          stockFilter === 'all' || (stockFilter === 'in_stock' ? product.stock > 0 : product.stock <= 0);
        const matchesAutomation =
          automationFilter === 'all' ||
          (automationFilter === 'active' ? Boolean(product.automation) : !product.automation);
        return matchesSearch && matchesStock && matchesAutomation;
      }),
    [automationFilter, products, search, stockFilter],
  );

  return (
    <div className="space-y-6">
      <SellerPageHeader
        eyebrow="Social Automation > Products"
        title="Social Products"
        description="Select existing seller products and schedule Facebook posts or recurring automations."
      />

      {error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          <AlertCircle size={18} />
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px]">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products..." className="h-11 w-full rounded-xl border border-slate-200 pl-10 pr-4 text-sm" />
          </label>
          <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value as typeof stockFilter)} className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold">
            <option value="all">All stock</option>
            <option value="in_stock">In stock</option>
            <option value="out_of_stock">Out of stock</option>
          </select>
          <select value={automationFilter} onChange={(event) => setAutomationFilter(event.target.value as typeof automationFilter)} className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold">
            <option value="all">Automation</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
        {loading ? (
          <div className="p-4">
            <TableSkeleton rows={5} columns={6} />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-5">
            <SellerEmptyState message="No products found. Try changing your search or filters." />
          </div>
        ) : (
          <>
            <div className="space-y-3 p-4 md:hidden">
              {filteredProducts.map((product) => (
                <article key={product.id} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
                  <OptimizedImage src={product.image} alt={product.name} widthHint={420} heightHint={260} className="aspect-[16/10] w-full rounded-xl object-cover bg-slate-100" />
                  <h2 className="mt-3 text-base font-black text-slate-950">{product.name}</h2>
                  <p className="mt-1 text-sm font-bold text-primary">{formatPrice(Number(product.price || 0))}</p>
                  <p className="mt-1 text-xs text-slate-500">Stock: {product.stock}</p>
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-700">
                    <CalendarClock size={16} />
                    <span>{product.automation ? `${product.automation.schedule_label}, next ${formatDateTime(product.automation.next_run_at)}` : 'No automation'}</span>
                  </div>
                  <button type="button" onClick={() => setSelectedProduct(product)} className="btn-primary mt-4 inline-flex h-11 w-full items-center justify-center gap-2">
                    <Send size={16} />
                    <span>POST</span>
                  </button>
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Image</th>
                    <th className="px-5 py-3">Product</th>
                    <th className="px-5 py-3">Price</th>
                    <th className="px-5 py-3">Stock</th>
                    <th className="px-5 py-3">Automation</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <OptimizedImage src={product.image} alt={product.name} widthHint={96} heightHint={96} className="h-12 w-12 rounded-lg object-cover bg-slate-100" />
                      </td>
                      <td className="px-5 py-4">
                        <p className="max-w-[260px] truncate font-bold text-slate-950">{product.name}</p>
                        <p className="text-xs text-slate-500">{product.category || 'Uncategorized'}</p>
                      </td>
                      <td className="px-5 py-4 font-bold text-primary">
                        {formatPrice(Number(product.price || 0))}
                        {product.old_price && product.old_price > Number(product.price || 0) ? (
                          <span className="ml-2 text-xs font-semibold text-slate-400 line-through">{formatPrice(Number(product.old_price))}</span>
                        ) : null}
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-700">{product.stock}</td>
                      <td className="px-5 py-4">
                        {product.automation ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                            <Zap size={13} />
                            {product.automation.schedule_label}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">
                            <PackageSearch size={13} />
                            -
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button type="button" onClick={() => setSelectedProduct(product)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black text-white">
                          <Send size={14} />
                          POST
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {selectedProduct && token ? (
        <ProductPostModal
          product={selectedProduct}
          defaults={defaults}
          token={token}
          onClose={() => setSelectedProduct(null)}
          onCreated={loadProducts}
        />
      ) : null}
    </div>
  );
}
