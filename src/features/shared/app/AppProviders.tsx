'use client';

import React from 'react';
import { CartProvider } from '../../../features/shop/state/CartContext';
import { UserProvider } from '../../../features/shared/state/UserContext';
import { WishlistProvider } from '../../../features/shop/state/WishlistContext';
import { InventoryProvider } from '../../../features/inventory/state/InventoryContext';
import { CompareProvider } from '../../../features/shop/state/CompareContext';
import { CommerceConfigProvider } from '../../../features/shared/state/CommerceConfigContext';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <CommerceConfigProvider>
        <WishlistProvider>
          <CompareProvider>
            <CartProvider>
              <InventoryProvider>{children}</InventoryProvider>
            </CartProvider>
          </CompareProvider>
        </WishlistProvider>
      </CommerceConfigProvider>
    </UserProvider>
  );
}
