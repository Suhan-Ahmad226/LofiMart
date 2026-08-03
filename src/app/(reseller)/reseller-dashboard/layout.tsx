import { DashboardLayout } from '../../../features/shared/layout/DashboardLayout';
import { requireDashboardAccess } from '../../../server/next/requireDashboardAccess';

export default async function ResellerLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardAccess(['reseller'], '/reseller-dashboard/overview');

  return <DashboardLayout type="reseller">{children}</DashboardLayout>;
}
