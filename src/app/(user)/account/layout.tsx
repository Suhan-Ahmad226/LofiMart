import { DashboardLayout } from '../../../features/shared/layout/DashboardLayout';
import { requireDashboardAccess } from '../../../server/next/requireDashboardAccess';

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardAccess(['customer'], '/account/dashboard');

  return <DashboardLayout type="customer">{children}</DashboardLayout>;
}
