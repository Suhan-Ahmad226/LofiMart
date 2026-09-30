import crypto from 'crypto';

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireRole } from '@/app/api/_compat/shared';
import { prisma } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function generateStorefrontDomainVerificationToken() {
  return `asb-${crypto.randomBytes(12).toString('hex')}`;
}

function buildStorefrontDomainVerificationPayload(domain?: string | null, token?: string | null, status?: string | null, verifiedAt?: Date | string | null) {
  const normalizedDomain = domain ? String(domain).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '') : null;
  const normalizedToken = token ? String(token) : null;
  return {
    domain: normalizedDomain,
    token: normalizedToken,
    status: status || 'unverified',
    verified_at: verifiedAt ? new Date(verifiedAt).toISOString() : null,
    txt_host: normalizedDomain ? `_amarshop-challenge.${normalizedDomain}` : null,
    cname_target: normalizedDomain ? 'stores.lofimart.com' : null,
  };
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const roleError = requireRole(['seller', 'reseller'])(user);
  if (roleError) return roleError;

  const userId = String(user.id);

  try {
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        storefrontCustomDomain: true,
      },
    });

    if (!currentUser?.storefrontCustomDomain) {
      return NextResponse.json({ error: 'Add a custom domain before refreshing the verification token.' }, { status: 400 });
    }

    const nextToken = generateStorefrontDomainVerificationToken();
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        storefrontDomainStatus: 'pending',
        storefrontDomainVerificationToken: nextToken,
        storefrontDomainVerifiedAt: null,
      },
    });

    return NextResponse.json({
      success: true,
      domain_verification: buildStorefrontDomainVerificationPayload(
        updated.storefrontCustomDomain,
        updated.storefrontDomainVerificationToken,
        updated.storefrontDomainStatus,
        updated.storefrontDomainVerifiedAt,
      ),
    });
  } catch (error) {
    console.error('POST /api/storefront-domain/refresh error:', error);
    return NextResponse.json({ error: 'Failed to refresh storefront domain verification token' }, { status: 500 });
  }
}
