'use client';

import dynamic from 'next/dynamic';
import PageSkeleton from '@/src/components/ui/PageSkeleton';

const RoomVisualizerPage = dynamic(
  () => import('@/src/features/shared/immersive/RoomVisualizerPage').then((module) => module.RoomVisualizerPage),
  {
    ssr: false,
    loading: () => <PageSkeleton variant="immersive" />,
  },
);

export default RoomVisualizerPage;
