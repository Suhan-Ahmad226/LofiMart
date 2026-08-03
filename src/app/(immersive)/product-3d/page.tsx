'use client';

import dynamic from 'next/dynamic';
import PageSkeleton from '../../../features/shared/ui/PageSkeleton';

const Product3DDemoPage = dynamic(
  () => import('@/features/shared/immersive/Product3DDemoPage').then((module) => module.Product3DDemoPage),
  {
    ssr: false,
    loading: () => <PageSkeleton variant="immersive" />,
  },
);

export default Product3DDemoPage;
