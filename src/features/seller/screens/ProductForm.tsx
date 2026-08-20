import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from '../../../lib/navigation';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BadgeDollarSign,
  Box,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Layers3,
  Loader2,
  PackageCheck,
  Plus,
  Save,
  Sparkles,
  Tags,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { useUser } from '../../../features/shared/state/UserContext';
import CloudinaryUpload from '@/features/shared/media/CloudinaryUpload';
import type { ProductSpecification, ProductVariantOption, ProductVariantValue } from '../../../types';
import { insertAroundSelection, renderProductDescription } from '../../../lib/product-description';
import toast from '@/lib/toast';

const CATEGORY_SPEC_TEMPLATES: Record<string, string[]> = {
  Fashion: ['Color', 'Size', 'Fabric', 'Fit'],
  Electronics: ['Brand', 'Color', 'Storage', 'Warranty'],
  Groceries: ['Weight', 'Pack Size', 'Expiry'],
  'Home & Living': ['Color', 'Dimensions', 'Weight', 'Material'],
};

function normalizeSpecificationsForForm(specifications: any[]): ProductSpecification[] {
  if (!Array.isArray(specifications)) return [];
  return specifications
    .map((item) => ({
      label: String(item?.label || '').trim(),
      value: String(item?.value || '').trim(),
    }))
    .filter((item) => item.label && item.value);
}

function normalizeVariantOptionsForForm(options: any[]): ProductVariantOption[] {
  if (!Array.isArray(options)) return [];

  return options
    .map((option) => ({
      name: String(option?.name || '').trim(),
      values: Array.isArray(option?.values)
        ? option.values
            .map((value: any) => {
              if (typeof value === 'string') {
                const label = value.trim();
                return label ? { label, price_adjustment: 0, sku_suffix: null, stock_override: null } : null;
              }

              const label = String(value?.label || '').trim();
              if (!label) return null;

              return {
                label,
                price_adjustment: Number(value?.price_adjustment ?? value?.priceAdjustment ?? 0) || 0,
                stock_override:
                  value?.stock_override === null || typeof value?.stock_override === 'undefined' || value?.stock_override === ''
                    ? null
                    : Number(value.stock_override),
                sku_suffix: String(value?.sku_suffix ?? value?.skuSuffix ?? '').trim() || null,
              };
            })
            .filter(Boolean) as ProductVariantValue[]
        : [],
    }))
    .filter((option) => option.name && option.values.length > 0);
}

function buildSkuPreview(name: string, category: string) {
  const cleanedCategory = String(category || '').replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 3);
  if (cleanedCategory.length >= 2) {
    return `${cleanedCategory}-AUTO`;
  }
  const initials = String(name || '')
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/gi, '').toUpperCase())
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .slice(0, 3);
  return `${(initials || cleanedCategory || 'PRD').padEnd(3, 'X')}-AUTO`;
}

function buildVariantSkuPreview(baseSku: string, suffix?: string | null) {
  const cleanBase = String(baseSku || '').trim();
  const cleanSuffix = String(suffix || '').trim().toUpperCase();
  if (!cleanBase) return 'SKU after save';
  return cleanSuffix ? `${cleanBase}-${cleanSuffix}` : cleanBase;
}

