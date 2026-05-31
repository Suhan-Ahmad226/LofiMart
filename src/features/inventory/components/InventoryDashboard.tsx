import React from 'react';
import { useInventoryState } from '@/src/context/InventoryContext';

const InventoryDashboard: React.FC = () => {
  const { warehouses, suppliers, inventory, purchaseOrders } = useInventoryState();

  return (
    <div className="p-4 mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="p-4 border rounded bg-white shadow">
        <h3 className="text-lg font-medium">Warehouses</h3>
        <p className="text-2xl font-bold">{warehouses.length}</p>
      </div>
      <div className="p-4 border rounded bg-white shadow">
        <h3 className="text-lg font-medium">Suppliers</h3>
        <p className="text-2xl font-bold">{suppliers.length}</p>
      </div>
      <div className="p-4 border rounded bg-white shadow">
        <h3 className="text-lg font-medium">Inventory Items</h3>
        <p className="text-2xl font-bold">{inventory.length}</p>
      </div>
      <div className="p-4 border rounded bg-white shadow">
        <h3 className="text-lg font-medium">Purchase Orders</h3>
        <p className="text-2xl font-bold">{purchaseOrders.length}</p>
      </div>
    </div>
  );
};

export default InventoryDashboard;