import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from '../../../lib/navigation';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BadgeDollarSign,
  Bold,
  Box,
  ChevronDown,
  Eye,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
  Italic,
  Layers3,
  List,
  ListOrdered,
  Loader2,
  PackageCheck,
  Plus,
  Save,
  Smile,
  Sparkles,
  TableProperties,
  Tags,
  Trash2,
  X,
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

  const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Could not read selected file.'));
    };
    reader.onerror = () => reject(new Error('Could not read selected file.'));
    reader.readAsDataURL(file);
  });

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
    <div className="min-h-screen bg-[#f7f9fb] text-[#191c1e]">
      {error && (
        <div className="mx-auto max-w-7xl px-4 pt-4">
          <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        </div>
      )}

      {!sellerApproved && (
        <div className="mx-auto max-w-7xl px-4 pt-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            Your seller account is not approved yet. Products can be created and edited, but they stay private in draft mode until admin approval.
          </div>
        </div>
      )}

      <form id="seller-product-form" onSubmit={handleSubmit} className="mx-auto w-full max-w-7xl p-4 md:p-6">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col">
            <h1 className="text-3xl font-bold text-[#191c1e]">{isEdit ? 'Edit Product' : 'Add New Product'}</h1>
            <div className="mt-2 flex items-center gap-2 text-sm text-[#505f76]">
              <button type="button" onClick={() => navigate('/seller/products')} className="hover:text-[#004ac6] transition-colors">
                Products
              </button>
              <ArrowRight className="h-3.5 w-3.5 text-[#505f76]" />
              <span className="text-[#191c1e]">{isEdit ? 'Edit Product' : 'Add New Product'}</span>
            </div>
          </div>

          <div className="flex w-full items-center gap-3 sm:w-auto">
            <button
              type="button"
              onClick={() => navigate('/seller/products')}
              className="flex-1 rounded-lg border border-[#c3c6d7] bg-white px-6 py-2.5 text-sm font-medium text-[#191c1e] transition-colors hover:bg-[#f2f4f6] sm:flex-none"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#004ac6] px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#003ea8] disabled:opacity-60 sm:flex-none"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              <span>{isEdit ? 'Update Product' : 'Publish Product'}</span>
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <aside className="lg:col-span-4">
            <section className="rounded-xl border border-[#c3c6d7] bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-[#191c1e]">Media</h3>

              <div className="mb-6">
                <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-[#c3c6d7] bg-[#f2f4f6] transition-colors hover:border-[#004ac6] hover:bg-white">
                  {formData.image ? (
                    <>
                      <img src={formData.image} alt="Cover preview" className="aspect-square h-full w-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity hover:opacity-100">
                        <label className="cursor-pointer rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#191c1e] shadow-sm">
                          Change image
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              try {
                                const result = await readFileAsDataUrl(file);
                                setFormData((current) => ({ ...current, image: result }));
                              } catch (error) {
                                setError(error instanceof Error ? error.message : 'Could not read image preview.');
                              } finally {
                                e.target.value = '';
                              }
                            }}
                          />
                        </label>
                      </div>
                    </>
                  ) : (
                    <label className="group block cursor-pointer">
                      <div className="flex aspect-square w-full flex-col items-center justify-center p-6 text-center">
                        <ImageIcon className="mb-2 h-10 w-10 text-[#505f76] transition-colors group-hover:text-[#004ac6]" />
                        <p className="mb-1 text-sm font-semibold text-[#191c1e]">Upload Image</p>
                        <p className="text-xs text-[#505f76]">Drag and drop or click to upload</p>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const result = await readFileAsDataUrl(file);
                            setFormData((current) => ({ ...current, image: result }));
                          } catch (error) {
                            setError(error instanceof Error ? error.message : 'Could not read image preview.');
                          } finally {
                            e.target.value = '';
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>

              <div className="mb-6">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-[#191c1e]">Gallery</h4>
                  <span className="text-xs text-[#505f76]">({formData.gallery_images.length}/8)</span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {formData.gallery_images.length > 0 ? (
                    formData.gallery_images.slice(0, 5).map((url, index) => (
                      <div key={`${url}-${index}`} className="group relative aspect-square overflow-hidden rounded-lg border border-[#c3c6d7]">
                        <img src={url} alt={`Gallery ${index + 1}`} className="h-full w-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() =>
                              setFormData((current) => ({
                                ...current,
                                gallery_images: current.gallery_images.filter((_, itemIndex) => itemIndex !== index),
                              }))
                            }
                            className="rounded-md bg-white p-1 text-[#505f76] hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">Pos {index + 1}</div>
                      </div>
                    ))
                  ) : null}

                  <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[#c3c6d7] bg-[#f2f4f6] text-[#505f76] transition-colors hover:border-[#004ac6] hover:bg-white group">
                    <Plus className="h-5 w-5 text-[#505f76] group-hover:text-[#004ac6]" />
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || []);
                        if (!files.length) return;

                        try {
                          const nextUrls = await Promise.all(files.map(async (file) => readFileAsDataUrl(file)));
                          setFormData((current) => ({
                            ...current,
                            gallery_images: [...current.gallery_images, ...nextUrls.filter((url) => !current.gallery_images.includes(url))].slice(0, 8),
                          }));
                        } catch (error) {
                          setError(error instanceof Error ? error.message : 'Could not read gallery image preview.');
                        } finally {
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-4 border-t border-[#c3c6d7] pt-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#505f76]">Video URL</label>
                  <input
                    type="url"
                    value={formData.video_url}
                    onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                    placeholder="https://youtube.com/..."
                    className="w-full rounded-lg border border-[#c3c6d7] bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-[#004ac6] focus:ring-1 focus:ring-[#004ac6]"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#505f76]">3D Model (.glb) URL</label>
                  <input
                    type="url"
                    value={formData.model_3d}
                    onChange={(e) => setFormData({ ...formData, model_3d: e.target.value })}
                    placeholder="https://..."
                    className="w-full rounded-lg border border-[#c3c6d7] bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-[#004ac6] focus:ring-1 focus:ring-[#004ac6]"
                  />
                </div>
              </div>
            </section>
          </aside>

          <div className="space-y-6 lg:col-span-8">
            <section className="rounded-xl border border-[#c3c6d7] bg-white p-6 shadow-sm">
              <h3 className="mb-6 text-lg font-semibold text-[#191c1e]">Product Details</h3>

              <div className="space-y-6">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-[#505f76]">
                    Product Name <span className="text-[#ba1a1a]">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Premium Cotton Panjabi"
                    className="w-full rounded-lg border border-[#c3c6d7] bg-white px-4 py-2.5 text-base outline-none transition-all focus:border-[#004ac6] focus:ring-2 focus:ring-[#004ac6]/20"
                  />
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-[#505f76]">
                      Category <span className="text-[#ba1a1a]">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="w-full cursor-pointer appearance-none rounded-lg border border-[#c3c6d7] bg-white px-4 py-2.5 text-sm text-[#191c1e] outline-none transition-all focus:border-[#004ac6] focus:ring-2 focus:ring-[#004ac6]/20"
                      >
                        <option>Fashion</option>
                        <option>Electronics</option>
                        <option>Groceries</option>
                        <option>Home &amp; Living</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#505f76]" />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-[#505f76]">
                      Price (BDT) <span className="text-[#ba1a1a]">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#505f76] font-medium">৳</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                        placeholder="0.00"
                        className="w-full rounded-lg border border-[#c3c6d7] bg-white pl-8 pr-4 py-2.5 text-sm outline-none transition-all focus:border-[#004ac6] focus:ring-2 focus:ring-[#004ac6]/20"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-[#505f76]">
                      Stock Quantity <span className="text-[#ba1a1a]">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.stock}
                      onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                      placeholder="0"
                      className="w-full rounded-lg border border-[#c3c6d7] bg-white px-4 py-2.5 text-sm outline-none transition-all focus:border-[#004ac6] focus:ring-2 focus:ring-[#004ac6]/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-[#505f76]">SKU</label>
                  <div className="flex w-full items-center justify-between rounded-lg border border-[#c3c6d7] bg-[#f2f4f6] px-4 py-2.5 text-sm text-[#505f76]">
                    <span>SKU: {baseSkuPreview || 'AUTOGENERATED'}</span>
                    <span className="rounded bg-[#e0e3e5] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-tighter text-[#191c1e]">Preview</span>
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="block text-sm font-semibold text-[#505f76]">Description</label>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-[#c3c6d7] transition-all focus-within:border-[#004ac6] focus-within:ring-2 focus-within:ring-[#004ac6]/20">
                    <div className="flex items-center justify-between gap-2 overflow-x-auto border-b border-[#c3c6d7] bg-[#f2f4f6] px-4 py-2">
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => applyDescriptionFormat('bold')} className="rounded p-1.5 text-[#505f76] transition-colors hover:bg-[#e0e3e5]" aria-label="Bold text">
                          <Bold className="h-5 w-5" />
                        </button>
                        <button type="button" onClick={() => applyDescriptionFormat('italic')} className="rounded p-1.5 text-[#505f76] transition-colors hover:bg-[#e0e3e5]" aria-label="Italic text">
                          <Italic className="h-5 w-5" />
                        </button>
                        <div className="mx-1 h-5 w-px bg-[#c3c6d7]" />
                        <button type="button" onClick={() => applyDescriptionFormat('bullet')} className="rounded p-1.5 text-[#505f76] transition-colors hover:bg-[#e0e3e5]" aria-label="Bullet list">
                          <List className="h-5 w-5" />
                        </button>
                        <button type="button" className="rounded p-1.5 text-[#505f76] transition-colors hover:bg-[#e0e3e5]" aria-label="Numbered list">
                          <ListOrdered className="h-5 w-5" />
                        </button>
                        <div className="mx-1 h-5 w-px bg-[#c3c6d7]" />
                        <button type="button" className="rounded p-1.5 text-[#505f76] transition-colors hover:bg-[#e0e3e5]" aria-label="Insert table">
                          <TableProperties className="h-5 w-5" />
                        </button>
                        <button type="button" className="rounded p-1.5 text-[#505f76] transition-colors hover:bg-[#e0e3e5]" aria-label="Insert emoji">
                          <Smile className="h-5 w-5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs font-medium text-[#505f76]">Show Preview</span>
                        <button
                          type="button"
                          onClick={() => setShowDescriptionPreview((current) => !current)}
                          className={`relative h-4 w-8 rounded-full transition-colors ${showDescriptionPreview ? 'bg-[#004ac6]' : 'bg-[#c3c6d7]'}`}
                        >
                          <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all ${showDescriptionPreview ? 'left-4' : 'left-0.5'}`} />
                        </button>
                      </div>
                    </div>
                    <textarea
                      id="product-description-field"
                      rows={6}
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Enter detailed product description..."
                      className="min-h-[160px] w-full resize-y border-none bg-white px-4 py-3 text-sm outline-none"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-dashed border-[#c3c6d7] bg-white p-6">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="text-base font-semibold text-[#191c1e]">Product Specifications</h3>
                <button
                  type="button"
                  onClick={() => setFormData((current) => ({ ...current, specifications: [...current.specifications, { label: '', value: '' }] }))}
                  className="flex items-center gap-1.5 rounded-lg border border-[#c3c6d7] px-4 py-1.5 text-xs font-semibold text-[#505f76] transition-colors hover:bg-[#f2f4f6]"
                >
                  <Plus className="h-4 w-4" /> Add Spec
                </button>
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                <span className="mb-1 block w-full text-[10px] font-bold uppercase tracking-wider text-[#505f76]">Common Specs</span>
                {categorySpecSuggestions.map((suggestion) => (
                  <button
                    type="button"
                    key={suggestion}
                    onClick={() => {
                      const exists = formData.specifications.some((item) => item.label.toLowerCase() === suggestion.toLowerCase());
                      if (!exists) {
                        setFormData((current) => ({ ...current, specifications: [...current.specifications, { label: suggestion, value: '' }] }));
                      }
                    }}
                    className="rounded-full bg-[#f2f4f6] px-3 py-1 text-xs text-[#191c1e] transition-colors hover:bg-[#e0e3e5]"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              {formData.specifications.length === 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <input value="Fabric" readOnly className="w-full rounded-lg border border-[#c3c6d7] bg-white px-4 py-2 text-sm" />
                    </div>
                    <div className="flex-1">
                      <input value="Cotton" readOnly className="w-full rounded-lg border border-[#c3c6d7] bg-white px-4 py-2 text-sm" />
                    </div>
                    <button type="button" className="p-2 text-[#505f76] hover:text-red-600">
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <input placeholder="Spec Key (e.g. Size)" readOnly className="w-full rounded-lg border border-[#c3c6d7] bg-white px-4 py-2 text-sm placeholder:text-[#505f76]/70" />
                    </div>
                    <div className="flex-1">
                      <input placeholder="Spec Value (e.g. XL)" readOnly className="w-full rounded-lg border border-[#c3c6d7] bg-white px-4 py-2 text-sm placeholder:text-[#505f76]/70" />
                    </div>
                    <button type="button" className="p-2 text-[#505f76] hover:text-red-600">
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {formData.specifications.map((specification, index) => (
                    <div key={`spec-${index}`} className="flex items-center gap-4">
                      <div className="flex-1">
                        <input
                          type="text"
                          value={specification.label}
                          onChange={(e) =>
                            setFormData((current) => ({
                              ...current,
                              specifications: current.specifications.map((item, itemIndex) => (itemIndex === index ? { ...item, label: e.target.value } : item)),
                            }))
                          }
                          className="w-full rounded-lg border border-[#c3c6d7] bg-white px-4 py-2 text-sm outline-none focus:border-[#004ac6] focus:ring-1 focus:ring-[#004ac6]/20"
                          placeholder="Spec Key"
                        />
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          value={specification.value}
                          onChange={(e) =>
                            setFormData((current) => ({
                              ...current,
                              specifications: current.specifications.map((item, itemIndex) => (itemIndex === index ? { ...item, value: e.target.value } : item)),
                            }))
                          }
                          className="w-full rounded-lg border border-[#c3c6d7] bg-white px-4 py-2 text-sm outline-none focus:border-[#004ac6] focus:ring-1 focus:ring-[#004ac6]/20"
                          placeholder="Spec Value"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData((current) => ({ ...current, specifications: current.specifications.filter((_, itemIndex) => itemIndex !== index) }))}
                        className="p-2 text-[#505f76] hover:text-red-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="relative overflow-hidden rounded-xl border border-[#bfe0cb] bg-[#edf9f2] p-6">
              <div className="absolute left-0 top-0 h-full w-1.5 bg-[#007d55]" />
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-[#005236]">Reseller Sales</h3>
                  <p className="text-xs font-medium text-[#006242]">Allow authorized resellers to sell this product</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold uppercase text-[#005236]">Allow resellers</span>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, reseller_enabled: !formData.reseller_enabled })}
                    className={`relative h-6 w-11 rounded-full transition-colors ${formData.reseller_enabled ? 'bg-[#007d55]' : 'bg-[#d0e1fb]'}`}
                  >
                    <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-md transition-all ${formData.reseller_enabled ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>
              </div>

              {formData.reseller_enabled && (
                <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#005236]">Reseller Base Price</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#505f76] font-medium">৳</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.reseller_base_price}
                        onChange={(e) => setFormData({ ...formData, reseller_base_price: e.target.value })}
                        placeholder="0.00"
                        className="w-full rounded-lg border border-[#bfe0cb] bg-white pl-8 pr-4 py-2.5 text-sm outline-none transition-all focus:border-[#007d55] focus:ring-1 focus:ring-[#007d55]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#005236]">Suggested Sale Price</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#505f76] font-medium">৳</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.reseller_suggested_price}
                        onChange={(e) => setFormData({ ...formData, reseller_suggested_price: e.target.value })}
                        placeholder="0.00"
                        className="w-full rounded-lg border border-[#bfe0cb] bg-white pl-8 pr-4 py-2.5 text-sm outline-none transition-all focus:border-[#007d55] focus:ring-1 focus:ring-[#007d55]"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#005236]">Reseller Notes</label>
                    <textarea
                      rows={2}
                      value={formData.reseller_notes}
                      onChange={(e) => setFormData({ ...formData, reseller_notes: e.target.value })}
                      placeholder="Additional info for resellers..."
                      className="w-full resize-y rounded-lg border border-[#bfe0cb] bg-white px-4 py-3 text-sm outline-none transition-all focus:border-[#007d55] focus:ring-1 focus:ring-[#007d55]"
                    />
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-dashed border-[#c3c6d7] bg-white p-6">
              <div className="mb-6 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[#191c1e]">Variant Options</h3>
                <button
                  type="button"
                  onClick={() => setFormData((current) => ({ ...current, variant_options: [...current.variant_options, { name: 'Size', values: [{ label: '', price_adjustment: 0, sku_suffix: null, stock_override: null }] }] }))}
                  className="flex items-center gap-1.5 rounded-lg border border-[#004ac6]/20 bg-[#004ac6]/5 px-4 py-2 text-sm font-semibold text-[#004ac6] transition-colors hover:bg-[#004ac6]/10"
                >
                  <Plus className="h-5 w-5" /> Add Option
                </button>
              </div>

              {formData.variant_options.length === 0 ? (
                <div className="space-y-6">
                  <div className="rounded-xl border border-[#c3c6d7]/50 bg-[#f2f4f6]/50 p-5">
                    <div className="mb-4 flex items-center justify-between border-b border-[#c3c6d7]/30 pb-4">
                      <div className="flex items-center gap-3">
                        <GripVertical className="h-4 w-4 text-[#505f76]" />
                        <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#191c1e]">Option: Size</span>
                      </div>
                      <button type="button" className="text-[#505f76] hover:text-red-600" aria-label="Delete option">
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-4">
                        <div className="md:col-span-1">
                          <label className="mb-1 block text-[10px] font-bold uppercase text-[#505f76]">Value</label>
                          <input value="M" readOnly className="w-full rounded-lg border border-[#c3c6d7] bg-white px-3 py-2 text-sm" />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-bold uppercase text-[#505f76]">Price Adjust</label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#505f76] text-xs">+৳</span>
                            <input placeholder="0" readOnly className="w-full rounded-lg border border-[#c3c6d7] bg-white pl-8 pr-2 py-2 text-sm" />
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-bold uppercase text-[#505f76]">Stock Override</label>
                          <input placeholder="Same as main" readOnly className="w-full rounded-lg border border-[#c3c6d7] bg-white px-3 py-2 text-sm" />
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <label className="mb-1 block text-[10px] font-bold uppercase text-[#505f76]">SKU Suffix</label>
                            <input placeholder="-M" readOnly className="w-full rounded-lg border border-[#c3c6d7] bg-white px-3 py-2 text-sm" />
                          </div>
                          <button type="button" className="mt-5 p-1.5 text-[#505f76] hover:text-red-600" aria-label="Remove value">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <button type="button" className="flex items-center gap-2 py-2 text-xs font-bold text-[#004ac6] hover:underline">
                        <Plus className="h-4 w-4" /> Add Value
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {formData.variant_options.map((variant, variantIndex) => (
                    <div key={`variant-${variantIndex}`} className="rounded-xl border border-[#c3c6d7] bg-[#f2f4f6]/40 p-5">
                      <div className="mb-4 flex items-center justify-between border-b border-[#c3c6d7]/30 pb-4">
                        <div className="flex items-center gap-3">
                          <GripVertical className="h-4 w-4 text-[#505f76]" />
                          <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#191c1e]">Option: {variant.name || 'New Option'}</span>
                        </div>
                        <button type="button" onClick={() => setFormData((current) => ({ ...current, variant_options: current.variant_options.filter((_, index) => index !== variantIndex) }))} className="text-[#505f76] hover:text-red-600" aria-label="Delete option">
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>

                      <div className="space-y-4">
                        <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-4">
                          <div>
                            <label className="mb-1 block text-[10px] font-bold uppercase text-[#505f76]">Value</label>
                            <input
                              type="text"
                              value={variant.values[0]?.label || ''}
                              onChange={(e) => updateVariantValue(variantIndex, 0, { label: e.target.value })}
                              className="w-full rounded-lg border border-[#c3c6d7] bg-white px-3 py-2 text-sm outline-none focus:border-[#004ac6] focus:ring-1 focus:ring-[#004ac6]/20"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] font-bold uppercase text-[#505f76]">Price Adjust</label>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#505f76] text-xs">+৳</span>
                              <input
                                type="number"
                                value={variant.values[0]?.price_adjustment ?? 0}
                                onChange={(e) => updateVariantValue(variantIndex, 0, { price_adjustment: Number(e.target.value) || 0 })}
                                className="w-full rounded-lg border border-[#c3c6d7] bg-white pl-8 pr-2 py-2 text-sm outline-none focus:border-[#004ac6] focus:ring-1 focus:ring-[#004ac6]/20"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] font-bold uppercase text-[#505f76]">Stock Override</label>
                            <input
                              type="number"
                              value={variant.values[0]?.stock_override ?? ''}
                              onChange={(e) => updateVariantValue(variantIndex, 0, { stock_override: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0) })}
                              className="w-full rounded-lg border border-[#c3c6d7] bg-white px-3 py-2 text-sm outline-none focus:border-[#004ac6] focus:ring-1 focus:ring-[#004ac6]/20"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <label className="mb-1 block text-[10px] font-bold uppercase text-[#505f76]">SKU Suffix</label>
                              <input
                                type="text"
                                value={variant.values[0]?.sku_suffix || ''}
                                onChange={(e) => updateVariantValue(variantIndex, 0, { sku_suffix: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') || null })}
                                className="w-full rounded-lg border border-[#c3c6d7] bg-white px-3 py-2 text-sm outline-none focus:border-[#004ac6] focus:ring-1 focus:ring-[#004ac6]/20"
                              />
                            </div>
                            <button type="button" onClick={() => setFormData((current) => ({ ...current, variant_options: current.variant_options.map((item, index) => index === variantIndex ? { ...item, values: item.values.filter((_, valueIndex) => valueIndex !== 0) } : item) }))} className="mt-5 p-1.5 text-[#505f76] hover:text-red-600" aria-label="Remove value">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setFormData((current) => ({ ...current, variant_options: current.variant_options.map((item, index) => index === variantIndex ? { ...item, values: [...item.values, { label: '', price_adjustment: 0, sku_suffix: null, stock_override: null }] } : item) }))}
                          className="flex items-center gap-2 py-2 text-xs font-bold text-[#004ac6] hover:underline"
                        >
                          <Plus className="h-4 w-4" /> Add Value
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>

        <div className="md:hidden">
          <div className="fixed inset-x-0 bottom-0 z-40 flex gap-3 border-t border-[#c3c6d7] bg-white p-4">
            <button type="button" onClick={() => navigate('/seller/products')} className="flex-1 rounded-xl border border-[#c3c6d7] bg-white px-4 py-3 font-semibold text-[#191c1e]">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 rounded-xl bg-[#004ac6] px-4 py-3 font-semibold text-white shadow-md disabled:opacity-60">
              {loading ? 'Saving...' : 'Publish Product'}
            </button>
          </div>
          <div className="h-24 w-full" />
        </div>
      </form>
    </div>
  );
};
