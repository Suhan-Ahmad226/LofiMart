import type { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lofimart.vercel.app';

const publicRoutes = [
  '',
  '/shop',
  '/categories',
  '/flash-sale',
  '/about',
  '/contact',
  '/blog',
  '/help',
  '/returns',
  '/privacy',
  '/terms',
  '/reseller',
  '/seller',
  '/login',
  '/register',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return publicRoutes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified: now,
    changeFrequency: route === '' || route === '/shop' ? 'daily' : 'weekly',
    priority: route === '' ? 1 : route === '/shop' ? 0.9 : 0.7,
  }));
}
