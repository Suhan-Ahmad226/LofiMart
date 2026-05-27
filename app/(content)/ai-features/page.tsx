'use client';

import dynamic from 'next/dynamic';
import PageSkeleton from '@/src/components/ui/PageSkeleton';

const AIFeaturesPage = dynamic(() => import('@/src/screens/AIFeaturesPage'), {
  ssr: false,
  loading: () => <PageSkeleton variant="content" />,
});

export default AIFeaturesPage;
