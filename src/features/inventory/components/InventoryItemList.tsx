import React from 'react';
import { useInventoryState } from '../../../features/inventory/state/InventoryContext';

const InventoryItemList: React.FC = () => {
  const { inventory, warehouses } = useInventoryState();
  const [focusedProductId, setFocusedProductId] = React.useState('');

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const nextProductId = params.get('product');
    if (nextProductId) {
      setFocusedProductId(nextProductId);
    }
  }, []);

  React.useEffect(() => {
    if (!focusedProductId) return;

    const matched = inventory.find((item) => String(item.productId) === focusedProductId);
    if (!matched) return;

    const timeoutId = window.setTimeout(() => {
      document.getElementById(`inventory-item-${matched.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [focusedProductId, inventory]);

  return (
    <div className="mt-6 p-4">
      <h2 className="mb-2 text-xl font-semibold">Inventory Items</h2>
      <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Inventory rows mirror real product stock. Edit product stock from seller or admin product management instead of creating manual inventory-only rows here.
      </p>
      {inventory.length === 0 ? (
        <p className="mt-4 text-gray-500">No inventory items defined.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {inventory.map((item) => (
            <li
              id={`inventory-item-${item.id}`}
              key={item.id}
              className={`flex items-center justify-between rounded border p-2 transition-colors ${
                String(item.productId) === focusedProductId
                  ? 'border-indigo-300 bg-indigo-50 ring-2 ring-indigo-200'
                  : ''
              }`}
            >
              <span>
                {item.productId} (Qty: {item.quantity})
              </span>
              <div className="flex items-center gap-3 text-xs font-semibold">
                <span className="text-slate-400">
                  {warehouses.find((warehouse) => warehouse.id === item.warehouseId)?.name || 'Warehouse pending'}
                </span>
                <a className="text-blue-600" href={`/admin/products?search=${encodeURIComponent(String(item.productId))}&product=${encodeURIComponent(String(item.productId))}`}>
                  Open product
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default InventoryItemList;
