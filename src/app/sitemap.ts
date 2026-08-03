import type { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lofimart.vercel.app';

const staticRoutes: MetadataRoute.Sitemap = [
  { url: siteUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
  { url: `${siteUrl}/shop`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
  { url: `${siteUrl}/categories`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
  { url: `${siteUrl}/flash-sale`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
  { url: `${siteUrl}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
  { url: `${siteUrl}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
  { url: `${siteUrl}/blog`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
  { url: `${siteUrl}/help`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  { url: `${siteUrl}/returns`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
  { url: `${siteUrl}/privacy`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
  { url: `${siteUrl}/terms`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
  { url: `${siteUrl}/reseller`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
  { url: `${siteUrl}/seller`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
  { url: `${siteUrl}/community`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.7 },
  { url: `${siteUrl}/search`, lastModified: new Date(), changeFrequency: 'never', priority: 0.3 },
  { url: `${siteUrl}/bazaar`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.6 },
  { url: `${siteUrl}/bazaar/aigiftfinder`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  { url: `${siteUrl}/bazaar/loyalty-rewards`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  { url: `${siteUrl}/bazaar/reseller-discovery`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  { url: `${siteUrl}/ai-features`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  { url: `${siteUrl}/pwa`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return staticRoutes.map((route) => ({
    ...route,
    lastModified: new Date(),
  }));
}
