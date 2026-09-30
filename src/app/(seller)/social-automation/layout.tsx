import { DashboardLayout } from '../../../features/shared/layout/DashboardLayout';
import { requireDashboardAccess } from '../../../server/next/requireDashboardAccess';
import { ClientRedirect } from '../../../features/shared/app/ClientRedirect';

export default async function SocialAutomationLayout({ children }: { children: React.ReactNode }) {
  const access = await requireDashboardAccess(['seller'], '/social-automation');

  if (!access.authorized) {
    return <ClientRedirect to={access.redirectTo} />;
  }

  return <DashboardLayout type="seller">{children}</DashboardLayout>;
}
