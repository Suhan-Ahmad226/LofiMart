import { prisma } from '@/lib/server';

export type Subsubcategory = {
  id: string | number;
  name: string;
};

export type Subcategory = {
  id: string | number;
  name: string;
  subsubcategories?: Subsubcategory[];
};

export type Category = {
  id: string | number;
  name: string;
  icon?: string | null;
  subcategories?: Subcategory[];
};

export type Product = {
  id: string | number;
  category: string | null;
};

export type CategoriesPageData = {
  categories: Category[];
  products: Product[];
};

const EMPTY_DATA: CategoriesPageData = { categories: [], products: [] };

export async function getCategoriesPageData(): Promise<CategoriesPageData> {
  try {
    const [categories, products] = await Promise.all([
      prisma.category.findMany({
        select: {
          id: true,
          name: true,
          icon: true,
          subcategories: {
            orderBy: { name: 'asc' },
            select: {
              id: true,
              name: true,
              subsubcategories: {
                orderBy: { name: 'asc' },
                select: { id: true, name: true },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.product.findMany({
        where: { productStatus: 'published' },
        select: { id: true, category: true },
        take: 200,
      }),
    ]);

    return {
      categories,
      products,
    };
  } catch (error) {
    console.error('getCategoriesPageData error:', error);
    return EMPTY_DATA;
  }
}
