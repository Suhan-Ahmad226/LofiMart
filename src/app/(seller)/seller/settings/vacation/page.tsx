import { redirect } from 'next/navigation';

export default function SellerVacationSettingsRedirectPage() {
  redirect('/seller/settings?section=storefront');
}
