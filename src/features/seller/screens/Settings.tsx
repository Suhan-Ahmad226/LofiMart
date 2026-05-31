import React, { useEffect, useState } from 'react';
import { ChevronDown, Settings, Store } from 'lucide-react';
import ProfileManager from '@/src/components/profile/ProfileManager';
import StorefrontSettingsPanel from '@/src/components/seller/StorefrontSettingsPanel';

export const SellerSettingsPage = () => {
  const [openSection, setOpenSection] = useState<'storefront' | 'account'>('storefront');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const focusedSection = params.get('section');
    if (focusedSection && ['profile', 'addresses', 'verification', 'notifications', 'payout', 'security'].includes(focusedSection)) {
      setOpenSection('account');
      return;
    }
    if (focusedSection === 'storefront') {
      setOpenSection('storefront');
    }
  }, []);

  return (
    <div className="space-y-8">
      <section className="surface-card p-8">
        <div>
          <div>
            <h1 className="mt-2 text-3xl font-bold">Seller settings</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-500">
              Keep your storefront, business identity, addresses, payout methods, and security controls in clear grouped sections.
            </p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setOpenSection((current) => (current === 'storefront' ? 'account' : 'storefront'))}
          className="flex w-full items-start justify-between gap-4 px-6 py-5 text-left"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Store size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-950">Storefront and brand</h2>
              <p className="mt-1 text-sm text-gray-500">
                Manage public shop identity, banner, custom domain, publish state, and branded seller storefront.
              </p>
            </div>
          </div>
          <span className={`mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-bg-light text-gray-500 transition-transform ${openSection === 'storefront' ? 'rotate-180' : ''}`}>
            <ChevronDown size={18} />
          </span>
        </button>
        {openSection === 'storefront' ? (
          <div className="border-t border-black/5 p-6 pt-2">
            <StorefrontSettingsPanel />
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setOpenSection((current) => (current === 'account' ? 'storefront' : 'account'))}
          className="flex w-full items-start justify-between gap-4 px-6 py-5 text-left"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Settings size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-950">Business profile and operations</h2>
              <p className="mt-1 text-sm text-gray-500">
                Update personal info, verification, saved addresses, payout methods, notifications, and account security.
              </p>
            </div>
          </div>
          <span className={`mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-bg-light text-gray-500 transition-transform ${openSection === 'account' ? 'rotate-180' : ''}`}>
            <ChevronDown size={18} />
          </span>
        </button>
        {openSection === 'account' ? (
          <div className="border-t border-black/5 p-6 pt-2">
            <ProfileManager
              role="seller"
              title="Seller Profile Management"
              description="Manage your public seller profile, payout setup, KYC verification, notification preferences, and account security."
            />
          </div>
        ) : null}
      </section>
    </div>
  );
};

export default SellerSettingsPage;
