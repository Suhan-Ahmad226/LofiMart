import { HomePage } from '../features/shop/screens/HomePage';
import { getHomepageData } from '../features/shop/screens/HomePage.data';

export default async function Page() {
  const initialData = await getHomepageData();

  return <HomePage initialData={initialData} />;
}