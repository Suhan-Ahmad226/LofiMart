import React, { useEffect, useMemo, useState } from 'react';
import { Ban, Search, Shield, ShieldCheck, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useUser } from '../../../features/shared/state/UserContext';
import { CenteredLoader, EmptyState } from '../../../components/ui/FeedbackState';

interface AdminUserRecord {
  id: string;
  name?: string | null;
  email?: string | null;
  role: 'admin' | 'seller' | 'reseller' | 'customer';
  verification_status?: string | null;
  is_blocked?: boolean;
  created_at?: string;
}

export const AdminUsersPage = () => {
  const { token, user: currentUser } = useUser();
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [focusedUserId, setFocusedUserId] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState('');

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load users');
      }

      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load users');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      void fetchUsers();
    }
  }, [token]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const nextSearch = params.get('search');
    const nextUser = params.get('user');

    if (nextSearch) {
      setSearch(nextSearch);
    }
    if (nextUser) {
      setFocusedUserId(nextUser);
    }
  }, []);

  const handleRoleChange = async (id: string, newRole: AdminUserRecord['role']) => {
    try {
      const response = await fetch(`/api/admin/users/${id}/role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to update role');
      }

      toast.success(`User role updated to ${newRole}`);
      await fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to delete user');
      }

      setDeleteConfirmId('');
      toast.success('User deleted');
      await fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  const handleBlockToggle = async (id: string, shouldBlock: boolean) => {
    try {
      const endpoint = shouldBlock ? 'block' : 'unblock';
      const response = await fetch(`/api/admin/users/${id}/${endpoint}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: shouldBlock ? 'Admin review action' : undefined }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to update user status');
      }

      toast.success(shouldBlock ? 'User blocked' : 'User unblocked');
      await fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update user status');
    }
  };

  const filteredUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return users;

    return users.filter((entry) => {
      const name = entry.name?.toLowerCase() || '';
      const email = entry.email?.toLowerCase() || '';
      return (
        name.includes(normalizedSearch) ||
        email.includes(normalizedSearch) ||
        entry.id.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [search, users]);

  useEffect(() => {
    if (!focusedUserId || typeof window === 'undefined') return;

    window.requestAnimationFrame(() => {
      document.getElementById(`admin-user-${focusedUserId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [filteredUsers.length, focusedUserId]);

  if (loading) {
    return <CenteredLoader label="Loading users..." className="min-h-[240px]" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-bold">User Management</h1>
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/20 md:py-2"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
        <div className="space-y-3 p-4 md:hidden">
          {filteredUsers.length === 0 ? (
            <EmptyState
              icon={<Search size={24} />}
              title={search ? 'No users match this search' : 'No users found'}
              description={
                search
                  ? 'Try a different name, email, or user ID.'
                  : 'Users will appear here once people start registering on the marketplace.'
              }
              tone="soft"
              className="py-12"
            />
          ) : filteredUsers.map((entry) => {
            const isSelf = currentUser?.id === entry.id;
            return (
              <div
                id={`admin-user-${entry.id}`}
                key={entry.id}
                className={`rounded-2xl border p-4 shadow-sm ${
                  entry.id === focusedUserId ? 'border-indigo-300 ring-2 ring-indigo-200 bg-indigo-50/30' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-900">
                      {entry.name || 'Unnamed user'}
                      {isSelf ? <span className="ml-2 text-xs font-semibold text-primary">(You)</span> : null}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">{entry.email || 'No email available'}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      entry.is_blocked ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                    }`}
                  >
                    {entry.is_blocked ? 'blocked' : 'active'}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      entry.role === 'admin'
                        ? 'bg-purple-100 text-purple-800'
                        : entry.role === 'seller'
                          ? 'bg-blue-100 text-blue-800'
                          : entry.role === 'reseller'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {entry.role}
                  </span>
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      entry.verification_status === 'verified'
                        ? 'bg-green-100 text-green-800'
                        : entry.verification_status === 'rejected'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {entry.verification_status || 'not_submitted'}
                  </span>
                </div>
                <p className="mt-3 text-xs text-gray-500">
                  Joined {entry.created_at ? new Date(entry.created_at).toLocaleDateString() : 'N/A'}
                </p>
                <div className="mt-4 space-y-3">
                  <select
                    className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
                    value={entry.role}
                    disabled={isSelf}
                    onChange={(e) => handleRoleChange(entry.id, e.target.value as AdminUserRecord['role'])}
                  >
                    <option value="customer">Customer</option>
                    <option value="seller">Seller</option>
                    <option value="reseller">Reseller</option>
                    <option value="admin">Admin</option>
                  </select>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => handleBlockToggle(entry.id, !entry.is_blocked)}
                      disabled={isSelf}
                      className={`rounded-xl border p-3 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        entry.is_blocked ? 'text-green-600' : 'text-rose-600'
                      }`}
                    >
                      {entry.is_blocked ? <ShieldCheck size={16} className="mx-auto" /> : <Ban size={16} className="mx-auto" />}
                    </button>
                    <button
                      onClick={() => handleRoleChange(entry.id, 'admin')}
                      disabled={entry.role === 'admin' || isSelf}
                      className="rounded-xl border p-3 text-purple-600 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Shield size={16} className="mx-auto" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId((current) => (current === entry.id ? '' : entry.id))}
                      disabled={isSelf}
                      className="rounded-xl border p-3 text-rose-600 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 size={16} className="mx-auto" />
                    </button>
                  </div>
                  {!isSelf && deleteConfirmId === entry.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-rose-700">Delete this user?</span>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId('')}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        <div className="table-responsive hidden md:block">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-500">
              <th className="px-6 py-4">User</th>
              <th className="px-6 py-4">Role</th>
              <th className="px-6 py-4">Verification</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Joined</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-10">
                  <EmptyState
                    icon={<Search size={24} />}
                    title={search ? 'No users match this search' : 'No users found'}
                    description={
                      search
                        ? 'Try a different name, email, or user ID.'
                        : 'Users will appear here once people start registering on the marketplace.'
                    }
                    tone="soft"
                    className="py-10"
                  />
                </td>
              </tr>
            ) : filteredUsers.map((entry) => {
              const isSelf = currentUser?.id === entry.id;

              return (
                <tr
                  id={`admin-user-${entry.id}`}
                  key={entry.id}
                  className={`text-sm transition-colors hover:bg-gray-50 ${
                    entry.id === focusedUserId ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-200' : ''
                  }`}
                >
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-bold">
                        {entry.name || 'Unnamed user'}
                        {isSelf && <span className="ml-2 text-xs font-semibold text-primary">(You)</span>}
                      </p>
                      <p className="text-xs text-gray-500">{entry.email || 'No email available'}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 capitalize">
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                        entry.role === 'admin'
                          ? 'bg-purple-100 text-purple-800'
                          : entry.role === 'seller'
                            ? 'bg-blue-100 text-blue-800'
                            : entry.role === 'reseller'
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {entry.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                        entry.verification_status === 'verified'
                          ? 'bg-green-100 text-green-800'
                          : entry.verification_status === 'rejected'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {entry.verification_status || 'not_submitted'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                        entry.is_blocked ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {entry.is_blocked ? 'blocked' : 'active'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {entry.created_at ? new Date(entry.created_at).toLocaleDateString() : 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end space-x-2">
                      {entry.role !== 'admin' && !isSelf && (
                        <button
                          onClick={() => handleRoleChange(entry.id, 'admin')}
                          className="p-2 text-gray-400 transition-colors hover:text-purple-600"
                          title="Make Admin"
                        >
                          <Shield size={18} />
                        </button>
                      )}
                      <button
                        onClick={() => handleBlockToggle(entry.id, !entry.is_blocked)}
                        disabled={isSelf}
                        className={`p-2 transition-colors ${
                          entry.is_blocked ? 'text-green-600 hover:text-green-700' : 'text-gray-400 hover:text-red-600'
                        } disabled:cursor-not-allowed disabled:opacity-40`}
                        title={isSelf ? 'You cannot block your own account' : entry.is_blocked ? 'Unblock user' : 'Block user'}
                      >
                        {entry.is_blocked ? <ShieldCheck size={18} /> : <Ban size={18} />}
                      </button>
                      <select
                        className="rounded-lg border border-gray-200 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
                        value={entry.role}
                        disabled={isSelf}
                        onChange={(e) => handleRoleChange(entry.id, e.target.value as AdminUserRecord['role'])}
                      >
                        <option value="customer">Customer</option>
                        <option value="seller">Seller</option>
                        <option value="reseller">Reseller</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        onClick={() => setDeleteConfirmId((current) => (current === entry.id ? '' : entry.id))}
                        disabled={isSelf}
                        className="p-2 text-gray-400 transition-colors hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                        title={isSelf ? 'You cannot delete your own account here' : 'Delete User'}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                    {!isSelf && deleteConfirmId === entry.id ? (
                      <div className="mt-2 flex items-center justify-end gap-2">
                        <span className="text-xs font-medium text-rose-700">Delete this user?</span>
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId('')}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
};
