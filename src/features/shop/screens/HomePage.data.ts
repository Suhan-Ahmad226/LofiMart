import { prisma } from '@/lib/server';
import { getPublicPublishedProductWhere, productSellerInclude, serializeProduct } from '@/app/api/products/shared';
import type { Product } from '@/types';

type Category = {
  id: string | number;
  name: string;
  icon?: string | null;
};

type HomeBanner = {
  id: string | number;
  title: string;
  subtitle?: string | null;
  image: string;
  link?: string | null;
  buttonText?: string | null;
  button_text?: string | null;
};

type HomepageProductGroups = {
  flashSale: Product[];
  featured: Product[];
  bestSelling: Product[];
  newArrivals: Product[];
  trending: Product[];
};

export type HomepagePayload = {
  products: Product[];
  homepage: {
    products: HomepageProductGroups;
    sellers: any[];
  };
  groups: HomepageProductGroups;
  categories: Category[];
  banners: HomeBanner[];
};

function takeProducts<T>(products: T[], start: number, count: number) {
  const result: T[] = [];
  const end = Math.min(products.length, start + count);
  for (let index = start; index < end; index += 1) {
    result.push(products[index]);
  }
  return result;
}

function groupHomepageProducts(products: Product[]): HomepageProductGroups {
  return {
    flashSale: takeProducts(products, 0, 4),
    featured: takeProducts(products, 4, 8),
    bestSelling: takeProducts(products, 12, 6),
    newArrivals: takeProducts(products, 18, 6),
    trending: takeProducts(products, 24, 6),
  };
}

export async function getHomepageData(): Promise<HomepagePayload> {
  const [products, categories, banners] = await Promise.all([
    prisma.product.findMany({
      where: getPublicPublishedProductWhere(),
      include: productSellerInclude,
      orderBy: { createdAt: 'desc' },
      take: 60,
    }),
    prisma.category.findMany({
      select: { id: true, name: true, icon: true },
      orderBy: { name: 'asc' },
    }),
    prisma.banner.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, subtitle: true, image: true, link: true, buttonText: true },
    }),
  ]);

  const productPayload = products.map(serializeProduct);
  const categoryPayload =
    categories.length > 0
      ? categories
      : Array.from(new Set(productPayload.map((product) => product.category).filter(Boolean))).map((name) => ({
          id: String(name).toLowerCase().replace(/\s+/g, '-'),
          name,
          icon: null,
        }));

  const groups = groupHomepageProducts(productPayload);

  return {
    products: productPayload,
    homepage: { products: groups, sellers: [] },
    groups,
    categories: categoryPayload,
    banners: banners.map((banner) => ({
      id: banner.id,
      title: banner.title,
      subtitle: banner.subtitle ?? '',
      image: banner.image,
      link: banner.link,
      button_text: banner.buttonText,
      buttonText: banner.buttonText,
    })),
  };
}
