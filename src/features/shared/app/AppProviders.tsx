'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { CartProvider } from '../../../features/shop/state/CartContext';
import { UserProvider } from '../../../features/shared/state/UserContext';
import { WishlistProvider } from '../../../features/shop/state/WishlistContext';
import { InventoryProvider } from '../../../features/inventory/state/InventoryContext';
import { CompareProvider } from '../../../features/shop/state/CompareContext';
import { CommerceConfigProvider } from '../../../features/shared/state/CommerceConfigContext';
import { AuthModalProvider } from '@/features/auth/context/AuthModalContext';

// The auth modal is only needed once someone tries to sign in, so it stays out
// of the initial bundle for every visitor who never opens it.
const AuthModal = dynamic(
  () => import('@/features/auth/components/AuthModal').then((mod) => mod.default),
  { ssr: false },
);

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
