import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser } from '@/app/api/_compat/shared';
import { verificationSubmissionSchema } from '@/modules/profile/validation';
import { deleteManyMedia, enqueueMediaDelete, uploadMedia, validateUploadInput } from '@/lib/media';
import { takeRateLimit } from '@/features/auth/services/rateLimit';

async function handleAuditLog(
  userId: string | null | undefined,
  action: string,
  entityType: string,
  entityId?: string | null,
  metadata?: Record<string, unknown>,
) {
  await prisma.auditLog.create({
    data: {
      userId: userId ? String(userId) : null,
      action,
      entityType,
      entityId: entityId || null,
      metadata: metadata ?? {},
    },
  });
}

function serializeVerificationSubmission(submission: any) {
  if (!submission) return null;

  return {
    id: submission.id,
    role: submission.role,
    status: submission.status,
    document_type: submission.documentType,
    business_name: submission.businessName ?? null,
    business_license_url: submission.businessLicenseUrl ?? null,
    notes: submission.notes ?? null,
    rejection_reason: submission.rejectionReason ?? null,
    risk_score: submission.riskScore ?? 0,
    submitted_at: submission.submittedAt ? new Date(submission.submittedAt).toISOString() : undefined,
    reviewed_at: submission.reviewedAt ? new Date(submission.reviewedAt).toISOString() : null,
    reviewed_by: submission.reviewedBy
      ? { id: submission.reviewedBy.id, name: submission.reviewedBy.name, email: submission.reviewedBy.email }
      : null,
    documents: Array.isArray(submission.documents)
      ? submission.documents.map((document: any) => ({
          id: document.id,
          type: document.type,
          label: document.label,
          url: document.url,
          mime_type: document.mimeType ?? null,
          size_bytes: document.sizeBytes ?? null,
        }))
      : [],
  };
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const submission = await prisma.verificationSubmission.findUnique({
    where: { userId: String(user.id) },
    include: {
      reviewedBy: { select: { id: true, name: true, email: true } },
      documents: true,
    },
  });

  return NextResponse.json({ success: true, verification: serializeVerificationSubmission(submission) });
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  if (!['seller', 'reseller'].includes(String(user.role))) {
    return NextResponse.json(
      { success: false, error: { code: 'KYC_ROLE_REQUIRED', message: 'KYC submission is only available for seller and reseller accounts' } },
      { status: 403 },
    );
  }

  const { allowed, resetAfterMs } = await takeRateLimit(`kyc-submit:${user.id}`, { limit: 10, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down.' } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(resetAfterMs / 1000)) } },
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = verificationSubmissionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_KYC_PAYLOAD', message: parsed.error.issues[0]?.message || 'Invalid verification payload' } },
      { status: 400 },
    );
  }

  const uploadedMedia: Array<{ publicId: string | null; resourceType: string }> = [];

  try {
    const uploads = await Promise.all(
      Object.entries(parsed.data.documents).map(async ([key, file]) => {
        if (!file) return null;

        validateUploadInput({
          dataUrl: file.data_url,
          mimeType: file.mime_type,
          sizeBytes: file.size_bytes,
        });

        const resourceType = file.mime_type === 'application/pdf' ? 'raw' : 'auto';
        const uploaded = await uploadMedia({
          dataUrl: file.data_url,
          mimeType: file.mime_type,
          sizeBytes: file.size_bytes,
          folder: 'amarshop/kyc',
          publicIdPrefix: `${user.id}-${key}`,
          resourceType,
          ownerType: 'User',
          ownerId: String(user.id),
          entityType: 'VerificationSubmission',
          entityId: String(user.id),
          fieldName: key,
        });

        uploadedMedia.push({
          publicId: uploaded.publicId ?? null,
          resourceType: file.mime_type === 'application/pdf' ? 'raw' : 'image',
        });

        return {
          type: key,
          label: key.replace(/_/g, ' '),
          url: uploaded.url,
          publicId: uploaded.publicId,
          mimeType: file.mime_type,
          sizeBytes: file.size_bytes,
        };
      }),
    );

    const filteredUploads = uploads.filter(Boolean) as Array<Record<string, unknown>>;

    const persisted = await prisma.$transaction(async (tx) => {
      const existing = await tx.verificationSubmission.findUnique({
        where: { userId: String(user.id) },
        include: { documents: true },
      });

      const replacedDocuments = existing?.documents ?? [];

      if (existing) {
        await tx.verificationDocument.deleteMany({ where: { verificationId: existing.id } });
      }

      const submission = await tx.verificationSubmission.upsert({
        where: { userId: String(user.id) },
        update: {
          role: String(user.role),
          documentType: parsed.data.document_type,
          businessName: parsed.data.business_name || null,
          businessLicenseUrl: filteredUploads.find((item) => item.type === 'business_license')?.url as string | undefined,
          notes: parsed.data.notes || null,
          status: 'pending',
          rejectionReason: null,
          submittedAt: new Date(),
          reviewedAt: null,
          reviewedById: null,
          documents: {
            create: filteredUploads.map((item) => ({
              type: String(item.type),
              label: String(item.label),
              url: String(item.url),
              publicId: item.publicId ? String(item.publicId) : null,
              mimeType: item.mimeType ? String(item.mimeType) : null,
              sizeBytes: item.sizeBytes ? Number(item.sizeBytes) : null,
            })),
          },
        },
        create: {
          userId: String(user.id),
          role: String(user.role),
          documentType: parsed.data.document_type,
          businessName: parsed.data.business_name || null,
          businessLicenseUrl: filteredUploads.find((item) => item.type === 'business_license')?.url as string | undefined,
          notes: parsed.data.notes || null,
          status: 'pending',
          submittedAt: new Date(),
          documents: {
            create: filteredUploads.map((item) => ({
              type: String(item.type),
              label: String(item.label),
              url: String(item.url),
              publicId: item.publicId ? String(item.publicId) : null,
              mimeType: item.mimeType ? String(item.mimeType) : null,
              sizeBytes: item.sizeBytes ? Number(item.sizeBytes) : null,
            })),
          },
        },
        include: {
          reviewedBy: { select: { id: true, name: true, email: true } },
          documents: true,
        },
      });

      const publicIds = filteredUploads
        .map((item) => (typeof item.publicId === 'string' ? item.publicId : null))
        .filter((publicId): publicId is string => Boolean(publicId));

      if (publicIds.length) {
        await tx.mediaAsset.updateMany({
          where: { publicId: { in: publicIds } },
          data: { entityType: 'VerificationSubmission', entityId: submission.id },
        });
      }

      return { submission, replacedDocuments };
    });

    const oldMedia = persisted.replacedDocuments.map((document) => ({
      url: document.url,
      publicId: document.publicId,
      resourceType: document.mimeType === 'application/pdf' ? 'raw' : 'image',
    }));
    if (oldMedia.length) {
      const replacedCleanup = await deleteManyMedia(oldMedia);
      await Promise.all(
        replacedCleanup.errors.map((failed) =>
          enqueueMediaDelete({
            publicId: failed.item.publicId,
            url: failed.item.url,
            resourceType: failed.item.resourceType,
            reason: 'verification-replaced-old-asset',
          }),
        ),
      );
    }

    await handleAuditLog(String(user.id), 'kyc.submitted', 'verification_submission', persisted.submission.id, {
      document_type: persisted.submission.documentType,
    });

    return NextResponse.json({ success: true, verification: serializeVerificationSubmission(persisted.submission) });
  } catch (error: unknown) {
    const cleanup = await deleteManyMedia(uploadedMedia);
    await Promise.all(
      cleanup.errors.map((failed) =>
        enqueueMediaDelete({
          publicId: failed.item.publicId,
          resourceType: failed.item.resourceType,
          reason: 'verification-db-failed-new-asset',
        }),
      ),
    );

    console.error('POST /api/users/verification error:', error);
    const message = error instanceof Error ? error.message : 'Failed to submit verification';
    return NextResponse.json({ success: false, error: { code: 'KYC_SUBMISSION_FAILED', message } }, { status: 500 });
  }
}
