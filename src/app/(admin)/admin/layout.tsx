import { DashboardLayout } from '../../../features/shared/layout/DashboardLayout';
import { requireDashboardAccess } from '../../../server/next/requireDashboardAccess';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardAccess(['admin'], '/admin/dashboard');

  return <DashboardLayout type="admin">{children}</DashboardLayout>;
}
