'use client';

import { DashboardLayout } from '@/src/components/DashboardLayout';

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout type="seller">{children}</DashboardLayout>;
}
