'use client';

import dynamic from 'next/dynamic';
import PageSkeleton from '../../../features/shared/ui/PageSkeleton';

const RoomVisualizerPage = dynamic(
  () => import('@/features/shared/immersive/RoomVisualizerPage').then((module) => module.RoomVisualizerPage),
  {
    ssr: false,
    loading: () => <PageSkeleton variant="immersive" />,
  },
);

export default RoomVisualizerPage;
