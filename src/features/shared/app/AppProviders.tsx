'use client';

import React from 'react';
import { CartProvider } from '../../../features/shop/state/CartContext';
import { UserProvider } from '../../../features/shared/state/UserContext';
import { WishlistProvider } from '../../../features/shop/state/WishlistContext';
import { InventoryProvider } from '../../../features/inventory/state/InventoryContext';
import { CompareProvider } from '../../../features/shop/state/CompareContext';
import { CommerceConfigProvider } from '../../../features/shared/state/CommerceConfigContext';
import { AuthModalProvider } from '@/features/auth/context/AuthModalContext';
import AuthModal from '@/features/auth/components/AuthModal';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <AuthModalProvider>
        <CommerceConfigProvider>
          <WishlistProvider>
            <CompareProvider>
              <CartProvider>
                <InventoryProvider>{children}</InventoryProvider>
              </CartProvider>
            </CompareProvider>
          </WishlistProvider>
        </CommerceConfigProvider>
        <AuthModal />
      </AuthModalProvider>
    </UserProvider>
  );
}
