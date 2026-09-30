import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Edit2, Loader2, Image as ImageIcon, ExternalLink, ToggleLeft, ToggleRight } from 'lucide-react';
import { useUser } from '../../../features/shared/state/UserContext';
import toast from '@/lib/toast';
import { Link } from '../../../lib/navigation';
import CloudinaryUpload from '@/features/shared/media/CloudinaryUpload';
import OptimizedImage from '@/features/shared/ui/OptimizedImage';
import { CenteredLoader, EmptyState, FormNotice } from '@/features/shared/ui/FeedbackState';

interface Banner {
  id: number;
  title: string;
  subtitle: string;
  image: string;
  link: string;
  button_text: string;
  is_active: boolean;
}

interface FormData {
  title: string;
  subtitle: string;
  image: string;
  link: string;
  button_text: string;
}

export const AdminBannersPage = () => {
  const { token } = useUser();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    title: '',
    subtitle: '',
    image: '',
    link: '',
    button_text: 'Shop Now'
  });

  const fetchBanners = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch('/api/admin/banners', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json().catch(() => null) as (Banner[] | { error?: string }) | null;
      if (!response.ok) {
        const message = Array.isArray(data) ? null : data?.error;
        throw new Error(message || 'Failed to load banners');
      }
      setBanners(Array.isArray(data) ? data : []);
    } catch (err) {
      const nextError = err instanceof Error ? err.message : 'Failed to load banners';
      toast.error(nextError);
      setError(nextError);
      setBanners([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchBanners();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingBanner ? `/api/admin/banners/${editingBanner.id}` : '/api/admin/banners';
    const method = editingBanner ? 'PATCH' : 'POST';

    try {
      setSubmitting(true);
      setError('');
      setMessage('');
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to save banner');
      }
      toast.success(editingBanner ? 'Banner updated' : 'Banner created');
      setMessage(editingBanner ? 'Banner updated successfully.' : 'Banner created successfully.');
      setShowModal(false);
      setEditingBanner(null);
      setFormData({ title: '', subtitle: '', image: '', link: '', button_text: 'Shop Now' });
      fetchBanners();
    } catch (err) {
      const nextError = err instanceof Error ? err.message : 'Failed to save banner';
      toast.error(nextError);
      setError(nextError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (banner: Banner) => {
    try {
      const response = await fetch(`/api/admin/banners/${banner.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ...banner, is_active: !banner.is_active })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to update banner status');
      }
      toast.success(`Banner ${!banner.is_active ? 'activated' : 'deactivated'}`);
      fetchBanners();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update banner status');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await fetch(`/api/admin/banners/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to delete banner');
      }
      setDeleteConfirmId(null);
      toast.success('Banner deleted');
      fetchBanners();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete banner');
    }
  };

  const handleEdit = (banner: Banner) => {
    setEditingBanner(banner);
    setFormData({
      title: banner.title,
      subtitle: banner.subtitle,
      image: banner.image,
      link: banner.link,
      button_text: banner.button_text
    });
    setShowModal(true);
  };

  if (loading) {
    return <CenteredLoader label="Loading banners..." className="min-h-[240px]" />;
  }

  return (
    <div className="space-y-6">
      {error ? <FormNotice tone="error">{error}</FormNotice> : null}
      {message ? <FormNotice tone="success">{message}</FormNotice> : null}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Banner Management</h1>
          <p className="text-sm text-gray-500">Manage homepage hero banners and promotions</p>
        </div>
        <button 
          onClick={() => {
            setEditingBanner(null);
            setFormData({ title: '', subtitle: '', image: '', link: '', button_text: 'Shop Now' });
            setShowModal(true);
          }}
          className="bg-primary text-white px-4 py-2 rounded-xl flex items-center space-x-2 hover:bg-primary/90 transition-colors"
        >
          <Plus size={20} />
          <span>Add Banner</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {banners.length === 0 ? (
          <EmptyState
            icon={<ImageIcon size={24} />}
            title="No banners have been created yet"
            description="Create a homepage banner to highlight campaigns, promotions, and seasonal hero content."
            tone="soft"
            className="py-12"
          />
        ) : banners.map((banner) => (
          <div key={banner.id} className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden flex flex-col md:flex-row group">
            <div className="md:w-1/3 aspect-video relative overflow-hidden bg-gray-100">
              <OptimizedImage src={banner.image} alt={banner.title} widthHint={960} heightHint={540} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-4">
                <button 
                  onClick={() => handleEdit(banner)}
                  className="p-3 bg-white rounded-full text-gray-900 hover:scale-110 transition-transform"
                >
                  <Edit2 size={20} />
                </button>
                {deleteConfirmId === banner.id ? (
                  <div className="flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-rose-700">
                    <span>Delete?</span>
                    <button
                      onClick={() => handleDelete(banner.id)}
                      className="rounded-full bg-rose-600 px-3 py-1 text-white transition hover:bg-rose-700"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 transition hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setDeleteConfirmId(banner.id)}
                    className="p-3 bg-white rounded-full text-accent hover:scale-110 transition-transform"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
              </div>
            </div>
            <div className="p-6 flex-1 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-xl">{banner.title}</h3>
                  <button 
                    onClick={() => handleToggleActive(banner)}
                    className={`flex items-center space-x-2 text-sm font-medium ${banner.is_active ? 'text-emerald-600' : 'text-gray-400'}`}
                  >
                    {banner.is_active ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                    <span>{banner.is_active ? 'Active' : 'Inactive'}</span>
                  </button>
                </div>
                <p className="text-sm text-gray-500 mb-4">{banner.subtitle}</p>
                <div className="flex items-center space-x-4 text-xs text-gray-400">
                  <span className="flex items-center space-x-1">
                    <ExternalLink size={12} />
                    <Link to={banner.link || '/shop'} className="hover:text-primary">
                      <span>Link: {banner.link}</span>
                    </Link>
                  </span>
                  <span>Button: {banner.button_text}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-lg">
            <h2 className="text-xl font-bold mb-6">{editingBanner ? 'Edit Banner' : 'New Banner'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input 
                  type="text" 
                  required
                  className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
                <input 
                  type="text" 
                  required
                  className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm"
                  value={formData.subtitle}
                  onChange={(e) => setFormData({...formData, subtitle: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Banner Image</label>
                <input 
                  type="url" 
                  required
                  className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm"
                  value={formData.image}
                  onChange={(e) => setFormData({...formData, image: e.target.value})}
                  placeholder="Optional: paste an existing hosted image URL"
                />
                <div className="mt-2">
                  <CloudinaryUpload
                    label="Upload banner image"
                    helper="Pick a file directly. We will upload it and fill the image URL automatically."
                    onUploaded={(url) => setFormData({ ...formData, image: url })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Button Text</label>
                  <input 
                    type="text" 
                    required
                    className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm"
                    value={formData.button_text}
                    onChange={(e) => setFormData({...formData, button_text: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Link URL</label>
                  <input 
                    type="text" 
                    required
                    className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm"
                    value={formData.link}
                    onChange={(e) => setFormData({...formData, link: e.target.value})}
                  />
                </div>
              </div>
              <div className="flex space-x-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={submitting}
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
                    {submitting ? 'Saving...' : editingBanner ? 'Update Banner' : 'Create Banner'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};