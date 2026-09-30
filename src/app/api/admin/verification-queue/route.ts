import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireAdminRole } from '@/app/api/_compat/shared';
import { prisma } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serializeVerificationSubmission(submission: any) {
  if (!submission) return null;

  return {
    id: submission.id,
    user_id: submission.userId,
    status: submission.status,
    submitted_at: submission.submittedAt ? new Date(submission.submittedAt).toISOString() : undefined,
    reviewed_at: submission.reviewedAt ? new Date(submission.reviewedAt).toISOString() : null,
    rejection_reason: submission.rejectionReason ?? null,
    risk_score: submission.riskScore ?? 0,
    notes: submission.notes ?? null,
    user: submission.user
      ? {
          id: submission.user.id,
          name: submission.user.name,
          email: submission.user.email,
          role: submission.user.role,
          avatar_url: submission.user.avatarUrl ?? null,
        }
      : null,
    reviewed_by: submission.reviewedBy
      ? {
          id: submission.reviewedBy.id,
          name: submission.reviewedBy.name,
          email: submission.reviewedBy.email,
        }
      : null,
    documents: submission.documents?.map((doc: any) => ({
      id: doc.id,
      type: doc.type,
      url: doc.url,
      status: doc.status,
      created_at: doc.createdAt ? new Date(doc.createdAt).toISOString() : undefined,
    })) ?? [],
  };
}

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const roleError = requireAdminRole(user);
  if (roleError) return roleError;

  const submissions = await prisma.verificationSubmission.findMany({
    orderBy: [{ status: 'asc' }, { submittedAt: 'desc' }],
    include: {
      user: {
        select: { id: true, name: true, email: true, role: true, avatarUrl: true },
      },
      reviewedBy: {
        select: { id: true, name: true, email: true },
      },
      documents: true,
    },
  });

  return NextResponse.json(
    submissions.map((submission) => ({
      ...serializeVerificationSubmission(submission),
      user: submission.user,
    })),
  );
}
