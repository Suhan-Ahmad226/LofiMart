'use client';

import { DashboardLayout } from '@/src/components/DashboardLayout';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout type="admin">{children}</DashboardLayout>;
}
