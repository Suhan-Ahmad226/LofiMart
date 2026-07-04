import { DashboardLayout } from '@/src/components/DashboardLayout';
import { requireDashboardAccess } from '@/src/server/next/requireDashboardAccess';

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardAccess(['customer'], '/account/dashboard');

  return <DashboardLayout type="customer">{children}</DashboardLayout>;
}
