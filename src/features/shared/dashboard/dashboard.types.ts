import type { FormEvent, ReactNode } from 'react';

export type DashboardRole = 'customer' | 'seller' | 'admin' | 'reseller';

export type DashboardMenuItem = {
  icon: ReactNode;
  label: string;
  path: string;
};

export type DashboardMenuSection = {
  title: string;
  items: DashboardMenuItem[];
};

export type DashboardMobileAction = {
  label: string;
  path: string;
  icon: ReactNode;
};

export type DashboardProfileItem = {
  label: string;
  detail: string;
  icon: ReactNode;
  path: string;
};

export interface DashboardConfig {
  role: DashboardRole;
  /** Short uppercase label under the LofiMart brand chip. */
  subtitle: string;
  /** Role label shown under the user name in the profile pill. */
  profileRoleLabel: string;
  /** Optional verified badge label (seller only today). */
  verifiedBadge?: string;
  /** Landing path for the brand chip / empty search. */
  brandHome: string;
  searchPlaceholder: string;
  mobileSearchPlaceholder: string;
  quickAccessPath: string;
  helpPath: string;
  sections: DashboardMenuSection[];
  mobileActions: DashboardMobileAction[];
  profileMenu: DashboardProfileItem[];
  bottomNav: DashboardMenuItem[];
  /** Pinned account/settings icons shown at the bottom of the sidebar. */
  footerMenu: DashboardMenuItem[];
}

export type DashboardSearchSubmitHandler = (event: FormEvent<HTMLFormElement>) => void;