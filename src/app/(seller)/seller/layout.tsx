import { DashboardLayout } from '@/src/components/DashboardLayout';
import { requireDashboardAccess } from '@/src/server/next/requireDashboardAccess';

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardAccess(['seller'], '/seller/dashboard');

  return <DashboardLayout type="seller">{children}</DashboardLayout>;
}
