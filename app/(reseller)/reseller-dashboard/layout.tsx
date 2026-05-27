'use client';

import { DashboardLayout } from '@/src/components/DashboardLayout';

export default function ResellerLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout type="reseller">{children}</DashboardLayout>;
}
