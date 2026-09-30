import { DashboardLayout } from '../../../features/shared/layout/DashboardLayout';
import { requireDashboardAccess } from '../../../server/next/requireDashboardAccess';
import { ClientRedirect } from '../../../features/shared/app/ClientRedirect';

export default async function ResellerLayout({ children }: { children: React.ReactNode }) {
  const access = await requireDashboardAccess(['reseller'], '/reseller-dashboard/overview');

  if (!access.authorized) {
    return <ClientRedirect to={access.redirectTo} />;
  }

  return <DashboardLayout type="reseller">{children}</DashboardLayout>;
}
