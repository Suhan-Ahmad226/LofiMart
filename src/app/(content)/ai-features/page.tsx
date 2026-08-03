'use client';

import dynamic from 'next/dynamic';
import PageSkeleton from '../../../features/shared/ui/PageSkeleton';

const AIFeaturesPage = dynamic(() => import('@/features/ai/screens/AIFeaturesPage'), {
  ssr: false,
  loading: () => <PageSkeleton variant="content" />,
});

export default AIFeaturesPage;
