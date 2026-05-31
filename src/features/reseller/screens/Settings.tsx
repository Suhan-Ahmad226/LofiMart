import React, { useState } from 'react';
import { ChevronDown, Settings, Store } from 'lucide-react';
import ProfileManager from '@/src/components/profile/ProfileManager';
import ResellerStorefrontSettingsPanel from '@/src/components/reseller/StorefrontSettingsPanel';

export const ResellerSettings = () => {
  const [openSection, setOpenSection] = useState<'storefront' | 'account'>('storefront');

  return (
    <div className="space-y-8">
      <section className="surface-card p-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Reseller settings</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-500">
              Organize your reseller storefront, personal details, payouts, addresses, and account controls in clean grouped sections.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-gray-500">
            <span className="rounded-full bg-bg-light px-3 py-1.5">Storefront</span>
            <span className="rounded-full bg-bg-light px-3 py-1.5">Profile</span>
            <span className="rounded-full bg-bg-light px-3 py-1.5">Payments</span>
            <span className="rounded-full bg-bg-light px-3 py-1.5">Security</span>
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
              <h2 className="text-lg font-bold text-gray-950">Reseller storefront and share identity</h2>
              <p className="mt-1 text-sm text-gray-500">
                Control your public referral storefront, banner, custom domain, publish state, and branded share experience.
              </p>
            </div>
          </div>
          <span className={`mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-bg-light text-gray-500 transition-transform ${openSection === 'storefront' ? 'rotate-180' : ''}`}>
            <ChevronDown size={18} />
          </span>
        </button>
        {openSection === 'storefront' ? (
          <div className="border-t border-black/5 p-6 pt-2">
            <ResellerStorefrontSettingsPanel />
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
              <h2 className="text-lg font-bold text-gray-950">Profile, payments, and security</h2>
              <p className="mt-1 text-sm text-gray-500">
                Manage your identity, notifications, addresses, payout setup, verification, and privacy controls.
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
              role="reseller"
              title="Reseller Account Center"
              description="Configure your reseller identity, KYC verification, payout preferences, notifications, and privacy controls."
            />
          </div>
        ) : null}
      </section>
    </div>
  );
};

export default ResellerSettings;
