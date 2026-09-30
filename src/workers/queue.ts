import { Queue, Worker } from 'bullmq';
import type { JobsOptions } from 'bullmq';
import { getServerEnv } from '../lib/env';
import { createBullConnection, ensureRedis } from '../features/shared/services/messaging/redis';
import { inventoryModule } from '../modules/inventory/index';
import { prisma } from '../features/shared/services/database/prisma';
import { releaseExpiredReservations, resetProductStockCache, getAvailableStock } from '../modules/inventory/stockOps';
import { runDueSocialWork } from '../features/social-automation/services/runner.service';
import { logger } from '../lib/logger';
import { getOrSetCache, deleteCacheByPrefix } from '../features/shared/services/cache/store';
import { cleanupUnassociatedMediaUploads, cleanupUserByIdentifiers, handleMediaDeleteJob } from '../lib/media/cleanup';
import { runCourierBookingJob } from '../features/courier/services/bookingJobHandler';
import type { CourierBookingJobData } from '../features/courier/services/bookingJobHandler';
import { reconcileDueShipments } from '../features/courier/services/reconciliationService';

export const QUEUE_NAMES = {
  inventoryAlerts: 'inventory-alerts',
  cacheWarm: 'cache-warm',
  orderProcessing: 'order-processing',
  paymentProcessing: 'payment-processing',
  email: 'email',
  notifications: 'notifications',
  analytics: 'analytics',
  stockUpdates: 'stock-updates',
  cartRecovery: 'cart-recovery',
  reservationSweep: 'reservation-sweep',
  socialAutomation: 'social-automation',
  mediaCleanup: 'media-cleanup',
  courierBooking: 'courier-booking',
  courierReconciliation: 'courier-reconciliation',
} as const;

type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const queueMap = new Map<QueueName, Queue>();

