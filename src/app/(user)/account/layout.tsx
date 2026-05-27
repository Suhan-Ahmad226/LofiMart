'use client';

import { DashboardLayout } from '@/src/components/DashboardLayout';

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout type="customer">{children}</DashboardLayout>;
}
