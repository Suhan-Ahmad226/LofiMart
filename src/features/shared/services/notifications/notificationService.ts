/**
 * In-app notification writes.
 *
 * This used to live in `src/modules/logistics/webhookService.ts`, which was a
 * misnomer: a generic notification helper that happened to sit in the logistics
 * folder, and which admin wallet, KYC, user-moderation and payout routes all had
 * to import through a courier module. It is now where it belongs, and the
 * courier layer no longer has to be touched to add a notification call.
 */

import type { Prisma } from '@prisma/client';

import { prismaDirect } from '../database/prisma';

export type CreateNotificationInput = {
  userId: string;
  tenantId?: string | null;
  type: string;
  title: string;
  message: string;
  actionUrl?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Writes one in-app notification.
 *
 * Never throws. Notifications are a side effect of work that has already
 * succeeded — a courier status transition, a payout approval, an account being
 * unblocked — and losing the side effect must not roll back or fail the primary
 * operation. Every caller relies on that, so the guarantee is stated here rather
 * than re-implemented at each call site.
 */
export async function createNotification(params: CreateNotificationInput): Promise<void> {
  try {
    await prismaDirect.userNotification.create({
      data: {
        userId: params.userId,
        tenantId: params.tenantId ?? null,
        type: params.type,
        title: params.title,
        message: params.message,
        actionUrl: params.actionUrl ?? null,
        // `Record<string, unknown>` is not assignable to Prisma's JSON input type,
        // which cannot represent `undefined` at any depth. Callers build these
        // payloads themselves, so the cast is honest: a value that is not valid
        // JSON would have failed at runtime anyway, and this write is already
        // best-effort.
        metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
        readAt: null,
      },
    });
  } catch {
    // Deliberately swallowed. See the note above.
  }
}
