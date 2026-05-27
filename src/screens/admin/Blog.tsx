import React, { useEffect, useMemo, useState } from 'react';
import {
  Edit2,
  FileText,
  Image as ImageIcon,
  Loader2,
  Plus,
  Search,
  Tag,
  Trash2,
} from 'lucide-react';
import { useUser } from '../../context/UserContext';
import toast from 'react-hot-toast';
import CloudinaryUpload from '../../components/media/CloudinaryUpload';
import OptimizedImage from '../../components/ui/OptimizedImage';
import { Link } from '@/src/lib/navigation';

type AdminBlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  category?: string;
  content: string;
  image?: string;
  seo_title?: string;
  seo_description?: string;
  author_name?: string;
  created_at?: string;
};

type BlogFormData = {
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  content: string;
  image: string;
  seoTitle: string;
  seoDescription: string;
};

const emptyForm: BlogFormData = {
  title: '',
  slug: '',
  excerpt: '',
  category: 'Insights',
  content: '',
  image: '',
  seoTitle: '',
  seoDescription: '',
};

function buildSlug(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
}

export const AdminBlogPage = () => {
  const { token } = useUser();
  const [posts, setPosts] = useState<AdminBlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingPost, setEditingPost] = useState<AdminBlogPost | null>(null);
  const [formData, setFormData] = useState<BlogFormData>(emptyForm);
  const [deleteConfirmId, setDeleteConfirmId] = useState('');

  const fetchPosts = async () => {
    try {
      const response = await fetch('/api/admin/blog', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load blog posts');
      }
      setPosts(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load blog posts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      void fetchPosts();
    }
  }, [token]);

  const filteredPosts = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return posts;
    }

    return posts.filter((post) =>
      `${post.title} ${post.category ?? ''} ${post.author_name ?? ''}`.toLowerCase().includes(term),
    );
  }, [posts, query]);

  const openCreateModal = () => {
    setEditingPost(null);
    setFormData(emptyForm);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingPost ? `/api/admin/blog/${editingPost.id}` : '/api/admin/blog';
    const method = editingPost ? 'PATCH' : 'POST';

    setSaving(true);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to save post');
      }

      toast.success(editingPost ? 'Post updated' : 'Post created');
      setShowModal(false);
      setEditingPost(null);
      setFormData(emptyForm);
      await fetchPosts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save post');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/blog/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Delete failed');
      setDeleteConfirmId('');
      toast.success('Post deleted');
      await fetchPosts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete post');
    }
  };

  const handleEdit = (post: AdminBlogPost) => {
    setEditingPost(post);
    setFormData({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt || '',
      category: post.category || 'Insights',
      content: post.content,
      image: post.image || '',
      seoTitle: post.seo_title || '',
      seoDescription: post.seo_description || '',
    });
    setShowModal(true);
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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Blog Management</h1>
          <p className="text-sm text-slate-500">Create polished editorial content with category, excerpt, and SEO metadata.</p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-white transition-colors hover:bg-primary/90"
        >
          <Plus size={18} />
          <span>New Post</span>
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by title, category, or author"
          className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-primary/30 focus:ring-4 focus:ring-primary/10"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {filteredPosts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-slate-500 xl:col-span-2">
            No blog posts match the current search.
          </div>
        ) : filteredPosts.map((post) => (
          <div key={post.id} className="group overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
            <div className="relative aspect-video overflow-hidden bg-slate-100">
              {post.image ? (
                <OptimizedImage src={post.image} alt={post.title} widthHint={960} heightHint={540} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-300">
                  <ImageIcon size={48} />
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center gap-4 bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => handleEdit(post)}
                  className="rounded-full bg-white p-3 text-slate-900 transition-transform hover:scale-110"
                >
                  <Edit2 size={20} />
                </button>
                {deleteConfirmId === post.id ? (
                  <div className="flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-rose-700">
                    <span>Delete?</span>
                    <button
                      onClick={() => handleDelete(post.id)}
                      className="rounded-full bg-rose-600 px-3 py-1 text-white transition hover:bg-rose-700"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId('')}
                      className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 transition hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirmId(post.id)}
                    className="rounded-full bg-white p-3 text-accent transition-transform hover:scale-110"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-4 p-6">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-primary">
                  <Tag size={12} />
                  {post.category || 'Insights'}
                </span>
                <span>{post.created_at ? new Date(post.created_at).toLocaleDateString() : 'Draft'}</span>
              </div>
              <div>
                <h3 className="line-clamp-1 text-lg font-bold text-slate-950">{post.title}</h3>
                <p className="mt-2 line-clamp-2 text-sm text-slate-500">{post.excerpt || post.content}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <p className="font-semibold text-slate-900">SEO title</p>
                <p className="mt-1 line-clamp-1">{post.seo_title || post.title}</p>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>By {post.author_name || 'Admin'}</span>
                <div className="flex items-center gap-3">
                  <Link to={`/blog/${post.slug}`} className="text-primary hover:underline">
                    Preview article
                  </Link>
                  <span>/{post.slug}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-8">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-950">{editingPost ? 'Edit Post' : 'New Blog Post'}</h2>
                <p className="mt-1 text-sm text-slate-500">Structure the article for better discovery, sharing, and editorial quality.</p>
              </div>
              <Link to={formData.slug ? `/blog/${formData.slug}` : '/blog'} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <FileText size={16} />
                Preview
              </Link>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-5 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Title</label>
                  <input
                    type="text"
                    required
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
                    value={formData.title}
                    onChange={(e) => {
                      const title = e.target.value;
                      setFormData((current) => ({
                        ...current,
                        title,
                        slug: editingPost ? current.slug : buildSlug(title),
                        seoTitle: current.seoTitle || title,
                      }));
                    }}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Slug</label>
                  <input
                    type="text"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                    value={formData.slug}
                    onChange={(e) => setFormData((current) => ({ ...current, slug: buildSlug(e.target.value) }))}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Category</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
                    value={formData.category}
                    onChange={(e) => setFormData((current) => ({ ...current, category: e.target.value }))}
                    placeholder="Technology, Business, Lifestyle"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Excerpt</label>
                  <textarea
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
                    value={formData.excerpt}
                    onChange={(e) => setFormData((current) => ({ ...current, excerpt: e.target.value }))}
                    placeholder="Short article summary for cards, previews, and featured sections"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Featured Image</label>
                  <input
                    type="url"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
                    value={formData.image}
                    onChange={(e) => setFormData((current) => ({ ...current, image: e.target.value }))}
                    placeholder="Optional: paste an existing hosted image URL"
                  />
                  <div className="mt-2">
                    <CloudinaryUpload
                      label="Upload featured image"
                      helper="Pick a file directly. We will upload it and fill the image URL automatically."
                      onUploaded={(url) => setFormData((current) => ({ ...current, image: url }))}
                    />
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Content</label>
                  <textarea
                    required
                    rows={10}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
                    value={formData.content}
                    onChange={(e) => setFormData((current) => ({ ...current, content: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">SEO Title</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
                    value={formData.seoTitle}
                    onChange={(e) => setFormData((current) => ({ ...current, seoTitle: e.target.value }))}
                    placeholder="Meta title for search and sharing"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">SEO Description</label>
                  <textarea
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
                    value={formData.seoDescription}
                    onChange={(e) => setFormData((current) => ({ ...current, seoDescription: e.target.value }))}
                    placeholder="Short description for search previews"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <p className="font-semibold text-slate-900">Preview URL</p>
                <p className="mt-1">/blog/{formData.slug || 'your-article-slug'}</p>
              </div>

              <div className="flex gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
                >
                  {saving ? 'Saving...' : editingPost ? 'Update Post' : 'Publish Post'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
