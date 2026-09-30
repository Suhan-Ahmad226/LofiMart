import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireRole } from '@/app/api/_compat/shared';
import { prisma } from '@/lib/server';
import * as dns from 'dns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

async function resolveTxt(host: string): Promise<string[][]> {
  try {
    const answers = await dns.promises.resolveTxt(host);
    return answers.map((entry: string[]) => [entry.join('')]);
  } catch {
    return [];
  }
}

async function resolveCname(domain: string): Promise<string[]> {
  try {
    return await dns.promises.resolveCname(domain);
  } catch {
    return [];
  }
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
        storefrontDomainVerificationToken: true,
        storefrontDomainStatus: true,
        storefrontDomainVerifiedAt: true,
      },
    });

    if (!currentUser?.storefrontCustomDomain || !currentUser?.storefrontDomainVerificationToken) {
      return NextResponse.json({ error: 'Add a valid custom domain before verification.' }, { status: 400 });
    }

    const domain = currentUser.storefrontCustomDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const token = String(currentUser.storefrontDomainVerificationToken);
    const txtHost = `_amarshop-challenge.${domain}`;

    let txtMatches = false;
    let cnameMatches = false;

    try {
      const txtAnswers = await resolveTxt(txtHost);
      txtMatches = txtAnswers.some((entry) => entry.join('') === token);
    } catch {
      txtMatches = false;
    }

    try {
      const cnameAnswers = await resolveCname(domain);
      cnameMatches = cnameAnswers.some((entry) => String(entry).toLowerCase().replace(/\.$/, '') === 'stores.lofimart.com');
    } catch {
      cnameMatches = false;
    }

    const verified = txtMatches && cnameMatches;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        storefrontDomainStatus: verified ? 'verified' : 'pending',
        storefrontDomainVerifiedAt: verified ? new Date() : null,
      },
    });

    return NextResponse.json({
      success: verified,
      checks: {
        txt_record_found: txtMatches,
        cname_record_found: cnameMatches,
      },
      domain_verification: buildStorefrontDomainVerificationPayload(
        updated.storefrontCustomDomain,
        updated.storefrontDomainVerificationToken,
        updated.storefrontDomainStatus,
        updated.storefrontDomainVerifiedAt,
      ),
    });
  } catch (error) {
    console.error('POST /api/storefront-domain/verify error:', error);
    return NextResponse.json({ error: 'Failed to verify storefront domain' }, { status: 500 });
  }
}