export const SellerProductForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, user } = useUser();
  const isEdit = !!id;
  const sellerApproved = user?.seller_status === 'approved';

  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    category: 'Fashion',
    price: '',
    stock: '',
    description: '',
    image: '',
    gallery_images: [] as string[],
    video_url: '',
    model_3d: '',
    variant_options: [] as ProductVariantOption[],
    specifications: [] as ProductSpecification[],
    reseller_enabled: false,
    reseller_base_price: '',
    reseller_suggested_price: '',
    reseller_notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);
  const [error, setError] = useState('');
  const [showDescriptionPreview, setShowDescriptionPreview] = useState(false);

  useEffect(() => {
    if (isEdit && token) {
      fetch(`/api/seller/products/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
        .then(res => res.json())
        .then(data => {
          if (data.error) throw new Error(data.error);
          setFormData({
            sku: data.sku || '',
            name: data.name,
            category: data.category,
            price: data.price.toString(),
            stock: data.stock.toString(),
            description: data.description,
            image: data.image,
            gallery_images: Array.isArray(data.gallery_images) ? data.gallery_images.filter((item: unknown) => typeof item === 'string') : [],
            video_url: data.video_url || '',
            model_3d: data.model_3d || '',
            variant_options: normalizeVariantOptionsForForm(data.variant_options),
            specifications: normalizeSpecificationsForForm(data.specifications),
            reseller_enabled: Boolean(data.reseller_enabled),
            reseller_base_price: data.reseller_base_price?.toString?.() || '',
            reseller_suggested_price: data.reseller_suggested_price?.toString?.() || '',
            reseller_notes: data.reseller_notes || '',
          });
        })
        .catch(err => setError(err.message))
        .finally(() => setFetching(false));
    }
  }, [id, isEdit, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const url = isEdit ? `/api/products/${id}` : '/api/products';
      const method = isEdit ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          price: parseFloat(formData.price),
          stock: parseInt(formData.stock),
          gallery_images: formData.gallery_images.filter(Boolean),
          reseller_base_price: formData.reseller_base_price ? parseFloat(formData.reseller_base_price) : null,
          reseller_suggested_price: formData.reseller_suggested_price ? parseFloat(formData.reseller_suggested_price) : null,
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save product');

      toast.success(isEdit ? 'Product updated' : 'Product created');
      navigate('/seller/products');
    } catch (err: any) {
      setError(err.message);
      toast.error(err instanceof Error ? err.message : 'Failed to save product');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-primary" size={32} />
    </div>
  );

  const updateVariant = (index: number, next: Partial<ProductVariantOption>) => {
    setFormData((current) => ({
      ...current,
      variant_options: current.variant_options.map((variant, variantIndex) =>
        variantIndex === index ? { ...variant, ...next } : variant,
      ),
    }));
  };

  const updateVariantValue = (variantIndex: number, valueIndex: number, next: Partial<ProductVariantValue>) => {
    setFormData((current) => ({
      ...current,
      variant_options: current.variant_options.map((variant, currentVariantIndex) =>
        currentVariantIndex === variantIndex
          ? {
              ...variant,
              values: variant.values.map((value, currentValueIndex) =>
                currentValueIndex === valueIndex ? { ...value, ...next } : value,
              ),
            }
          : variant,
      ),
    }));
  };

  const moveGalleryImage = (fromIndex: number, toIndex: number) => {
    setFormData((current) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= current.gallery_images.length ||
        toIndex >= current.gallery_images.length ||
        fromIndex === toIndex
      ) {
        return current;
      }

      const nextGalleryImages = [...current.gallery_images];
      const [movedItem] = nextGalleryImages.splice(fromIndex, 1);
      nextGalleryImages.splice(toIndex, 0, movedItem);

      return {
        ...current,
        gallery_images: nextGalleryImages,
      };
    });
  };

  const categorySpecSuggestions = CATEGORY_SPEC_TEMPLATES[formData.category] || [];
  const descriptionPreview = renderProductDescription(formData.description);
  const applyDescriptionFormat = (type: 'bold' | 'italic' | 'bullet' | 'table' | 'emoji') => {
    const element = document.getElementById('product-description-field') as HTMLTextAreaElement | null;
    if (!element) return;

    const selectionStart = element.selectionStart ?? formData.description.length;
    const selectionEnd = element.selectionEnd ?? formData.description.length;

    if (type === 'bold') {
      const next = insertAroundSelection(formData.description, selectionStart, selectionEnd, '**');
      setFormData((current) => ({ ...current, description: next.nextValue }));
      requestAnimationFrame(() => {
        element.focus();
        element.setSelectionRange(next.nextSelectionStart, next.nextSelectionEnd);
      });
      return;
    }

    if (type === 'italic') {
      const next = insertAroundSelection(formData.description, selectionStart, selectionEnd, '*');
      setFormData((current) => ({ ...current, description: next.nextValue }));
      requestAnimationFrame(() => {
        element.focus();
        element.setSelectionRange(next.nextSelectionStart, next.nextSelectionEnd);
      });
      return;
    }

    const snippets: Record<'bullet' | 'table' | 'emoji', string> = {
      bullet: '\n- Feature one\n- Feature two\n- Feature three',
      table: '\n| Feature | Details |\n| --- | --- |\n| Material | Premium |\n| Size | Standard |',
      emoji: ' check',
    };

    const inserted = snippets[type];
    const nextValue = `${formData.description}${inserted}`;
    setFormData((current) => ({ ...current, description: nextValue }));
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(nextValue.length, nextValue.length);
    });
  };

  const baseSkuPreview = formData.sku || buildSkuPreview(formData.name, formData.category);
  const completedBasics = [formData.name, formData.category, formData.price, formData.stock, formData.description].filter(Boolean).length;
  const mediaCount = [formData.image, formData.video_url, formData.model_3d, ...formData.gallery_images].filter(Boolean).length;
  const variantValueCount = formData.variant_options.reduce((total, option) => total + option.values.filter((value) => value.label.trim()).length, 0);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-24">
      <div className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/10 bg-primary/5 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
              <Sparkles size={14} />
              <span>{isEdit ? 'Listing editor' : 'New listing'}</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              {isEdit ? 'Edit Product' : 'Add New Product'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Build a clean, trust-ready product page with media, pricing, rich details, variants, and reseller controls in one workspace.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => navigate('/seller/products')}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowLeft size={16} />
              <span>Products</span>
            </button>
            <button
              type="submit"
              form="seller-product-form"
              disabled={loading}
              className="btn-primary inline-flex h-11 items-center justify-center gap-2 px-5 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              <span>{isEdit ? 'Update Product' : 'Publish Product'}</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-accent/20 bg-accent/10 p-4 text-accent">
          <AlertCircle size={20} />
          <p className="text-sm font-bold">{error}</p>
        </div>
      )}

      {!sellerApproved && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Your seller account is not approved yet. Products can be created and edited, but they stay private in draft mode until admin approval.
        </div>
      )}

      <form id="seller-product-form" onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
            <div className="rounded-[1.5rem] border border-black/5 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Media Studio</h2>
                  <p className="mt-1 text-xs text-slate-500">First image becomes the product cover.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{mediaCount} assets</span>
              </div>
              <div className="aspect-square overflow-hidden rounded-2xl border border-dashed border-slate-200 bg-slate-50">
                {formData.image ? (
                  <img src={formData.image} alt="Product cover preview" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
                    <ImageIcon size={42} />
                    <span className="text-xs font-semibold">Upload a square cover image</span>
                  </div>
                )}
              </div>
              <div className="mt-4 space-y-4">
                <CloudinaryUpload
                  label="Upload cover image"
                  helper="Use a clean 800x800px image for best product cards."
                  onUploaded={(url) => setFormData({ ...formData, image: url })}
                />
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Manual Image URL</label>
                  <input
                    type="url"
                    value={formData.image}
                    onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                    placeholder="Paste hosted image URL"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-black/5 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Listing Health</h2>
                  <p className="mt-1 text-xs text-slate-500">Quick checks before publishing.</p>
                </div>
                <PackageCheck className="text-primary" size={20} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[11px] font-bold uppercase text-slate-400">Basics</p>
                  <p className="mt-1 text-lg font-black text-slate-950">{completedBasics}/5</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[11px] font-bold uppercase text-slate-400">Specs</p>
                  <p className="mt-1 text-lg font-black text-slate-950">{formData.specifications.length}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[11px] font-bold uppercase text-slate-400">Variants</p>
                  <p className="mt-1 text-lg font-black text-slate-950">{variantValueCount}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[11px] font-bold uppercase text-slate-400">SKU</p>
                  <p className="mt-1 truncate text-sm font-black text-slate-950">{baseSkuPreview}</p>
                </div>
              </div>
            </div>
          </aside>

          <div className="space-y-6">
            <section className="rounded-[1.5rem] border border-black/5 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-6 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Box size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-950">Product Basics</h2>
                  <p className="mt-1 text-sm text-slate-500">Name, category, price, stock, SKU, and buyer-facing story.</p>
                </div>
              </div>

              <div className="grid gap-5">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Product Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Premium Cotton Panjabi"
                    className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm focus:bg-white focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Category</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm focus:bg-white focus:ring-2 focus:ring-primary/20"
                    >
                      <option>Fashion</option>
                      <option>Electronics</option>
                      <option>Groceries</option>
                      <option>Home & Living</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Price (BDT)</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      placeholder="0.00"
                      className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm focus:bg-white focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Stock Quantity</label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={formData.stock}
                      onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                      placeholder="0"
                      className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm focus:bg-white focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">SKU</label>
                    <input
                      type="text"
                      readOnly
                      value={baseSkuPreview}
                      className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-500 focus:ring-2 focus:ring-primary/20"
                    />
                    <p className="text-xs text-slate-500">SKU auto-generates when the product is saved.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <label className="text-sm font-semibold text-slate-700">Description</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { key: 'bold', label: 'B' },
                        { key: 'italic', label: 'I' },
                        { key: 'bullet', label: 'Bullets' },
                        { key: 'table', label: 'Table' },
                        { key: 'emoji', label: 'Tag' },
                      ].map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          title={`Insert ${item.key}`}
                          onClick={() => applyDescriptionFormat(item.key as 'bold' | 'italic' | 'bullet' | 'table' | 'emoji')}
                          className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                        >
                          {item.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setShowDescriptionPreview((current) => !current)}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary/15 bg-primary/5 px-3 text-xs font-bold text-primary transition hover:bg-primary/10"
                      >
                        {showDescriptionPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                        <span>{showDescriptionPreview ? 'Hide' : 'Preview'}</span>
                      </button>
                    </div>
                  </div>
                  <textarea
                    id="product-description-field"
                    rows={6}
                    required
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe material, fit, use cases, care, warranty, and what makes this product worth buying."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 focus:bg-white focus:ring-2 focus:ring-primary/20"
                  />
                  <p className="text-xs text-slate-500">Supports bold, italic, bullet lists, tables, and short highlights. Raw HTML is not allowed.</p>
                  {showDescriptionPreview ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Customer preview</p>
                      <div
                        className="mt-3 space-y-4 text-sm leading-6 text-slate-700"
                        dangerouslySetInnerHTML={{ __html: descriptionPreview || '<p class="text-sm text-slate-500">Description preview will appear here.</p>' }}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-black/5 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                  <ImageIcon size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-950">Gallery And Rich Media</h2>
                  <p className="mt-1 text-sm text-slate-500">Add extra photos, a video link, or a GLB model for richer product pages.</p>
                </div>
              </div>

              <div className="space-y-5">
                <CloudinaryUpload
                  label="Add gallery image"
                  helper="Use detail shots, packaging, scale, and lifestyle images."
                  onUploaded={(url) =>
                    setFormData((current) => ({
                      ...current,
                      gallery_images: current.gallery_images.includes(url) ? current.gallery_images : [...current.gallery_images, url],
                    }))
                  }
                />

                {formData.gallery_images.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {formData.gallery_images.map((url, index) => (
                      <div key={`${url}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <div className="aspect-square overflow-hidden rounded-xl bg-white">
                          <img src={url} alt={`Gallery ${index + 1}`} className="h-full w-full object-cover" />
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-500">Image {index + 1}</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              title="Move up"
                              onClick={() => moveGalleryImage(index, index - 1)}
                              disabled={index === 0}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              type="button"
                              title="Move down"
                              onClick={() => moveGalleryImage(index, index + 1)}
                              disabled={index === formData.gallery_images.length - 1}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <ArrowDown size={14} />
                            </button>
                            <button
                              type="button"
                              title="Remove image"
                              onClick={() =>
                                setFormData((current) => ({
                                  ...current,
                                  gallery_images: current.gallery_images.filter((_, itemIndex) => itemIndex !== index),
                                }))
                              }
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-600 transition hover:bg-rose-50"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <input
                          type="url"
                          value={url}
                          onChange={(e) =>
                            setFormData((current) => ({
                              ...current,
                              gallery_images: current.gallery_images.map((item, itemIndex) => (itemIndex === index ? e.target.value : item)),
                            }))
                          }
                          className="mt-3 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    No gallery images added yet.
                  </div>
                )}

                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Product Video URL</label>
                    <input
                      type="url"
                      value={formData.video_url}
                      onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                      placeholder="Paste hosted product video URL"
                      className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm focus:bg-white focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">3D Model URL (GLB)</label>
                    <input
                      type="url"
                      value={formData.model_3d}
                      onChange={(e) => setFormData({ ...formData, model_3d: e.target.value })}
                      placeholder="Paste hosted .glb model URL"
                      className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm focus:bg-white focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-black/5 bg-white p-5 shadow-sm sm:p-6">
                <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                      <Tags size={20} />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-slate-950">Product Specifications</h2>
                      <p className="mt-1 text-sm text-slate-500">
                      Add category-wise details like color, weight, size, warranty, dimensions, or material.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((current) => ({
                        ...current,
                        specifications: [...current.specifications, { label: '', value: '' }],
                      }))
                    }
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                  >
                    <Plus size={14} />
                    <span>Add spec</span>
                  </button>
                </div>

                {categorySpecSuggestions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {categorySpecSuggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() =>
                          setFormData((current) => {
                            if (current.specifications.some((item) => item.label.toLowerCase() === suggestion.toLowerCase())) {
                              return current;
                            }
                            return {
                              ...current,
                              specifications: [...current.specifications, { label: suggestion, value: '' }],
                            };
                          })
                        }
                        className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-600 transition hover:bg-slate-200"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ) : null}

                {formData.specifications.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    No specifications added yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {formData.specifications.map((specification, index) => (
                      <div key={`spec-${index}`} className="grid gap-3 md:grid-cols-[0.8fr_1.2fr_auto]">
                        <input
                          type="text"
                          value={specification.label}
                          onChange={(e) =>
                            setFormData((current) => ({
                              ...current,
                              specifications: current.specifications.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, label: e.target.value } : item,
                              ),
                            }))
                          }
                          placeholder="Spec label"
                          className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm focus:bg-white focus:ring-2 focus:ring-primary/20"
                        />
                        <input
                          type="text"
                          value={specification.value}
                          onChange={(e) =>
                            setFormData((current) => ({
                              ...current,
                              specifications: current.specifications.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, value: e.target.value } : item,
                              ),
                            }))
                          }
                          placeholder="Spec value"
                          className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm focus:bg-white focus:ring-2 focus:ring-primary/20"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setFormData((current) => ({
                              ...current,
                              specifications: current.specifications.filter((_, itemIndex) => itemIndex !== index),
                            }))
                          }
                          className="inline-flex h-11 items-center justify-center rounded-xl border border-rose-200 px-3 text-rose-600 transition hover:bg-rose-50"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-5 rounded-[1.5rem] border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600">
                      <BadgeDollarSign size={20} />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-slate-950">Reseller Sales</h2>
                      <p className="mt-1 text-sm text-slate-600">
                      Enable this if resellers can add this product to their shop and sell above your reseller base price.
                      </p>
                    </div>
                  </div>
                  <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-slate-700 shadow-sm">
                    <input
                      type="checkbox"
                      checked={formData.reseller_enabled}
                      onChange={(e) => setFormData({ ...formData, reseller_enabled: e.target.checked })}
                    />
                    <span>Allow resellers</span>
                  </label>
                </div>

                {formData.reseller_enabled ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase">Reseller base price</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.reseller_base_price}
                        onChange={(e) => setFormData({ ...formData, reseller_base_price: e.target.value })}
                        placeholder="Minimum seller price for reseller orders"
                        className="h-12 w-full rounded-xl border border-emerald-100 bg-white px-4 text-sm focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase">Suggested reseller sale price</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.reseller_suggested_price}
                        onChange={(e) => setFormData({ ...formData, reseller_suggested_price: e.target.value })}
                        placeholder="Optional guidance for resellers"
                        className="h-12 w-full rounded-xl border border-emerald-100 bg-white px-4 text-sm focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-xs font-bold text-gray-500 uppercase">Reseller notes</label>
                      <textarea
                        rows={3}
                        value={formData.reseller_notes}
                        onChange={(e) => setFormData({ ...formData, reseller_notes: e.target.value })}
                        placeholder="Tell resellers how to pitch or position this product"
                        className="w-full rounded-xl border border-emerald-100 bg-white px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="rounded-[1.5rem] border border-black/5 bg-white p-5 shadow-sm sm:p-6">
                <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                      <Layers3 size={20} />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-slate-950">Variant Options</h2>
                      <p className="mt-1 text-sm text-slate-500">
                      Add simple options like Size, Color, or Storage. These options appear on the product page.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((current) => ({
                        ...current,
                        variant_options: [...current.variant_options, { name: '', values: [{ label: '', price_adjustment: 0, sku_suffix: null, stock_override: null }] }],
                      }))
                    }
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                  >
                    <Plus size={14} />
                    <span>Add option</span>
                  </button>
                </div>

                {formData.variant_options.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    No variants yet. Add options if this product comes in multiple versions.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {formData.variant_options.map((variant, index) => (
                      <div key={`variant-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_auto] xl:items-start">
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase">Option name</label>
                            <input
                              type="text"
                              value={variant.name}
                              onChange={(e) => updateVariant(index, { name: e.target.value })}
                              placeholder="Size"
                              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm focus:ring-2 focus:ring-primary/20"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase">Values</label>
                            <div className="space-y-3 rounded-xl bg-white p-3">
                              {variant.values.map((value, valueIndex) => (
                                <div key={`variant-${index}-value-${valueIndex}`} className="grid gap-3 lg:grid-cols-[1.1fr_0.75fr_0.75fr_0.85fr_auto]">
                                  <input
                                    type="text"
                                    value={value.label}
                                    onChange={(e) => updateVariantValue(index, valueIndex, { label: e.target.value })}
                                    placeholder="Blue"
                                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm focus:ring-2 focus:ring-primary/20"
                                  />
                                  <input
                                    type="number"
                                    value={value.price_adjustment ?? 0}
                                    onChange={(e) => updateVariantValue(index, valueIndex, { price_adjustment: Number(e.target.value) || 0 })}
                                    placeholder="0"
                                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm focus:ring-2 focus:ring-primary/20"
                                  />
                                  <input
                                    type="text"
                                    value={value.sku_suffix || ''}
                                    onChange={(e) =>
                                      updateVariantValue(index, valueIndex, {
                                        sku_suffix: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') || null,
                                      })
                                    }
                                    placeholder="BLU"
                                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm focus:ring-2 focus:ring-primary/20"
                                  />
                                  <input
                                    type="number"
                                    value={value.stock_override ?? ''}
                                    onChange={(e) =>
                                      updateVariantValue(index, valueIndex, {
                                        stock_override: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0),
                                      })
                                    }
                                    placeholder="Base stock"
                                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm focus:ring-2 focus:ring-primary/20"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setFormData((current) => ({
                                        ...current,
                                        variant_options: current.variant_options.map((currentVariant, currentVariantIndex) =>
                                          currentVariantIndex === index
                                            ? {
                                                ...currentVariant,
                                                values: currentVariant.values.filter((_, currentValueIndex) => currentValueIndex !== valueIndex),
                                              }
                                            : currentVariant,
                                        ),
                                      }))
                                    }
                                    className="inline-flex h-11 items-center justify-center rounded-xl border border-rose-200 px-3 text-rose-600 transition hover:bg-rose-50"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              ))}
                              <div className="hidden gap-3 text-[11px] font-bold uppercase tracking-wide text-gray-400 lg:grid lg:grid-cols-[1.1fr_0.75fr_0.75fr_0.85fr_auto]">
                                <span>Value label</span>
                                <span>Price adjust</span>
                                <span>SKU suffix</span>
                                <span>Stock override</span>
                                <span />
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setFormData((current) => ({
                                    ...current,
                                    variant_options: current.variant_options.map((currentVariant, currentVariantIndex) =>
                                      currentVariantIndex === index
                                        ? {
                                            ...currentVariant,
                                            values: [
                                              ...currentVariant.values,
                                              { label: '', price_adjustment: 0, sku_suffix: null, stock_override: null },
                                            ],
                                          }
                                        : currentVariant,
                                    ),
                                  }))
                                }
                                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                              >
                                <Plus size={14} />
                                <span>Add value</span>
                              </button>
                              <div className="flex flex-wrap gap-2 pt-1">
                                {variant.values
                                  .filter((value) => String(value.label || '').trim())
                                  .map((value, valueIndex) => (
                                    <span
                                      key={`variant-preview-${index}-${valueIndex}`}
                                      className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600"
                                    >
                                      {value.label}: {buildVariantSkuPreview(baseSkuPreview, value.sku_suffix)}
                                    </span>
                                  ))}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setFormData((current) => ({
                                ...current,
                                variant_options: current.variant_options.filter((_, variantIndex) => variantIndex !== index),
                              }))
                            }
                            className="inline-flex h-11 items-center justify-center rounded-xl border border-rose-200 bg-white px-3 text-rose-600 transition hover:bg-rose-50"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

            <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-2xl border border-black/5 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => navigate('/seller/products')}
                className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 px-6 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary inline-flex h-12 items-center justify-center gap-2 px-8 disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                <span>{isEdit ? 'Update Product' : 'Publish Product'}</span>
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
