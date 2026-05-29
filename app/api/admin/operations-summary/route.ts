import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireAdminRole, requireApiUser } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD || 5);

function summaryItem(key: string, label: string, count: number, href: string, actionLabel: string, warningDescription: string, healthyDescription: string, critical = false) {
  return {
    key,
    label,
    count,
    tone: count > 0 ? (critical ? 'critical' : 'warning') : 'healthy',
    description: count > 0 ? warningDescription : healthyDescription,
    href,
    actionLabel,
  };
}

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireAdminRole(user);
  if (roleError) return roleError;

  const [
    pendingKycReviews,
    pendingPayoutReviews,
    unreadSupportMessages,
    deliveryExceptions,
    lowStockProducts,
    pendingFlashSaleEntries,
    pendingReturnRequests,
    pendingAccountRequests,
  ] = await Promise.all([
    prisma.verificationSubmission.count({ where: { status: 'pending' } }),
    prisma.payoutTransaction.count({ where: { status: 'pending' } }),
    prisma.contactMessage.count({ where: { status: 'unread' } }),
    prisma.orderShipment.count({ where: { status: { in: ['delivery_failed', 'returned', 'cancelled'] } } }),
    prisma.product.count({ where: { stock: { lte: LOW_STOCK_THRESHOLD } } }),
    prisma.flashSaleEntry.count({ where: { status: 'pending' } }),
    prisma.accountActionRequest.count({ where: { type: 'return_request', status: 'pending' } }),
    prisma.accountActionRequest.count({ where: { status: 'pending', type: { not: 'return_request' } } }),
  ]);

  return NextResponse.json({
    updatedAt: new Date().toISOString(),
    items: [
      summaryItem('kyc_reviews', 'KYC reviews', pendingKycReviews, '/admin/users', 'Review users', `${pendingKycReviews} verification submission(s) waiting for review.`, 'No seller or reseller verification backlog right now.'),
      summaryItem('payout_reviews', 'Payout reviews', pendingPayoutReviews, '/admin/payments', 'Open payments', `${pendingPayoutReviews} payout request(s) need approval or rejection.`, 'No pending payout review at the moment.'),
      summaryItem('support_inbox', 'Support inbox', unreadSupportMessages, '/admin/support', 'Open support', `${unreadSupportMessages} support message(s) are still unread.`, 'Support inbox is currently clear.'),
      summaryItem('delivery_exceptions', 'Delivery exceptions', deliveryExceptions, '/admin/orders', 'Inspect orders', `${deliveryExceptions} shipment(s) need manual follow-up.`, 'No shipment exceptions are waiting for intervention.', true),
      summaryItem('low_stock', 'Low stock products', lowStockProducts, '/admin/inventory', 'Open inventory', `${lowStockProducts} product(s) are below the stock threshold.`, 'Inventory levels are above the low-stock threshold.'),
      summaryItem('flash_sale_entries', 'Flash sale submissions', pendingFlashSaleEntries, '/admin/flash-sale', 'Review campaign', `${pendingFlashSaleEntries} flash sale submission(s) need review.`, 'No flash sale submissions are waiting for approval.'),
      summaryItem('return_requests', 'Return requests', pendingReturnRequests, '/admin/returns', 'Open returns', `${pendingReturnRequests} return request(s) are waiting for review.`, 'No return requests are waiting for review.'),
      summaryItem('account_requests', 'Account requests', pendingAccountRequests, '/admin/users', 'Open users', `${pendingAccountRequests} account request(s) are waiting for admin handling.`, 'No pending account action requests right now.'),
    ],
  });
}
