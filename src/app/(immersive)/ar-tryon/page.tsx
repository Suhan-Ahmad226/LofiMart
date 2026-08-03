'use client';

import dynamic from 'next/dynamic';
import PageSkeleton from '../../../features/shared/ui/PageSkeleton';

const ARTryOnPage = dynamic(() => import('@/features/shared/immersive/ARTryOnPage'), {
  ssr: false,
  loading: () => <PageSkeleton variant="immersive" />,
});

export default ARTryOnPage;
