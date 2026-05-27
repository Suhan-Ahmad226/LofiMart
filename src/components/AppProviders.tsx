'use client';

import React from 'react';
import { CartProvider } from '../context/CartContext';
import { UserProvider } from '../context/UserContext';
import { WishlistProvider } from '../context/WishlistContext';
import { InventoryProvider } from '../context/InventoryContext';
import { CompareProvider } from '../context/CompareContext';

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
