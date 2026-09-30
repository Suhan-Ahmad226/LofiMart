import { Suspense } from 'react';
import { SellerPickupLocationsPage } from '../../../../features/seller/screens/PickupLocations';

export default function SellerPickupLocationsRoute() {
  return (
    <Suspense fallback={null}>
      <SellerPickupLocationsPage />
    </Suspense>
  );
}
