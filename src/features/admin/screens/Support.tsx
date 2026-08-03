import React, { useEffect, useState } from 'react';
import { Search, Mail, Trash2, CheckCircle, Clock } from 'lucide-react';
import { useUser } from '../../../features/shared/state/UserContext';
import toast from 'react-hot-toast';
import { CenteredLoader, EmptyState, FormNotice } from '../../../components/ui/FeedbackState';
import { openMailto } from '../../../lib/browser-actions';

export const AdminSupportPage = () => {
  const { token } = useUser();
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [focusedMessageId, setFocusedMessageId] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const fetchMessages = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch('/api/admin/messages', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load support messages');
      }
      setMessages(data);
    } catch (err) {
      setMessages([]);
      setError(err instanceof Error ? err.message : 'Failed to load support messages');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchMessages();
  }, [token]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const nextSearch = params.get('search');
    const nextMessageId = params.get('message');

    if (nextSearch) {
      setSearch(nextSearch);
    }
    if (nextMessageId) {
      setFocusedMessageId(nextMessageId);
    }
  }, []);

  const handleStatusChange = async (id: number, status: string) => {
    try {
      const response = await fetch(`/api/admin/messages/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to update status');
      }
      toast.success(`Message marked as ${status}`);
      fetchMessages();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await fetch(`/api/admin/messages/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to delete message');
      }
      setDeleteConfirmId(null);
      toast.success('Message deleted');
      fetchMessages();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete message');
    }
  };

  const handleReplyByEmail = (email: string, subject: string) => {
    openMailto(email, `Re: ${subject}`);
  };

  const filteredMessages = messages.filter(m => 
    m.subject.toLowerCase().includes(search.toLowerCase()) ||
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (!focusedMessageId || typeof window === 'undefined') return;

    const matched = filteredMessages.find((message) => String(message.id) === focusedMessageId);
    if (!matched) return;

    window.requestAnimationFrame(() => {
      document.getElementById(`admin-support-${matched.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [filteredMessages, focusedMessageId]);

  if (loading) {
    return <CenteredLoader label="Loading support messages..." className="min-h-[240px]" />;
  }

  return (
    <div className="space-y-6">
      {error ? <FormNotice tone="error">{error}</FormNotice> : null}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Support Messages</h1>
          <p className="text-sm text-gray-500">Manage inquiries from the contact form</p>
        </div>
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Search messages..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/20 md:py-2" 
          />
        </div>
      </div>

      <div className="space-y-4">
        {filteredMessages.map((msg) => (
          <div
            id={`admin-support-${msg.id}`}
            key={msg.id}
                className={`rounded-2xl border bg-white p-4 md:p-6 ${
              String(msg.id) === focusedMessageId
                ? 'border-indigo-300 ring-2 ring-indigo-200 bg-indigo-50/40'
                : msg.status === 'unread'
                  ? 'border-primary/20 shadow-md shadow-primary/5'
                  : 'border-black/5 shadow-sm'
            } group flex flex-col gap-4 md:flex-row md:items-start md:space-x-4`}
          >
            <div className={`w-fit rounded-xl p-3 ${msg.status === 'unread' ? 'bg-primary/10 text-primary' : 'bg-gray-50 text-gray-400'}`}>
              <Mail size={24} />
            </div>
            <div className="flex-1">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="font-bold text-lg">{msg.subject}</h3>
                  <p className="text-sm text-gray-500 mb-2">From: <span className="font-bold text-gray-900">{msg.name}</span> ({msg.email})</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {msg.status === 'unread' ? (
                    <button 
                      onClick={() => handleStatusChange(msg.id, 'read')}
                      className="p-2 text-primary hover:bg-primary/5 rounded-lg transition-colors"
                      title="Mark as Read"
                    >
                      <CheckCircle size={18} />
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleStatusChange(msg.id, 'unread')}
                      className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Mark as Unread"
                    >
                      <Clock size={18} />
                    </button>
                  )}
                  <button 
                    onClick={() => handleReplyByEmail(msg.email, msg.subject)}
                    className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
                    title="Reply by Email"
                  >
                    <Mail size={18} />
                  </button>
                  {deleteConfirmId === msg.id ? (
                    <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                      <span>Delete?</span>
                      <button
                        onClick={() => handleDelete(msg.id)}
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
                      onClick={() => setDeleteConfirmId(msg.id)}
                      className="p-2 text-gray-400 hover:text-accent hover:bg-accent/5 rounded-lg transition-colors"
                      title="Delete Message"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl mt-4">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{msg.message}</p>
              </div>
              <p className="text-[10px] text-gray-400 mt-4 uppercase tracking-wider">
                Received on {new Date(msg.created_at).toLocaleString()}
              </p>
            </div>
          </div>
        ))}
        {filteredMessages.length === 0 ? (
          <EmptyState
            icon={<Mail size={24} />}
            title={search ? 'No messages match this search' : 'No support messages yet'}
            description={
              search
                ? 'Try a different subject, sender name, or email address.'
                : 'New contact form submissions and support requests will appear here.'
            }
            tone="soft"
            className="py-12"
          />
        ) : null}
      </div>
    </div>
  );
};
