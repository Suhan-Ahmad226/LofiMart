import { DashboardLayout } from '../../../features/shared/layout/DashboardLayout';
import { requireDashboardAccess } from '../../../server/next/requireDashboardAccess';

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardAccess(['seller'], '/seller/dashboard');

  return <DashboardLayout type="seller">{children}</DashboardLayout>;
}
