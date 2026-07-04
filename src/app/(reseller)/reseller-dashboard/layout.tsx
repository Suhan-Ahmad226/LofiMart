import { DashboardLayout } from '@/src/components/DashboardLayout';
import { requireDashboardAccess } from '@/src/server/next/requireDashboardAccess';

export default async function ResellerLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardAccess(['reseller'], '/reseller-dashboard/overview');

  return <DashboardLayout type="reseller">{children}</DashboardLayout>;
}
