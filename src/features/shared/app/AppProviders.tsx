'use client';

import React from 'react';
import { CartProvider } from '@/src/context/CartContext';
import { UserProvider } from '@/src/context/UserContext';
import { WishlistProvider } from '@/src/context/WishlistContext';
import { InventoryProvider } from '@/src/context/InventoryContext';
import { CompareProvider } from '@/src/context/CompareContext';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <WishlistProvider>
        <CompareProvider>
          <CartProvider>
            <InventoryProvider>{children}</InventoryProvider>
          </CartProvider>
        </CompareProvider>
      </WishlistProvider>
    </UserProvider>
  );
}
