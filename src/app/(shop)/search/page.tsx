import { getSearchPageData } from '@/features/shop/screens/SearchPage.data';
import { SearchPage as SearchPageClient } from '@/features/shop/screens/SearchPage';

export const dynamic = 'force-dynamic';

export default async function SearchPageRoute({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const query = resolvedSearchParams.q ?? '';
  const initialData = await getSearchPageData(query);

  return <SearchPageClient initialData={initialData} />;
}
