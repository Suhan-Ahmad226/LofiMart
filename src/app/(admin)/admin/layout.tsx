import { DashboardLayout } from '@/src/components/DashboardLayout';
import { requireDashboardAccess } from '@/src/server/next/requireDashboardAccess';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardAccess(['admin'], '/admin/dashboard');

  return <DashboardLayout type="admin">{children}</DashboardLayout>;
}
