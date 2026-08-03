import React, { useEffect, useState } from 'react';
import { Search, Star, Trash2, Loader2, MessageSquare } from 'lucide-react';
import { useUser } from '../../../features/shared/state/UserContext';
import toast from 'react-hot-toast';

export const AdminReviewsPage = () => {
  const { token } = useUser();
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const fetchReviews = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/reviews', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load reviews');
      }
      setReviews(data);
    } catch (err) {
      setReviews([]);
      setError(err instanceof Error ? err.message : 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchReviews();
  }, [token]);

  const handleDelete = async (id: number) => {
    try {
      const response = await fetch(`/api/admin/reviews/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to delete review');
      }
      setDeleteConfirmId(null);
      toast.success('Review deleted');
      fetchReviews();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete review');
    }
  };

  const filteredReviews = reviews.filter(r => 
    (r.comment || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.user_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.product_name || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-primary" size={32} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Review Moderation</h1>
          <p className="text-sm text-gray-500">Monitor and manage product reviews</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Search reviews..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-xl py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/20" 
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {filteredReviews.map((review) => (
          <div key={review.id} className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm flex items-start space-x-4 group">
            <div className="p-3 bg-gray-50 rounded-xl text-gray-400">
              <MessageSquare size={24} />
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold">{review.user_name}</h3>
                  <p className="text-xs text-gray-500 mb-2">on <span className="text-primary font-medium">{review.product_name}</span></p>
                  <div className="flex items-center space-x-1 mb-3">
                    {[...Array(5)].map((_, i) => (
                      <Star 
                        key={i} 
                        size={14} 
                        className={i < review.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-200"} 
                      />
                    ))}
                  </div>
                </div>
                {deleteConfirmId === review.id ? (
                  <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                    <span>Delete?</span>
                    <button
                      onClick={() => handleDelete(review.id)}
                      className="rounded-lg bg-rose-600 px-2.5 py-1 text-white transition hover:bg-rose-700"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-600 transition hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setDeleteConfirmId(review.id)}
                    className="p-2 text-gray-400 hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
              <p className="text-sm text-gray-600 leading-relaxed italic">"{review.comment}"</p>
              <p className="text-[10px] text-gray-400 mt-4 uppercase tracking-wider">
                {new Date(review.created_at).toLocaleString()}
              </p>
            </div>
          </div>
        ))}
        {filteredReviews.length === 0 && (
          <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200">
            <p className="text-gray-500">No reviews found.</p>
          </div>
        )}
      </div>
    </div>
  );
};
