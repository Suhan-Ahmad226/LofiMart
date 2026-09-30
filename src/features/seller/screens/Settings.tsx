"use client";

import React, { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bot,
  CreditCard,
  ExternalLink,
  Lock,
  MapPin,
  ShieldCheck,
  Store,
  User,
} from 'lucide-react';
import { Link, useSearchParams } from '../../../lib/navigation';
import { useUser } from '../../../features/shared/state/UserContext';
import ProfileManager from '@/features/shared/profile/ProfileManager';
import StorefrontSettingsPanel from '@/features/seller/components/StorefrontSettingsPanel';
import TelegramConnectPanel from '@/features/seller/components/TelegramConnectPanel';

type SettingsCategoryId =
  | 'storefront'
  | 'profile'
  | 'addresses'
  | 'verification'
  | 'payout'
  | 'telegram'
  | 'security';

type SettingsCategory = {
  id: SettingsCategoryId;
  label: string;
  hint: string;
  icon: React.ReactNode;
  profileSections?: Array<'profile' | 'addresses' | 'verification' | 'payout' | 'security'>;
};

const CATEGORIES: SettingsCategory[] = [
  {
    id: 'storefront',
    label: 'Storefront & brand',
    hint: 'Slug, banner, domain',
    icon: <Store size={18} />,
  },
  {
    id: 'profile',
    label: 'Profile & business',
    hint: 'Name, bio, response time',
    icon: <User size={18} />,
    profileSections: ['profile'],
  },
  {
    id: 'addresses',
    label: 'Delivery addresses',
    hint: 'Shipping & billing',
    icon: <MapPin size={18} />,
    profileSections: ['addresses'],
  },
  {
    id: 'verification',
    label: 'Verification & KYC',
    hint: 'Documents & business license',
    icon: <ShieldCheck size={18} />,
    profileSections: ['verification'],
  },
  {
    id: 'payout',
    label: 'Payments & payouts',
    hint: 'Bank & settlement methods',
    icon: <CreditCard size={18} />,
    profileSections: ['payout'],
  },
  {
    id: 'telegram',
    label: 'Telegram alerts',
    hint: 'Order & low-stock notifications',
    icon: <Bot size={18} />,
  },
  {
    id: 'security',
    label: 'Security & privacy',
    hint: 'Password & account controls',
    icon: <Lock size={18} />,
    profileSections: ['security'],
  },
];

const CATEGORY_IDS = new Set<string>(CATEGORIES.map((category) => category.id));

function resolveCategory(rawSection: string | null): SettingsCategoryId {
  if (rawSection === 'notifications') return 'telegram';
  if (rawSection && CATEGORY_IDS.has(rawSection)) return rawSection as SettingsCategoryId;
  return 'storefront';
}

export const SellerSettingsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useUser();

  const activeCategory = useMemo(
    () => resolveCategory(searchParams.get('section')),
    [searchParams],
  );

  const activeCategoryMeta = useMemo(
    () => CATEGORIES.find((category) => category.id === activeCategory) ?? CATEGORIES[0],
    [activeCategory],
  );

  const storefrontUrl = user?.storefront_slug ? `/store/${user.storefront_slug}` : null;
  const sellerInitials = String(user?.store_name || user?.name || 'Seller')
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'SL';

  const selectCategory = (id: SettingsCategoryId) => {
    setSearchParams({ section: id }, { replace: true, scroll: false });
  };

  const renderNavItem = (category: SettingsCategory, mobile = false) => {
    const active = category.id === activeCategory;
    return (
      <button
        key={category.id}
        type="button"
        onClick={() => selectCategory(category.id)}
        aria-current={active ? 'page' : undefined}
        className={
          mobile
            ? `flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition ${
                active
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`
            : `group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                active
                  ? 'border-primary/20 bg-primary/[0.07] text-primary'
                  : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`
        }
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ${
            active
              ? 'bg-primary text-white'
              : mobile
                ? 'bg-slate-100 text-slate-500'
                : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
          }`}
        >
          {category.icon}
        </span>
        {mobile ? (
          <span>{category.label}</span>
        ) : (
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{category.label}</span>
            <span className="block truncate text-[11px] font-medium text-slate-400">{category.hint}</span>
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="space-y-8">
      <section className="surface-card p-6 md:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">Seller settings</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-500">
              Keep your storefront, business identity, addresses, payouts, verification, alerts, and security in clear
              grouped sections.
            </p>
          </div>

          <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-black/5 bg-white px-4 py-3 shadow-sm">
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user?.store_name || 'Seller'}
                className="h-10 w-10 shrink-0 rounded-full object-cover"
                loading="eager"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                {sellerInitials}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-gray-950">{user?.store_name || user?.name || 'Seller account'}</p>
              <p className="truncate text-xs text-gray-500">{storefrontUrl || 'Seller workspace'}</p>
            </div>
            {storefrontUrl ? (
              <Link
                to={storefrontUrl}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-primary/40 hover:text-primary"
              >
                <ExternalLink size={13} />
                View shop
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <div className="flex gap-0 lg:gap-6">
        <aside className="hidden w-[240px] shrink-0 lg:block">
          <nav
            role="navigation"
            aria-label="Seller settings sections"
            className="sticky top-24 space-y-1.5"
          >
            {CATEGORIES.map((category) => renderNavItem(category))}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-5 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {CATEGORIES.map((category) => renderNavItem(category, true))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeCategory}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {activeCategory === 'storefront' ? (
                <StorefrontSettingsPanel />
              ) : activeCategory === 'telegram' ? (
                <TelegramConnectPanel />
              ) : (
                <ProfileManager
                  key={activeCategory}
                  role="seller"
                  title={activeCategoryMeta.label}
                  description={activeCategoryMeta.hint}
                  enabledSections={activeCategoryMeta.profileSections}
                  showPageHeader={false}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default SellerSettingsPage;