async function createQueue(name: QueueName) {
  const connection = createBullConnection() as any;
  const env = getServerEnv();

  return new Queue(name, {
    connection,
    prefix: env.QUEUE_PREFIX,
    skipVersionCheck: true,
    defaultJobOptions: {
      attempts: env.QUEUE_DEFAULT_JOB_ATTEMPTS,
      backoff: {
        type: 'exponential',
        delay: env.QUEUE_DEFAULT_JOB_BACKOFF_MS,
      },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  });
}

export async function getQueue(name: QueueName) {
  const existing = queueMap.get(name);
  if (existing) return existing;

  const queue = await createQueue(name);
  queueMap.set(name, queue);
  return queue;
}

export async function enqueueJob(name: QueueName, jobName: string, data: unknown, opts?: JobsOptions) {
  const queue = await getQueue(name);
  return queue.add(jobName, data, opts);
}

function sanitizeJobId(input: string) {
  return input.replace(/[:\s]+/g, '-');
}

export async function enqueueInventoryAlertScan(sellerId?: string) {
  return enqueueJob(QUEUE_NAMES.inventoryAlerts, 'scan-low-stock', { sellerId });
}

export async function enqueueCacheWarmup(tags: string[]) {
  return enqueueJob(QUEUE_NAMES.cacheWarm, 'warm-cache', { tags });
}

export async function enqueueOrderProcessing(data: { orderId: string; userId: string; tenantId?: string | null }) {
  return enqueueJob(QUEUE_NAMES.orderProcessing, 'process-order', data, {
    jobId: sanitizeJobId(`order-processing-${data.orderId}`),
  });
}

export async function enqueuePaymentProcessing(data: {
  paymentId: string;
  provider: string;
  orderId?: string;
  userId?: string;
  tenantId?: string | null;
}) {
  return enqueueJob(QUEUE_NAMES.paymentProcessing, 'process-payment', data, {
    jobId: sanitizeJobId(`payment-processing-${data.paymentId}`),
  });
}

export async function enqueueEmail(
  data: { to: string; subject: string; template: string; payload?: Record<string, unknown> },
  opts?: { jobId?: string },
) {
  return enqueueJob(QUEUE_NAMES.email, 'send-email', data, opts?.jobId ? { jobId: sanitizeJobId(opts.jobId) } : undefined);
}

export async function enqueueNotification(data: { userId: string; channel: string; message: string }) {
  return enqueueJob(QUEUE_NAMES.notifications, 'send-notification', data, {
    jobId: sanitizeJobId(`notification-${data.userId}-${data.channel}`),
  });
}

/**
 * Queues a courier booking.
 *
 * The `jobId` is the shipment id, so enqueueing the same shipment twice while a
 * job is still queued collapses into one. That is a convenience, not the safety
 * mechanism — the booking service's own claim is what actually prevents a
 * duplicate parcel, and it holds even if this queue is lost entirely.
 */
export async function enqueueCourierBooking(data: { shipmentId: string; providerCode: string }) {
  return enqueueJob(QUEUE_NAMES.courierBooking, 'book-shipment', data, {
    jobId: sanitizeJobId(`courier-booking-${data.shipmentId}`),
    attempts: 5,
    backoff: { type: 'exponential', delay: 30_000 },
  });
}

/** Runs the courier reconciliation sweep immediately instead of waiting for the timer. */
export async function enqueueCourierReconciliationSweep() {
  return enqueueJob(QUEUE_NAMES.courierReconciliation, 'reconcile-shipments', { ts: Date.now() }, {
    jobId: sanitizeJobId(`courier-reconciliation-manual-${Date.now()}`),
  });
}

export async function enqueueAnalyticsEvent(data: { name: string; payload: Record<string, unknown> }) {
  return enqueueJob(QUEUE_NAMES.analytics, 'track-analytics-event', data);
}

export async function enqueueStockUpdate(data: { productId: string; delta: number; reason: string; warehouseId?: string }) {
  return enqueueJob(QUEUE_NAMES.stockUpdates, 'inventory-stock-update', data, {
    jobId: sanitizeJobId(`stock-update-${data.productId}-${data.reason}`),
  });
}

export async function enqueueCartRecovery(data: {
  userId: string;
  email: string;
  name?: string | null;
  tenantId?: string | null;
  cartKey: string;
  cartRecoveryDelayMins: number;
}) {
  return enqueueJob(
    QUEUE_NAMES.cartRecovery,
    'cart-recovery-email',
    data,
    {
      delay: Math.max(1, data.cartRecoveryDelayMins) * 60 * 1000,
      jobId: sanitizeJobId(`cart-recovery-${data.userId}`),
    },
  );
}

export async function cancelCartRecovery(userId: string) {
  const queue = await getQueue(QUEUE_NAMES.cartRecovery);
  const job = await queue.getJob(sanitizeJobId(`cart-recovery-${userId}`));
  if (job) {
    await job.remove().catch(() => undefined);
  }
}

export async function getQueueHealth() {
  const inventoryQueue = await getQueue(QUEUE_NAMES.inventoryAlerts);
  const cacheQueue = await getQueue(QUEUE_NAMES.cacheWarm);
  const orderProcessingQueue = await getQueue(QUEUE_NAMES.orderProcessing);
  const paymentProcessingQueue = await getQueue(QUEUE_NAMES.paymentProcessing);
  const emailQueue = await getQueue(QUEUE_NAMES.email);
  const notificationsQueue = await getQueue(QUEUE_NAMES.notifications);
  const analyticsQueue = await getQueue(QUEUE_NAMES.analytics);
  const stockUpdatesQueue = await getQueue(QUEUE_NAMES.stockUpdates);
  const cartRecoveryQueue = await getQueue(QUEUE_NAMES.cartRecovery);
  const reservationSweepQueue = await getQueue(QUEUE_NAMES.reservationSweep);
  const socialAutomationQueue = await getQueue(QUEUE_NAMES.socialAutomation);
  const mediaCleanupQueue = await getQueue(QUEUE_NAMES.mediaCleanup);
  const courierBookingQueue = await getQueue(QUEUE_NAMES.courierBooking);
  const courierReconciliationQueue = await getQueue(QUEUE_NAMES.courierReconciliation);

  return {
    ok: true,
    queues: {
      [QUEUE_NAMES.inventoryAlerts]: await inventoryQueue.getJobCounts(),
      [QUEUE_NAMES.cacheWarm]: await cacheQueue.getJobCounts(),
      [QUEUE_NAMES.orderProcessing]: await orderProcessingQueue.getJobCounts(),
      [QUEUE_NAMES.paymentProcessing]: await paymentProcessingQueue.getJobCounts(),
      [QUEUE_NAMES.email]: await emailQueue.getJobCounts(),
      [QUEUE_NAMES.notifications]: await notificationsQueue.getJobCounts(),
      [QUEUE_NAMES.analytics]: await analyticsQueue.getJobCounts(),
      [QUEUE_NAMES.stockUpdates]: await stockUpdatesQueue.getJobCounts(),
      [QUEUE_NAMES.cartRecovery]: await cartRecoveryQueue.getJobCounts(),
      [QUEUE_NAMES.reservationSweep]: await reservationSweepQueue.getJobCounts(),
      [QUEUE_NAMES.socialAutomation]: await socialAutomationQueue.getJobCounts(),
      [QUEUE_NAMES.mediaCleanup]: await mediaCleanupQueue.getJobCounts(),
      [QUEUE_NAMES.courierBooking]: await courierBookingQueue.getJobCounts(),
      [QUEUE_NAMES.courierReconciliation]: await courierReconciliationQueue.getJobCounts(),
    },
  };
}

let webpush: any = null;
async function getWebPushClient() {
  if (webpush) return webpush;
  const vapidPublic = process.env.WEB_PUSH_PUBLIC_KEY;
  const vapidPrivate = process.env.WEB_PUSH_PRIVATE_KEY;
  if (!vapidPublic || !vapidPrivate) return null;
  const module = await import('web-push');
  webpush = module.default;
  webpush.setVapidDetails(
    'mailto:' + (process.env.NOTIFY_FROM_EMAIL || 'no-reply@amarshop.local'),
    vapidPublic,
    vapidPrivate,
  );
  return webpush;
}

async function sendPushNotification(userId: string, title: string, body: string) {
  const client = await getWebPushClient();
  if (!client) return;

  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
      select: { data: true },
    });
    for (const sub of subscriptions) {
      try {
        await client.sendNotification(sub.data, JSON.stringify({ title, body }));
      } catch (err) {
        logger.warn('worker.push.send_failed', {
          userId,
          endpoint: (sub.data as any)?.endpoint,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    logger.error('worker.push.subscriptions_fetch_failed', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function validateString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

export async function startWorkers() {
  const connection = createBullConnection() as any;
  const env = getServerEnv();

  const inventoryWorker = new Worker(
    QUEUE_NAMES.inventoryAlerts,
    async (job) => {
      try {
        const sellerId = typeof job.data?.sellerId === 'string' ? job.data.sellerId : undefined;
        const threshold = typeof env.LOW_STOCK_THRESHOLD === 'number' ? env.LOW_STOCK_THRESHOLD : 5;
        const products = await inventoryModule.scanLowStockProducts(sellerId, threshold);

        return {
          scanned: products.length,
          sellerId: sellerId ?? null,
        };
      } catch (error) {
        logger.error('worker.inventory.scan_failed', {
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    {
      connection,
      prefix: env.QUEUE_PREFIX,
      skipVersionCheck: true,
    },
  );

  const cacheWorker = new Worker(
    QUEUE_NAMES.cacheWarm,
    async (job) => {
      try {
        const tags = Array.isArray(job.data?.tags) ? job.data.tags : [];
        const warmed: string[] = [];

        for (const tag of tags) {
          if (typeof tag !== 'string') continue;
          const cacheKey = `warm:${tag}`;
          try {
            await getOrSetCache(cacheKey, async () => ({ warmedAt: Date.now(), tag }), 300);
            warmed.push(cacheKey);
          } catch (err) {
            logger.warn('worker.cache.warm_failed', {
              tag,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        return { warmed: warmed.length, tags: warmed };
      } catch (error) {
        logger.error('worker.cache.warm_failed', {
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error),
        });
        return { warmed: 0, tags: [] };
      }
    },
    {
      connection,
      prefix: env.QUEUE_PREFIX,
      skipVersionCheck: true,
    },
  );

  const emailWorker = new Worker(
    QUEUE_NAMES.email,
    async (job) => {
      try {
        const smtpHost = process.env.SMTP_HOST;
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;
        const smtpFrom = process.env.SMTP_FROM || process.env.NOTIFY_FROM_EMAIL || 'no-reply@amarshop.local';

        if (!smtpHost || !smtpUser || !smtpPass) {
          return {
            delivered: false,
            skipped: true,
            reason: 'smtp_not_configured',
            to: typeof job.data?.to === 'string' ? job.data.to : null,
            template: typeof job.data?.template === 'string' ? job.data.template : null,
          };
        }

        const to = validateString(job.data?.to, 'to');
        const subject = typeof job.data?.subject === 'string' && job.data.subject.trim()
          ? job.data.subject.trim()
          : 'LofiMart notification';
        const payload = typeof job.data?.payload === 'object' && job.data.payload !== null
          ? job.data.payload
          : {};
        const html = typeof payload.html === 'string'
          ? payload.html
          : `<p>${String(payload.message || 'You have a new update from LofiMart.')}</p>`;

        const nodemailer = (await import('nodemailer')).default;
        const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
        const transport = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          requireTLS: smtpPort !== 465,
          greetingTimeout: 30_000,
          connectionTimeout: 60_000,
          socketTimeout: 300_000,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });

        await transport.sendMail({
          from: smtpFrom,
          to,
          subject,
          html,
        });

        return {
          delivered: true,
          to,
          template: typeof job.data?.template === 'string' ? job.data.template : null,
        };
      } catch (error) {
        logger.error('worker.email.send_failed', {
          jobId: job.id,
          to: typeof job.data?.to === 'string' ? job.data.to : null,
          template: typeof job.data?.template === 'string' ? job.data.template : null,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    {
      connection,
      prefix: env.QUEUE_PREFIX,
      skipVersionCheck: true,
    },
  );

  const orderProcessingWorker = new Worker(
    QUEUE_NAMES.orderProcessing,
    async (job) => {
      try {
        const orderId = validateString(job.data?.orderId, 'orderId');
        const userId = validateString(job.data?.userId, 'userId');
        const tenantId = typeof job.data?.tenantId === 'string' ? job.data.tenantId : null;

        const order = await prisma.order.findUnique({
          where: { id: orderId },
          include: {
            user: { select: { id: true, name: true, email: true } },
            items: { include: { product: { select: { name: true } } } },
          },
        });

        if (!order) {
          logger.warn('worker.order.not_found', { orderId, jobId: job.id });
          return { processed: false, reason: 'order_not_found', orderId };
        }

        if (order.userId !== userId) {
          logger.warn('worker.order.user_mismatch', { orderId, userId, actualUserId: order.userId, jobId: job.id });
          return { processed: false, reason: 'user_mismatch', orderId };
        }

        const updatedOrder = await prisma.order.update({
          where: { id: orderId },
          data: { status: 'processing' },
        });

        const itemSummary = order.items
          .slice(0, 3)
          .map((item: any) => item.product?.name)
          .filter(Boolean)
          .join(', ');

        await enqueueNotification({
          userId: order.userId,
          channel: 'in_app',
          message: `Order #${order.orderCode || orderId} is now being processed.`,
        });

        if (order.user?.email) {
          await enqueueEmail({
            to: order.user.email,
            subject: `Order #${order.orderCode || orderId} confirmed`,
            template: 'order-processing',
            payload: {
              message: 'Your order is being processed.',
              html: `<p>Hello ${order.user?.name || 'there'},</p><p>Your order #${order.orderCode || orderId} is now being processed.</p><p>Items: ${itemSummary || 'Your items'}</p>`,
            },
          });
        }

        logger.info('worker.order.processed', {
          orderId,
          orderCode: order.orderCode,
          userId,
          jobId: job.id,
        });

        return {
          processed: true,
          orderId,
          orderCode: order.orderCode,
          status: updatedOrder.status,
        };
      } catch (error) {
        logger.error('worker.order.processing_failed', {
          jobId: job.id,
          orderId: job.data?.orderId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    {
      connection,
      prefix: env.QUEUE_PREFIX,
      skipVersionCheck: true,
    },
  );

  const paymentProcessingWorker = new Worker(
    QUEUE_NAMES.paymentProcessing,
    async (job) => {
      try {
        const paymentId = validateString(job.data?.paymentId, 'paymentId');
        const provider = validateString(job.data?.provider, 'provider');
        const orderId = typeof job.data?.orderId === 'string' ? job.data.orderId : null;
        const userId = typeof job.data?.userId === 'string' ? job.data.userId : null;
        const tenantId = typeof job.data?.tenantId === 'string' ? job.data.tenantId : null;

        const transaction = await prisma.paymentTransaction.findUnique({
          where: { paymentId },
        });

        if (!transaction) {
          logger.warn('worker.payment.not_found', { paymentId, jobId: job.id });
          return { processed: false, reason: 'transaction_not_found', paymentId };
        }

        if (transaction.status === 'paid') {
          return { processed: true, paymentId, status: transaction.status, reason: 'already_paid' };
        }

        const updated = await prisma.paymentTransaction.update({
          where: { paymentId },
          data: { status: 'paid' },
        });

        if (orderId) {
          await prisma.order.updateMany({
            where: { id: orderId },
            data: {
              paymentStatus: 'paid',
              paidAt: new Date(),
            },
          });
        }

        logger.info('worker.payment.processed', {
          paymentId,
          provider,
          orderId,
          status: updated.status,
          jobId: job.id,
        });

        return {
          processed: true,
          paymentId,
          provider,
          orderId,
          status: updated.status,
        };
      } catch (error) {
        logger.error('worker.payment.processing_failed', {
          jobId: job.id,
          paymentId: job.data?.paymentId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    {
      connection,
      prefix: env.QUEUE_PREFIX,
      skipVersionCheck: true,
    },
  );

  const notificationsWorker = new Worker(
    QUEUE_NAMES.notifications,
    async (job) => {
      try {
        const userId = validateString(job.data?.userId, 'userId');
        const channel = validateString(job.data?.channel, 'channel');
        const message = validateString(job.data?.message, 'message');

        const notification = await prisma.userNotification.create({
          data: {
            userId,
            tenantId: typeof job.data?.tenantId === 'string' ? job.data.tenantId : null,
            type: channel === 'in_app' ? 'system' : channel,
            title: 'Notification',
            message,
          },
        });

        if (channel === 'push' || channel === 'in_app') {
          await sendPushNotification(userId, 'LofiMart', message);
        }

        logger.info('worker.notification.sent', {
          notificationId: notification.id,
          userId,
          channel,
          jobId: job.id,
        });

        return { sent: true, notificationId: notification.id, userId, channel };
      } catch (error) {
        logger.error('worker.notification.send_failed', {
          jobId: job.id,
          userId: job.data?.userId,
          channel: job.data?.channel,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    {
      connection,
      prefix: env.QUEUE_PREFIX,
      skipVersionCheck: true,
    },
  );

  const analyticsWorker = new Worker(
    QUEUE_NAMES.analytics,
    async (job) => {
      try {
        const name = validateString(job.data?.name, 'name');
        const payload = typeof job.data?.payload === 'object' && job.data.payload !== null
          ? job.data.payload
          : {};

        await prisma.auditLog.create({
          data: {
            userId: typeof payload.userId === 'string' ? payload.userId : null,
            action: name,
            entityType: typeof payload.entityType === 'string' ? payload.entityType : 'analytics',
            entityId: typeof payload.entityId === 'string' ? payload.entityId : null,
            metadata: payload,
          },
        });

        logger.info('worker.analytics.tracked', {
          name,
          jobId: job.id,
        });

        return { tracked: true, name };
      } catch (error) {
        logger.error('worker.analytics.track_failed', {
          jobId: job.id,
          name: job.data?.name,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    {
      connection,
      prefix: env.QUEUE_PREFIX,
      skipVersionCheck: true,
    },
  );

  const stockUpdatesWorker = new Worker(
    QUEUE_NAMES.stockUpdates,
    async (job) => {
      try {
        const productId = validateString(job.data?.productId, 'productId');
        const delta = Number(job.data?.delta);
        if (!Number.isFinite(delta)) {
          throw new Error('delta must be a finite number');
        }
        const reason = validateString(job.data?.reason, 'reason');
        const warehouseId = typeof job.data?.warehouseId === 'string' ? job.data.warehouseId : null;

        const inventoryItem = await prisma.inventoryItem.findFirst({
          where: { productId, ...(warehouseId ? { warehouseId } : {}) },
        });

        if (!inventoryItem) {
          logger.warn('worker.stock.inventory_item_not_found', {
            productId,
            warehouseId,
            jobId: job.id,
          });
          return { applied: false, reason: 'inventory_item_not_found', productId };
        }

        const previousQuantity = inventoryItem.quantity;
        await prisma.inventoryItem.update({
          where: { id: inventoryItem.id },
          data: { quantity: { increment: delta } },
        });

        await prisma.inventoryMovement.create({
          data: {
            inventoryItemId: inventoryItem.id,
            productId,
            warehouseId: inventoryItem.warehouseId,
            type: 'adjustment',
            quantityDelta: Math.round(delta),
            reason,
            reference: job.id ?? null,
          },
        });

        const newStock = await getAvailableStock(prisma, productId);
        await prisma.product.update({
          where: { id: productId },
          data: { stock: newStock },
        });

        await deleteCacheByPrefix(`product:${productId}`);
        await deleteCacheByPrefix('inventory:');

        logger.info('worker.stock.updated', {
          productId,
          warehouseId: inventoryItem.warehouseId,
          delta,
          previousQuantity,
          newStock,
          reason,
          jobId: job.id,
        });

        return {
          applied: true,
          productId,
          warehouseId: inventoryItem.warehouseId,
          delta,
          newStock,
        };
      } catch (error) {
        logger.error('worker.stock.update_failed', {
          jobId: job.id,
          productId: job.data?.productId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    {
      connection,
      prefix: env.QUEUE_PREFIX,
      skipVersionCheck: true,
    },
  );

  const reservationSweepWorker = new Worker(
    QUEUE_NAMES.reservationSweep,
    async (job) => {
      try {
        if (job.data && typeof job.data !== 'object') {
          throw new Error('Invalid job payload');
        }

        const released = await prisma.$transaction((tx) => releaseExpiredReservations(tx as any));

        logger.info('worker.reservation.sweep_completed', {
          released,
          jobId: job.id,
        });

        return { released };
      } catch (error) {
        logger.error('worker.reservation.sweep_failed', {
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    {
      connection,
      prefix: env.QUEUE_PREFIX,
      skipVersionCheck: true,
    },
  );

  const reservationSweepQueue = await getQueue(QUEUE_NAMES.reservationSweep);
  try {
    await reservationSweepQueue.add(
      'reservation-expiry-sweep',
      { ts: Date.now() },
      {
        repeat: { every: env.STOCK_RESERVATION_REAP_MS || 5 * 60 * 1000 },
        jobId: sanitizeJobId('reservation-expiry-sweep'),
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
  } catch (error) {
    logger.error('worker.reservation.schedule_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const socialAutomationWorker = new Worker(
    QUEUE_NAMES.socialAutomation,
    async (job) => {
      try {
        const result = await runDueSocialWork();
        logger.info('worker.social_automation.sweep_completed', {
          jobId: job.id,
          publishedAutomations: result.publishedAutomations,
          skippedAutomations: result.skippedAutomations,
          failedAutomations: result.failedAutomations,
          publishedScheduled: result.publishedScheduled,
        });
        return result;
      } catch (error) {
        logger.error('worker.social_automation.sweep_failed', {
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    {
      connection,
      prefix: env.QUEUE_PREFIX,
      skipVersionCheck: true,
    },
  );

  const socialAutomationQueue = await getQueue(QUEUE_NAMES.socialAutomation);
  try {
    await socialAutomationQueue.add(
      'social-automation-sweep',
      { ts: Date.now() },
      {
        repeat: { every: env.SOCIAL_AUTOMATION_SWEEP_MS || 5 * 60 * 1000 },
        jobId: sanitizeJobId('social-automation-sweep'),
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
  } catch (error) {
    logger.error('worker.social_automation.schedule_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const cartRecoveryWorker = new Worker(
    QUEUE_NAMES.cartRecovery,
    async (job) => {
      try {
        const cartKey = typeof job.data?.cartKey === 'string' ? job.data.cartKey : '';
        const userId = typeof job.data?.userId === 'string' ? job.data.userId : '';
        const email = typeof job.data?.email === 'string' ? job.data.email : '';
        const name = typeof job.data?.name === 'string' ? job.data.name : null;
        const tenantId = typeof job.data?.tenantId === 'string' ? job.data.tenantId : null;

        if (!cartKey || !userId || !email) {
          return { sent: false, reason: 'invalid_payload' };
        }

        const redis = await ensureRedis();
        const cartPayload = await redis.get(cartKey);
        if (!cartPayload) {
          return { sent: false, reason: 'empty_cart' };
        }

        let items: Array<{ name?: string; quantity?: number; price?: number }> = [];
        try {
          items = JSON.parse(cartPayload);
        } catch {
          items = [];
        }

        if (!Array.isArray(items) || items.length === 0) {
          return { sent: false, reason: 'no_items' };
        }

        const existingRecentNotification = await prisma.userNotification.findFirst({
          where: {
            userId,
            type: 'cart_recovery',
            createdAt: {
              gte: new Date(Date.now() - 12 * 60 * 60 * 1000),
            },
          },
        });

        if (existingRecentNotification) {
          return { sent: false, reason: 'recently_sent' };
        }

        const subtotal = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
        const itemNames = items.slice(0, 3).map((item) => item.name).filter(Boolean).join(', ');

        await prisma.userNotification.create({
          data: {
            userId,
            tenantId,
            type: 'cart_recovery',
            title: 'Your cart is still waiting',
            message: itemNames
              ? `You still have ${itemNames} in your cart. Complete checkout before stock changes.`
              : 'You still have products waiting in your cart. Complete checkout before stock changes.',
            actionUrl: '/cart',
            metadata: {
              subtotal,
              itemCount: items.length,
            },
          },
        });

        await enqueueEmail({
          to: email,
          subject: 'Your LofiMart cart is waiting',
          template: 'cart-recovery',
          payload: {
            message: 'Your saved cart is still available.',
            html: `
              <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
                <h2 style="margin-bottom:12px;">Your cart is still waiting</h2>
                <p>Hello ${String(name || 'there')},</p>
                <p>You still have items in your cart at LofiMart.</p>
                <p><strong>Items:</strong> ${itemNames || 'Saved products'}</p>
                <p><strong>Cart subtotal:</strong> ${subtotal}</p>
                <p>Complete checkout before stock availability changes.</p>
              </div>
            `,
          },
        });

        logger.info('worker.cart_recovery.sent', {
          userId,
          email,
          itemCount: items.length,
          jobId: job.id,
        });

        return {
          sent: true,
          userId,
          to: email,
          subtotal,
          itemCount: items.length,
        };
      } catch (error) {
        logger.error('worker.cart_recovery.send_failed', {
          jobId: job.id,
          userId: job.data?.userId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    {
      connection,
      prefix: env.QUEUE_PREFIX,
      skipVersionCheck: true,
    },
  );

  const mediaCleanupWorker = new Worker(
    QUEUE_NAMES.mediaCleanup,
    async (job) => {
      try {
        if (job.name === 'delete-media') {
          return await handleMediaDeleteJob(job.data);
        }

        if (job.name === 'cleanup-user') {
          return await cleanupUserByIdentifiers({
            userId: typeof job.data?.userId === 'string' ? job.data.userId : null,
            supabaseAuthId: typeof job.data?.supabaseAuthId === 'string' ? job.data.supabaseAuthId : null,
            email: typeof job.data?.email === 'string' ? job.data.email : null,
          });
        }

        if (job.name === 'orphan-media-sweep') {
          return await cleanupUnassociatedMediaUploads();
        }

        logger.warn('worker.media_cleanup.unknown_job', {
          jobId: job.id,
          name: job.name,
        });

        return { skipped: true, reason: 'unknown_job' };
      } catch (error) {
        logger.error('worker.media_cleanup.failed', {
          jobId: job.id,
          name: job.name,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    {
      connection,
      prefix: env.QUEUE_PREFIX,
      skipVersionCheck: true,
    },
  );

  const mediaCleanupQueue = await getQueue(QUEUE_NAMES.mediaCleanup);
  try {
    await mediaCleanupQueue.add(
      'orphan-media-sweep',
      { ts: Date.now() },
      {
        repeat: { every: 24 * 60 * 60 * 1000 },
        jobId: sanitizeJobId('orphan-media-sweep'),
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
  } catch (error) {
    logger.error('worker.media_cleanup.schedule_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const courierBookingWorker = new Worker(
    QUEUE_NAMES.courierBooking,
    async (job) => {
      if (job.name !== 'book-shipment') {
        return { skipped: true, reason: 'unknown_job' };
      }

      // The retry policy lives in the handler, where it is unit-tested. This
      // callback only decides whether a thrown error means "try again".
      const result = await runCourierBookingJob(job.data as CourierBookingJobData);

      logger.info('worker.courier.booking_finished', {
        jobId: job.id,
        shipmentId: result.shipmentId,
        outcome: result.outcome,
      });

      return result;
    },
    {
      connection,
      prefix: env.QUEUE_PREFIX,
      skipVersionCheck: true,
    },
  );

  const courierReconciliationWorker = new Worker(
    QUEUE_NAMES.courierReconciliation,
    async (job) => {
      if (job.name !== 'reconcile-shipments') {
        return { skipped: true, reason: 'unknown_job' };
      }

      const results = await reconcileDueShipments(25);

      const tally: Record<string, number> = {};
      for (const result of results) {
        tally[result.outcome] = (tally[result.outcome] ?? 0) + 1;
      }

      logger.info('worker.courier.reconciled', {
        jobId: job.id,
        processed: results.length,
        ...tally,
      });

      return { processed: results.length, ...tally };
    },
    {
      connection,
      prefix: env.QUEUE_PREFIX,
      skipVersionCheck: true,
    },
  );

  const courierReconciliationQueue = await getQueue(QUEUE_NAMES.courierReconciliation);
  try {
    await courierReconciliationQueue.add(
      'reconcile-shipments',
      { ts: Date.now() },
      {
        // Five minutes: frequent enough that a dropped webhook is closed quickly,
        // and the sweep is throttled by the per-shipment cursor so the actual
        // number of courier calls stays low.
        repeat: { every: 5 * 60 * 1000 },
        jobId: sanitizeJobId('courier-reconciliation-sweep'),
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
  } catch (error) {
    logger.error('worker.courier.reconciliation_schedule_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  for (const worker of [
    inventoryWorker,
    cacheWorker,
    emailWorker,
    orderProcessingWorker,
    paymentProcessingWorker,
    notificationsWorker,
    analyticsWorker,
    stockUpdatesWorker,
    reservationSweepWorker,
    cartRecoveryWorker,
    socialAutomationWorker,
    mediaCleanupWorker,
    courierBookingWorker,
    courierReconciliationWorker,
  ]) {
    worker.on('failed', (job, error) => {
      logger.error('worker.job_failed', {
        worker: worker.name,
        jobId: job?.id ?? 'unknown',
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  return [
    inventoryWorker,
    cacheWorker,
    emailWorker,
    orderProcessingWorker,
    paymentProcessingWorker,
    notificationsWorker,
    analyticsWorker,
    stockUpdatesWorker,
    reservationSweepWorker,
    cartRecoveryWorker,
    socialAutomationWorker,
    mediaCleanupWorker,
    courierBookingWorker,
    courierReconciliationWorker,
  ];
}
