import { DashboardLayout } from '../../../features/shared/layout/DashboardLayout';
import { requireDashboardAccess } from '../../../server/next/requireDashboardAccess';
import { ClientRedirect } from '../../../features/shared/app/ClientRedirect';

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const access = await requireDashboardAccess(['customer'], '/account/dashboard');

  if (!access.authorized) {
    return <ClientRedirect to={access.redirectTo} />;
  }

  return <DashboardLayout type="customer">{children}</DashboardLayout>;
}
