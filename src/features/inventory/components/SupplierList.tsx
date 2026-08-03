import React from 'react';
import { useInventoryState } from '../../../features/inventory/state/InventoryContext';

const SupplierList: React.FC = () => {
  const { suppliers } = useInventoryState();
  const [focusedSupplierId, setFocusedSupplierId] = React.useState('');

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const nextSupplierId = params.get('supplier');
    const nextSection = params.get('section');
    if (nextSupplierId) {
      setFocusedSupplierId(nextSupplierId);
    }

    if (nextSection === 'suppliers' || nextSupplierId) {
      const timeoutId = window.setTimeout(() => {
        document.getElementById('inventory-suppliers-section')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 150);

      return () => window.clearTimeout(timeoutId);
    }
  }, []);

  React.useEffect(() => {
    if (!focusedSupplierId) return;

    const matched = suppliers.find((supplier) => supplier.id === focusedSupplierId);
    if (!matched) return;

    const timeoutId = window.setTimeout(() => {
      document.getElementById(`inventory-supplier-${matched.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [focusedSupplierId, suppliers]);

  return (
    <div id="inventory-suppliers-section" className="mt-6 p-4">
      <h2 className="mb-2 text-xl font-semibold">Suppliers</h2>
      <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Supplier records currently sync from purchase order history so the directory stays consistent with real restock activity.
      </p>
      {suppliers.length === 0 ? (
        <p className="mt-4 text-gray-500">No suppliers added.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {suppliers.map((supplier) => (
            <li
              id={`inventory-supplier-${supplier.id}`}
              key={supplier.id}
              className={`flex items-center justify-between rounded border p-2 transition-colors ${
                supplier.id === focusedSupplierId ? 'border-indigo-300 bg-indigo-50 ring-2 ring-indigo-200' : ''
              }`}
            >
              <span>{supplier.name}</span>
              <span className="text-xs font-medium text-slate-400">From purchase orders</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SupplierList;
