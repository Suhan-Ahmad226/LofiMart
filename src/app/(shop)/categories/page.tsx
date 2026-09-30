import type { Metadata } from 'next';
import { getCategoriesPageData } from '@/features/shop/screens/CategoriesPage.data';
import CategoriesClient from '@/features/shop/screens/CategoriesPage';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Categories',
  description: 'Browse LofiMart product categories — fashion, electronics, groceries, home and living, beauty, sports and more — to find what you need faster.',
  alternates: { canonical: '/categories' },
  openGraph: {
    title: 'Categories | LofiMart',
    description: 'Browse LofiMart product categories — fashion, electronics, groceries, home and living, beauty, sports and more — to find what you need faster.',
  },
};

export default async function CategoriesPage() {
  const initialData = await getCategoriesPageData();

  return <CategoriesClient initialData={initialData} />;
}
