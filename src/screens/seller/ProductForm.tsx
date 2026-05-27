import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from '@/src/lib/navigation';
import { Save, X, Loader2, AlertCircle, Image as ImageIcon, Plus, Trash2 } from 'lucide-react';
import { useUser } from '../../context/UserContext';
import CloudinaryUpload from '../../components/media/CloudinaryUpload';
import type { ProductSpecification, ProductVariantOption, ProductVariantValue } from '../../types';
import { insertAroundSelection, renderProductDescription } from '../../lib/product-description';

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

      navigate('/seller/products');
    } catch (err: any) {
      setError(err.message);
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
      emoji: ' ✅',
    };

    const inserted = snippets[type];
    const nextValue = `${formData.description}${inserted}`;
    setFormData((current) => ({ ...current, description: nextValue }));
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(nextValue.length, nextValue.length);
    });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{isEdit ? 'Edit Product' : 'Add New Product'}</h1>
          <p className="text-sm text-gray-500">Fill in the details below to {isEdit ? 'update' : 'list'} your product</p>
        </div>
        <button 
          onClick={() => navigate('/seller/products')}
          className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={24} />
        </button>
      </div>

      {error && (
        <div className="bg-accent/10 text-accent p-4 rounded-xl flex items-center space-x-2">
          <AlertCircle size={20} />
          <p className="text-sm font-bold">{error}</p>
        </div>
      )}

      {!sellerApproved && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your seller account is not approved yet. Products can be created and edited, but they stay private in draft mode until admin approval.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm space-y-4">
              <h3 className="font-bold text-sm uppercase tracking-wider text-gray-500">Product Image</h3>
              <div className="aspect-square bg-bg-light rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 space-y-2">
                {formData.image ? (
                  <img src={formData.image} alt="preview" className="w-full h-full object-cover rounded-xl" />
                ) : (
                  <ImageIcon size={40} />
                )}
              </div>
              <CloudinaryUpload
                label="Upload with Cloudinary"
                helper="Uploads store securely; we'll use the returned secure_url."
                onUploaded={(url) => setFormData({ ...formData, image: url })}
              />
              <p className="text-[10px] text-gray-400 text-center">Recommended size: 800x800px. Max 2MB.</p>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase">Manual Image URL (Optional)</label>
                <input 
                  type="url"
                  value={formData.image}
                  onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                  placeholder="Paste an existing hosted image only if you already have one"
                  className="w-full bg-bg-light border-none rounded-lg py-2 px-3 text-xs focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase">Gallery Images</label>
                <div className="space-y-3">
                  <CloudinaryUpload
                    label="Add gallery image"
                    helper="Add extra product photos for thumbnails and detailed product viewing."
                    onUploaded={(url) =>
                      setFormData((current) => ({
                        ...current,
                        gallery_images: current.gallery_images.includes(url)
                          ? current.gallery_images
                          : [...current.gallery_images, url],
                      }))
                    }
                  />
                  {formData.gallery_images.length > 0 ? (
                    <div className="grid grid-cols-3 gap-3">
                      {formData.gallery_images.map((url, index) => (
                        <div key={`${url}-${index}`} className="space-y-2">
                          <div className="aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                            <img src={url} alt={`Gallery ${index + 1}`} className="h-full w-full object-cover" />
                          </div>
                          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                            <span>Position {index + 1}</span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => moveGalleryImage(index, index - 1)}
                                disabled={index === 0}
                                className="rounded-md border border-slate-200 px-2 py-1 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Up
                              </button>
                              <button
                                type="button"
                                onClick={() => moveGalleryImage(index, index + 1)}
                                disabled={index === formData.gallery_images.length - 1}
                                className="rounded-md border border-slate-200 px-2 py-1 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Down
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="url"
                              value={url}
                              onChange={(e) =>
                                setFormData((current) => ({
                                  ...current,
                                  gallery_images: current.gallery_images.map((item, itemIndex) =>
                                    itemIndex === index ? e.target.value : item,
                                  ),
                                }))
                              }
                              className="min-w-0 flex-1 rounded-lg bg-bg-light px-3 py-2 text-[11px] focus:ring-2 focus:ring-primary/20"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setFormData((current) => ({
                                  ...current,
                                  gallery_images: current.gallery_images.filter((_, itemIndex) => itemIndex !== index),
                                }))
                              }
                              className="rounded-lg border border-rose-200 px-2 py-2 text-rose-600 transition hover:bg-rose-50"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-400">No extra gallery images added yet.</p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase">Product Video URL (Optional)</label>
                <input 
                  type="url"
                  value={formData.video_url}
                  onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                  placeholder="Paste your hosted product video URL"
                  className="w-full bg-bg-light border-none rounded-lg py-2 px-3 text-xs focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase">3D Model URL (GLB)</label>
                <input 
                  type="url"
                  value={formData.model_3d}
                  onChange={(e) => setFormData({ ...formData, model_3d: e.target.value })}
                  placeholder="Paste your hosted .glb model URL"
                  className="w-full bg-bg-light border-none rounded-lg py-2 px-3 text-xs focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="space-y-6 rounded-2xl border border-black/5 bg-white p-5 shadow-sm sm:p-8">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Product Name</label>
                <input 
                  type="text" 
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Premium Cotton Panjabi"
                  className="w-full bg-bg-light border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Category</label>
                  <select 
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-bg-light border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-primary/20"
                  >
                    <option>Fashion</option>
                    <option>Electronics</option>
                    <option>Groceries</option>
                    <option>Home & Living</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Price (BDT)</label>
                  <input 
                    type="number" 
                    required
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0.00"
                    className="w-full bg-bg-light border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Stock Quantity</label>
                  <input 
                    type="number" 
                    required
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    placeholder="0"
                    className="w-full bg-bg-light border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">SKU (Optional)</label>
                  <input
                    type="text"
                    readOnly
                    value={formData.sku || buildSkuPreview(formData.name, formData.category)}
                    className="w-full bg-bg-light border-none rounded-xl py-3 px-4 text-gray-500 focus:ring-2 focus:ring-primary/20"
                  />
                  <p className="text-[11px] text-gray-400">SKU auto-generates when the product is saved.</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Description</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: 'bold', label: 'Bold' },
                    { key: 'italic', label: 'Italic' },
                    { key: 'bullet', label: 'Bullets' },
                    { key: 'table', label: 'Table' },
                    { key: 'emoji', label: 'Emoji' },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => applyDescriptionFormat(item.key as 'bold' | 'italic' | 'bullet' | 'table' | 'emoji')}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      {item.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowDescriptionPreview((current) => !current)}
                    className="rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/10"
                  >
                    {showDescriptionPreview ? 'Hide preview' : 'Show preview'}
                  </button>
                </div>
                <textarea 
                  id="product-description-field"
                  rows={5}
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Use **bold**, *italic*, bullet lists, tables, and emoji like ✅"
                  className="w-full bg-bg-light border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-primary/20"
                />
                <p className="text-[11px] text-gray-500">
                  Safe rich description support: bold, italic, bullet list, table, and emoji. Raw HTML is not allowed.
                </p>
                {showDescriptionPreview ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Preview</p>
                    <div
                      className="mt-3 space-y-4"
                      dangerouslySetInnerHTML={{ __html: descriptionPreview || '<p class="text-sm text-slate-500">Description preview will appear here.</p>' }}
                    />
                  </div>
                ) : null}
              </div>

              <div className="space-y-4 rounded-2xl border border-dashed border-slate-200 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Product Specifications</label>
                    <p className="mt-1 text-xs text-gray-500">
                      Add category-wise details like color, weight, size, warranty, dimensions, or material.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((current) => ({
                        ...current,
                        specifications: [...current.specifications, { label: '', value: '' }],
                      }))
                    }
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
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
                        className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-200"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ) : null}

                {formData.specifications.length === 0 ? (
                  <p className="text-sm text-gray-500">No specifications added yet.</p>
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
                          className="w-full rounded-xl bg-bg-light px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20"
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
                          className="w-full rounded-xl bg-bg-light px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setFormData((current) => ({
                              ...current,
                              specifications: current.specifications.filter((_, itemIndex) => itemIndex !== index),
                            }))
                          }
                          className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-3 text-slate-500 transition hover:bg-slate-50"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Reseller Sales</label>
                    <p className="mt-1 text-xs text-gray-600">
                      Enable this if resellers can add this product to their shop and sell above your reseller base price.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
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
                        className="w-full rounded-xl bg-white px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20"
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
                        className="w-full rounded-xl bg-white px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-xs font-bold text-gray-500 uppercase">Reseller notes</label>
                      <textarea
                        rows={3}
                        value={formData.reseller_notes}
                        onChange={(e) => setFormData({ ...formData, reseller_notes: e.target.value })}
                        placeholder="Tell resellers how to pitch or position this product"
                        className="w-full rounded-xl bg-white px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="space-y-4 rounded-2xl border border-dashed border-slate-200 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Variant Options</label>
                    <p className="mt-1 text-xs text-gray-500">
                      Add simple options like Size, Color, or Storage. These options appear on the product page.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((current) => ({
                        ...current,
                        variant_options: [...current.variant_options, { name: '', values: [{ label: '', price_adjustment: 0, sku_suffix: null, stock_override: null }] }],
                      }))
                    }
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <Plus size={14} />
                    <span>Add option</span>
                  </button>
                </div>

                {formData.variant_options.length === 0 ? (
                  <p className="text-sm text-gray-500">No variants yet. Add options if this product comes in multiple versions.</p>
                ) : (
                  <div className="space-y-4">
                    {formData.variant_options.map((variant, index) => (
                      <div key={`variant-${index}`} className="rounded-2xl bg-bg-light p-4">
                        <div className="grid gap-4 md:grid-cols-[0.8fr_1.2fr_auto] md:items-end">
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase">Option name</label>
                            <input
                              type="text"
                              value={variant.name}
                              onChange={(e) => updateVariant(index, { name: e.target.value })}
                              placeholder="Size"
                              className="w-full rounded-xl border-none bg-white px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase">Values</label>
                            <div className="space-y-3 rounded-xl bg-white p-3">
                              {variant.values.map((value, valueIndex) => (
                                <div key={`variant-${index}-value-${valueIndex}`} className="grid gap-3 lg:grid-cols-[1.1fr_0.8fr_0.7fr_0.8fr_auto]">
                                  <input
                                    type="text"
                                    value={value.label}
                                    onChange={(e) => updateVariantValue(index, valueIndex, { label: e.target.value })}
                                    placeholder="Blue"
                                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20"
                                  />
                                  <input
                                    type="number"
                                    value={value.price_adjustment ?? 0}
                                    onChange={(e) => updateVariantValue(index, valueIndex, { price_adjustment: Number(e.target.value) || 0 })}
                                    placeholder="0"
                                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20"
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
                                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20"
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
                                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20"
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
                                    className="inline-flex items-center justify-center rounded-xl border border-rose-200 px-3 py-3 text-rose-600 transition hover:bg-rose-50"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              ))}
                              <div className="grid gap-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400 lg:grid-cols-[1.1fr_0.8fr_0.7fr_0.8fr_auto]">
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
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
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
                                      {value.label}: {buildVariantSkuPreview(formData.sku || buildSkuPreview(formData.name, formData.category), value.sku_suffix)}
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
                            className="inline-flex items-center justify-center rounded-xl border border-rose-200 px-3 py-3 text-rose-600 transition hover:bg-rose-50"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end space-x-4">
              <button 
                type="button"
                onClick={() => navigate('/seller/products')}
                className="px-8 py-3 border border-gray-200 rounded-xl font-bold hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button 
                type="submit"
                disabled={loading}
                className="btn-primary px-10 py-3 flex items-center space-x-2 disabled:opacity-50"
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
