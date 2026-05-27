import { redirect } from 'next/navigation';

export default function SellerNotificationSettingsRedirectPage() {
  redirect('/seller/settings?section=notifications');
}
