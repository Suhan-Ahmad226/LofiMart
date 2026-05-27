'use client';

import dynamic from 'next/dynamic';
import PageSkeleton from '@/src/components/ui/PageSkeleton';

const ARTryOnPage = dynamic(() => import('@/src/screens/ARTryOnPage'), {
  ssr: false,
  loading: () => <PageSkeleton variant="immersive" />,
});

export default ARTryOnPage;
