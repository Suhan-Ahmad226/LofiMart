import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/server';
import PublicSellerStorefront from '@/features/shop/screens/PublicSellerStorefront';

export const dynamic = 'force-dynamic';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lofimart.vercel.app';

type StorePageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: StorePageProps): Promise<Metadata> {
  const { slug } = await params;

  const seller = await prisma.user.findFirst({
    where: {
      role: 'seller',
      storefrontSlug: slug,
      sellerStatus: 'approved',
      storefrontPublished: true,
      profileVisibility: { not: 'private' },
    },
    select: {
      id: true,
      name: true,
      storeName: true,
      bio: true,
      storefrontHeadline: true,
      storefrontSlug: true,
    },
  });

  if (!seller || !seller.storefrontSlug) return {};

  const title = seller.storeName || seller.name || 'Seller store';
  const description =
    seller.storefrontHeadline ||
    seller.bio ||
    `Shop ${title}'s curated selection of products, offers, and campaign picks exclusively on LofiMart.`;
  const canonicalUrl = `${siteUrl}/store/${seller.storefrontSlug}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: `${title} | LofiMart Store`,
      description,
      url: canonicalUrl,
      type: 'website',
      siteName: 'LofiMart',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | LofiMart Store`,
      description,
    },
  };
}

export default async function StorePage({ params }: StorePageProps) {
  const { slug } = await params;

  const seller = await prisma.user.findFirst({
    where: {
      role: 'seller',
      storefrontSlug: slug,
    },
    select: { id: true },
  });

  if (!seller) notFound();

  return <PublicSellerStorefront />;
}
