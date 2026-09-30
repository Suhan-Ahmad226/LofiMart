import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Loader2, Tag, Layers, ListTree } from 'lucide-react';
import { useUser } from '../../../features/shared/state/UserContext';
import toast from '@/lib/toast';

interface Category { id: string; name: string; icon?: string }
interface Subcategory { id: string; category_id: string; name: string; icon?: string }
interface SubSub { id: string; subcategory_id: string; name: string }

export const AdminCategoriesPage = () => {
  const { token } = useUser();
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [subsubs, setSubsubs] = useState<SubSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [newCategory, setNewCategory] = useState({ name: '', icon: '' });
  const [newSub, setNewSub] = useState({ category_id: '', name: '', icon: '' });
  const [newSubSub, setNewSubSub] = useState({ subcategory_id: '', name: '' });
  const [categoryErrors, setCategoryErrors] = useState({ category: '', sub: '', subSub: '' });

  const fetchAll = async () => {
    setLoading(true);
    try {
      setError('');
      const authed = { headers: { Authorization: `Bearer ${token}` } } as RequestInit;
      const [cRes, sRes, ssRes] = await Promise.all([
        fetch('/api/admin/categories', authed),
        fetch('/api/admin/subcategories', authed),
        fetch('/api/admin/subsubcategories', authed),
      ]);
      const [categoriesData, subcategoriesData, subsubsData] = await Promise.all([
        cRes.json().catch(() => null),
        sRes.json().catch(() => null),
        ssRes.json().catch(() => null),
      ]);
      if (!cRes.ok || !sRes.ok || !ssRes.ok) {
        throw new Error(
          (categoriesData as { error?: string } | null)?.error ||
          (subcategoriesData as { error?: string } | null)?.error ||
          (subsubsData as { error?: string } | null)?.error ||
          'Failed to load categories',
        );
      }
      setCategories(Array.isArray(categoriesData) ? categoriesData : []);
      setSubcategories(Array.isArray(subcategoriesData) ? subcategoriesData : []);
      setSubsubs(Array.isArray(subsubsData) ? subsubsData : []);
    } catch (err) {
      setCategories([]);
      setSubcategories([]);
      setSubsubs([]);
      setError(err instanceof Error ? err.message : 'Failed to load categories');
      toast.error(err instanceof Error ? err.message : 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (token) fetchAll(); }, [token]);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextError = !newCategory.name.trim() ? 'Category name is required.' : '';
    setCategoryErrors((current) => ({ ...current, category: nextError }));
    if (nextError) return;

    const response = await fetch('/api/admin/categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...newCategory, name: newCategory.name.trim() })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error || 'Failed to add category');
      return;
    }

    toast.success('Category added');
    setNewCategory({ name: '', icon: '' });
    fetchAll();
  };

  const handleAddSub = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextError = !newSub.category_id ? 'Select a parent category first.' : !newSub.name.trim() ? 'Subcategory name is required.' : '';
    setCategoryErrors((current) => ({ ...current, sub: nextError }));
    if (nextError) return;

    const response = await fetch('/api/admin/subcategories', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...newSub, category_id: newSub.category_id, name: newSub.name.trim() })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error || 'Failed to add subcategory');
      return;
    }

    toast.success('Subcategory added');
    setNewSub({ category_id: '', name: '', icon: '' });
    fetchAll();
  };

  const handleAddSubSub = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextError = !newSubSub.subcategory_id ? 'Select a parent subcategory first.' : !newSubSub.name.trim() ? 'Sub-subcategory name is required.' : '';
    setCategoryErrors((current) => ({ ...current, subSub: nextError }));
    if (nextError) return;

    const response = await fetch('/api/admin/subsubcategories', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...newSubSub, subcategory_id: newSubSub.subcategory_id, name: newSubSub.name.trim() })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error || 'Failed to add sub-subcategory');
      return;
    }

    toast.success('Sub-subcategory added');
    setNewSubSub({ subcategory_id: '', name: '' });
    fetchAll();
  };

  const del = async (url: string) => {
    const response = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(data?.error || 'Failed to delete item');
      return;
    }
    fetchAll();
  };

  const subsByCat = useMemo(() => {
    const map: Record<string, Subcategory[]> = {};
    subcategories.forEach(s => { (map[s.category_id] = map[s.category_id] || []).push(s); });
    return map;
  }, [subcategories]);

  const subsubsBySub = useMemo(() => {
    const map: Record<string, SubSub[]> = {};
    subsubs.forEach(s => { (map[s.subcategory_id] = map[s.subcategory_id] || []).push(s); });
    return map;
  }, [subsubs]);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-primary" size={32} /></div>;

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Category Management</h1>
          <p className="text-sm text-gray-500">Manage categories, subcategories, and sub-subcategories</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form onSubmit={handleAddCategory} className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm space-y-4">
          <h3 className="font-bold flex items-center gap-2"><Tag size={16}/> Root Category</h3>
          <input className="w-full bg-bg-light border-none rounded-xl py-2 px-4 text-sm" placeholder="Name" value={newCategory.name} onChange={e=>{setNewCategory({...newCategory,name:e.target.value}); setCategoryErrors((current) => ({ ...current, category: '' }));}}/>
          {categoryErrors.category ? <p className="text-sm text-red-600">{categoryErrors.category}</p> : null}
          <input className="w-full bg-bg-light border-none rounded-xl py-2 px-4 text-sm" placeholder="Icon (optional)" value={newCategory.icon} onChange={e=>setNewCategory({...newCategory,icon:e.target.value})}/>
          <button type="submit" className="w-full btn-primary flex items-center justify-center gap-2 py-2"><Plus size={16}/>Add</button>
        </form>

        <form onSubmit={handleAddSub} className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm space-y-4">
          <h3 className="font-bold flex items-center gap-2"><Layers size={16}/> Subcategory</h3>
          <select className="w-full bg-bg-light border-none rounded-xl py-2 px-4 text-sm" value={newSub.category_id} onChange={e=>setNewSub({...newSub,category_id:e.target.value})}>
            <option value="">Select parent category</option>
            {categories.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input className="w-full bg-bg-light border-none rounded-xl py-2 px-4 text-sm" placeholder="Name" value={newSub.name} onChange={e=>{setNewSub({...newSub,name:e.target.value}); setCategoryErrors((current) => ({ ...current, sub: '' }));}}/>
          {categoryErrors.sub ? <p className="text-sm text-red-600">{categoryErrors.sub}</p> : null}
          <input className="w-full bg-bg-light border-none rounded-xl py-2 px-4 text-sm" placeholder="Icon (optional)" value={newSub.icon} onChange={e=>setNewSub({...newSub,icon:e.target.value})}/>
          <button type="submit" className="w-full btn-primary flex items-center justify-center gap-2 py-2"><Plus size={16}/>Add</button>
        </form>

        <form onSubmit={handleAddSubSub} className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm space-y-4">
          <h3 className="font-bold flex items-center gap-2"><ListTree size={16}/> Sub-Subcategory</h3>
          <select className="w-full bg-bg-light border-none rounded-xl py-2 px-4 text-sm" value={newSubSub.subcategory_id} onChange={e=>setNewSubSub({...newSubSub,subcategory_id:e.target.value})}>
            <option value="">Select subcategory</option>
            {subcategories.map(s=> <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input className="w-full bg-bg-light border-none rounded-xl py-2 px-4 text-sm" placeholder="Name" value={newSubSub.name} onChange={e=>{setNewSubSub({...newSubSub,name:e.target.value}); setCategoryErrors((current) => ({ ...current, subSub: '' }));}}/>
          {categoryErrors.subSub ? <p className="text-sm text-red-600">{categoryErrors.subSub}</p> : null}
          <button type="submit" className="w-full btn-primary flex items-center justify-center gap-2 py-2"><Plus size={16}/>Add</button>
        </form>
      </div>

      <div className="table-responsive overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="px-6 py-3">Category</th>
              <th className="px-6 py-3">Subcategories</th>
              <th className="px-6 py-3">Sub-Subcategories</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm">
            {categories.map(cat => {
              const subs = subsByCat[cat.id] || [];
              return (
                <tr key={cat.id} className="align-top">
                  <td className="px-6 py-4 font-semibold">{cat.name}</td>
                  <td className="px-6 py-4 space-y-1">
                    {subs.length === 0 && <span className="text-gray-400 text-xs">None</span>}
                    {subs.map(sub => (
                      <div key={sub.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                        <span>{sub.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase text-gray-400">ID {sub.id}</span>
                          <button onClick={() => del(`/api/admin/subcategories/${sub.id}`)} className="p-1 text-gray-400 hover:text-accent"><Trash2 size={16}/></button>
                        </div>
                      </div>
                    ))}
                  </td>
                  <td className="px-6 py-4 space-y-1">
                    {subs.flatMap(sub => subsubsBySub[sub.id] || []).length === 0 && <span className="text-gray-400 text-xs">None</span>}
                    {subs.map(sub => (
                      <div key={sub.id} className="space-y-1">
                        {(subsubsBySub[sub.id] || []).map(ss => (
                          <div key={ss.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                            <span>{ss.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] uppercase text-gray-400">Sub {sub.id}</span>
                              <button onClick={() => del(`/api/admin/subsubcategories/${ss.id}`)} className="p-1 text-gray-400 hover:text-accent"><Trash2 size={16}/></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => del(`/api/admin/categories/${cat.id}`)} className="p-2 text-gray-400 hover:text-accent"><Trash2 size={18}/></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
