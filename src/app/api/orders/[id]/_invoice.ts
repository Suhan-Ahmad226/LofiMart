import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, toPlainNumber } from '../../_compat/shared';

export type OrderRouteParams = { params: Promise<{ id: string }> };

type AuthenticatedUser = {
  id: string | number;
  role?: string;
};

type InvoiceOrder = NonNullable<Awaited<ReturnType<typeof getInvoiceOrderById>>>;

export async function getAuthorizedUser(request: NextRequest) {
  const user = await requireApiUser(request);
  return user instanceof NextResponse ? user : (user as AuthenticatedUser);
}

export function isAuthResponse(user: Awaited<ReturnType<typeof getAuthorizedUser>>): user is NextResponse {
  return user instanceof NextResponse;
}

export async function getInvoiceOrderById(id: string) {
  return prisma.order.findFirst({
    where: {
      OR: [{ id }, { orderCode: id }],
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      },
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              sku: true,
              image: true,
              price: true,
              seller: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  storeName: true,
                },
              },
            },
          },
        },
        orderBy: { id: 'asc' },
      },
      shipments: {
        include: {
          seller: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              storeName: true,
            },
          },
          warehouse: {
            select: {
              id: true,
              name: true,
              city: true,
              address: true,
              phone: true,
            },
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  sku: true,
                  image: true,
                },
              },
            },
            orderBy: { id: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      invoice: true,
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });
}

export function canReadOrder(user: AuthenticatedUser, order: { userId: string | null; shipments?: Array<{ sellerId: string }> }) {
  const userId = String(user.id);
  const role = String(user.role || '');

  return (
    order.userId === userId ||
    role === 'admin' ||
    (role === 'seller' && Array.isArray(order.shipments) && order.shipments.some((shipment) => shipment.sellerId === userId))
  );
}

function iso(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

function serializableAddress(value: unknown) {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return { address: value };
    }
  }
  return value;
}

function invoiceStatus(order: InvoiceOrder) {
  const paymentStatus = String(order.paymentStatus || '').toLowerCase();
  if (['paid', 'completed', 'success', 'succeeded'].includes(paymentStatus)) return 'paid';
  if (String(order.status || '').toLowerCase() === 'cancelled') return 'cancelled';
  return order.invoice?.status || 'issued';
}

export function calculateInvoiceTotals(order: InvoiceOrder) {
  const subtotal = order.items.reduce((sum, item) => sum + Number(toPlainNumber(item.price) || 0) * Number(item.qty || 0), 0);
  const existingTax = Number(toPlainNumber(order.invoice?.tax) || 0);
  const total = Number(toPlainNumber(order.total) || subtotal + existingTax);
  const adjustment = Math.max(0, subtotal + existingTax - total);

  return {
    subtotal,
    tax: existingTax,
    total,
    adjustment,
    status: invoiceStatus(order),
  };
}

export async function ensureInvoiceRecord(order: InvoiceOrder) {
  const totals = calculateInvoiceTotals(order);

  return prisma.invoice.upsert({
    where: { orderId: order.id },
    create: {
      order: { connect: { id: order.id } },
      ...(order.userId ? { user: { connect: { id: order.userId } } } : {}),
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      status: totals.status,
    },
    update: {
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      status: totals.status,
    },
  });
}

export function serializeOrderDetail(order: InvoiceOrder) {
  const totals = calculateInvoiceTotals(order);

  return {
    id: order.id,
    order_code: order.orderCode ?? null,
    user_id: order.userId,
    customer_name: order.user?.name ?? null,
    customer_email: order.user?.email ?? null,
    customer_phone: order.user?.phone ?? null,
    total: totals.total,
    subtotal: totals.subtotal,
    tax: totals.tax,
    discount_adjustment: totals.adjustment,
    status: order.status,
    courier_provider: order.courierProvider ?? null,
    tracking_id: order.trackingId ?? null,
    payment_method: order.paymentMethod ?? null,
    payment_provider: order.paymentProvider ?? null,
    payment_status: order.paymentStatus ?? null,
    paid_at: iso(order.paidAt),
    pickup_requested_at: iso(order.pickupRequestedAt),
    picked_up_at: iso(order.pickedUpAt),
    out_for_delivery_at: iso(order.outForDeliveryAt),
    delivered_at: iso(order.deliveredAt),
    delivery_failure_reason: order.deliveryFailureReason ?? order.failureReason ?? null,
    shipping_address: serializableAddress(order.shippingAddress),
    shipment_metadata: order.shipmentMetadata ?? null,
    invoice: order.invoice
      ? {
          id: order.invoice.id,
          status: order.invoice.status,
          subtotal: toPlainNumber(order.invoice.subtotal),
          tax: toPlainNumber(order.invoice.tax),
          total: toPlainNumber(order.invoice.total),
          due_date: iso(order.invoice.dueDate),
          created_at: iso(order.invoice.createdAt),
        }
      : null,
    transactions: order.transactions.map((transaction: any) => ({
      id: transaction.id,
      provider: transaction.provider,
      status: transaction.status,
      amount: toPlainNumber(transaction.amount),
      created_at: iso(transaction.createdAt),
    })),
    items: order.items.map((item) => ({
      id: item.id,
      product_id: item.productId,
      name: item.product?.name ?? 'Item',
      slug: item.product?.slug ?? null,
      sku: item.variantSku ?? item.product?.sku ?? null,
      image: item.product?.image ?? null,
      quantity: item.qty,
      qty: item.qty,
      price: toPlainNumber(item.price) ?? 0,
      variant_summary: item.variantSummary ?? null,
      seller_id: item.product?.seller?.id ?? null,
      seller_name: item.product?.seller?.name ?? null,
      seller_store_name: item.product?.seller?.storeName ?? null,
      seller_email: item.product?.seller?.email ?? null,
      seller_phone: item.product?.seller?.phone ?? null,
    })),
    shipments: order.shipments.map((shipment) => ({
      id: shipment.id,
      seller_id: shipment.sellerId,
      seller_name: shipment.seller?.name ?? null,
      seller_store_name: shipment.seller?.storeName ?? null,
      seller_email: shipment.seller?.email ?? null,
      seller_phone: shipment.seller?.phone ?? null,
      warehouse_id: shipment.warehouseId ?? null,
      warehouse_name: shipment.warehouse?.name ?? null,
      warehouse_city: shipment.warehouse?.city ?? null,
      warehouse_address: shipment.warehouse?.address ?? null,
      warehouse_phone: shipment.warehouse?.phone ?? null,
      status: shipment.status,
      total: toPlainNumber(shipment.total) ?? 0,
      item_count: shipment.itemCount ?? 0,
      courier_provider: shipment.courierProvider ?? null,
      tracking_id: shipment.trackingId ?? null,
      provider_status: shipment.providerStatus ?? null,
      provider_reference: shipment.providerReference ?? null,
      last_reconciled_at: iso(shipment.lastReconciledAt),
      next_reconcile_at: iso(shipment.nextReconcileAt),
      booking_state: shipment.bookingState ?? null,
      booking_error: shipment.lastBookingError ?? null,
      pickup_requested_at: iso(shipment.pickupRequestedAt),
      picked_up_at: iso(shipment.pickedUpAt),
      out_for_delivery_at: iso(shipment.outForDeliveryAt),
      delivered_at: iso(shipment.deliveredAt),
      delivery_failure_reason: shipment.deliveryFailureReason ?? null,
      shipment_metadata: shipment.shipmentMetadata ?? null,
      created_at: iso(shipment.createdAt),
      items: shipment.items.map((item) => ({
        id: item.id,
        product_id: item.productId,
        order_item_id: item.orderItemId,
        name: item.product?.name ?? 'Item',
        slug: item.product?.slug ?? null,
        sku: item.product?.sku ?? null,
        image: item.product?.image ?? null,
        quantity: item.qty,
        qty: item.qty,
        price: toPlainNumber(item.price) ?? 0,
      })),
    })),
    can_cancel: ['processing', 'pending'].includes(String(order.status || '').toLowerCase()),
    can_edit: ['processing', 'pending'].includes(String(order.status || '').toLowerCase()) && order.shipments.length === 0,
    customer_action_block_reason: order.shipments.length > 0 ? 'This order is already being processed by a seller.' : '',
    created_at: iso(order.createdAt),
    updated_at: iso(order.updatedAt),
  };
}

export function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function formatCurrency(value: unknown) {
  const amount = Number(value || 0);
  return `BDT ${amount.toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;
}

function addressLines(address: unknown) {
  if (!address || typeof address !== 'object') return [];
  const entry = address as Record<string, any>;
  return [
    entry.fullName || entry.name,
    entry.phone,
    entry.alternatePhone || entry.alternate_phone,
    entry.address,
    [entry.upazila, entry.district, entry.division].filter(Boolean).join(', '),
    entry.city,
    entry.country,
  ].filter(Boolean);
}

export function buildInvoiceHtml(order: ReturnType<typeof serializeOrderDetail>) {
  const rows = order.items
    .map(
      (item) => `
        <tr>
          <td>
            <strong>${escapeHtml(item.name)}</strong>
            ${item.variant_summary ? `<br><span>${escapeHtml(item.variant_summary)}</span>` : ''}
            ${item.sku ? `<br><span>SKU: ${escapeHtml(item.sku)}</span>` : ''}
          </td>
          <td>${escapeHtml(item.quantity)}</td>
          <td>${escapeHtml(formatCurrency(item.price))}</td>
          <td>${escapeHtml(formatCurrency(Number(item.price) * Number(item.quantity)))}</td>
        </tr>`,
    )
    .join('');
  const shipping = addressLines(order.shipping_address)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
  const generatedAt = new Date().toLocaleString('en-BD');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Invoice ${escapeHtml(order.order_code || order.id)}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f8fafc; color: #0f172a; font-family: Arial, Helvetica, sans-serif; }
    main { width: min(920px, calc(100% - 32px)); margin: 32px auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 24px; padding: 32px; }
    header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 24px; }
    h1, h2, p { margin: 0; }
    h1 { font-size: 34px; letter-spacing: -0.03em; }
    h2 { font-size: 18px; margin-bottom: 10px; }
    .muted { color: #64748b; font-size: 13px; line-height: 1.7; }
    .badge { display: inline-block; border-radius: 999px; background: #eef2ff; color: #4338ca; padding: 7px 12px; font-size: 12px; font-weight: 700; text-transform: uppercase; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 24px; }
    .box { border: 1px solid #e2e8f0; border-radius: 18px; padding: 18px; background: #f8fafc; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; overflow: hidden; border-radius: 16px; }
    th { background: #f1f5f9; color: #475569; font-size: 12px; text-align: left; text-transform: uppercase; letter-spacing: 0.08em; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 14px; font-size: 14px; vertical-align: top; }
    td span { color: #64748b; font-size: 12px; }
    .totals { margin-left: auto; margin-top: 24px; max-width: 360px; border: 1px solid #e2e8f0; border-radius: 18px; padding: 18px; background: #f8fafc; }
    .line { display: flex; justify-content: space-between; gap: 16px; padding: 8px 0; }
    .total { border-top: 1px solid #cbd5e1; margin-top: 8px; padding-top: 14px; font-size: 18px; font-weight: 800; }
    footer { margin-top: 28px; border-radius: 18px; background: #0f172a; color: #e2e8f0; padding: 18px; font-size: 13px; line-height: 1.7; }
    @media print {
      body { background: #fff; }
      main { width: 100%; margin: 0; border: 0; border-radius: 0; }
    }
    @media (max-width: 640px) {
      main { width: 100%; margin: 0; border: 0; border-radius: 0; padding: 20px; }
      header, .grid { grid-template-columns: 1fr; display: grid; }
      table { display: block; overflow-x: auto; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <p class="badge">LofiMart Invoice</p>
        <h1>Invoice</h1>
        <p class="muted">Order ${escapeHtml(order.order_code || order.id)}</p>
      </div>
      <div class="muted">
        <p><strong>Status:</strong> ${escapeHtml(String(order.status).replaceAll('_', ' '))}</p>
        <p><strong>Payment:</strong> ${escapeHtml(order.payment_method || 'N/A')}</p>
        <p><strong>Payment status:</strong> ${escapeHtml(order.payment_status || 'untracked')}</p>
        <p><strong>Generated:</strong> ${escapeHtml(generatedAt)}</p>
      </div>
    </header>
    <section class="grid">
      <div class="box">
        <h2>Bill to</h2>
        ${shipping || '<p class="muted">No shipping address saved.</p>'}
        ${order.customer_email ? `<p>${escapeHtml(order.customer_email)}</p>` : ''}
      </div>
      <div class="box">
        <h2>Delivery</h2>
        <p><strong>Courier:</strong> ${escapeHtml(order.courier_provider || 'Pending')}</p>
        <p><strong>Tracking:</strong> ${escapeHtml(order.tracking_id || 'Pending')}</p>
        <p><strong>Shipments:</strong> ${escapeHtml(order.shipments.length)}</p>
      </div>
    </section>
    <table>
      <thead>
        <tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Line total</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <section class="totals">
      <div class="line"><span>Subtotal</span><strong>${escapeHtml(formatCurrency(order.subtotal))}</strong></div>
      <div class="line"><span>Tax</span><strong>${escapeHtml(formatCurrency(order.tax))}</strong></div>
      ${
        order.discount_adjustment > 0
          ? `<div class="line"><span>Discount / adjustment</span><strong>-${escapeHtml(formatCurrency(order.discount_adjustment))}</strong></div>`
          : ''
      }
      <div class="line total"><span>Total</span><span>${escapeHtml(formatCurrency(order.total))}</span></div>
    </section>
    <footer>
      Keep this invoice for delivery, payment, and support reference. Share order code ${escapeHtml(
        order.order_code || order.id,
      )} if you contact LofiMart support.
    </footer>
  </main>
</body>
</html>`;
}

function escapePdfText(value: unknown) {
  return String(value ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)')
    .replace(/[^\x20-\x7E]/g, '?');
}

export function buildInvoicePdf(order: ReturnType<typeof serializeOrderDetail>) {
  const lines = [
    'LofiMart Invoice',
    `Order: ${order.order_code || order.id}`,
    `Customer: ${order.customer_name || 'Customer'}`,
    `Email: ${order.customer_email || 'N/A'}`,
    `Status: ${String(order.status).replaceAll('_', ' ')}`,
    `Payment: ${order.payment_method || 'N/A'} (${order.payment_status || 'untracked'})`,
    `Generated: ${new Date().toLocaleString('en-BD')}`,
    '',
    'Items',
    ...order.items.slice(0, 24).map((item) => {
      const lineTotal = Number(item.price || 0) * Number(item.quantity || 0);
      return `${item.quantity} x ${item.name} @ ${formatCurrency(item.price)} = ${formatCurrency(lineTotal)}`;
    }),
    order.items.length > 24 ? `...and ${order.items.length - 24} more item(s)` : '',
    '',
    `Subtotal: ${formatCurrency(order.subtotal)}`,
    `Tax: ${formatCurrency(order.tax)}`,
    order.discount_adjustment > 0 ? `Discount / adjustment: -${formatCurrency(order.discount_adjustment)}` : '',
    `Total: ${formatCurrency(order.total)}`,
  ].filter(Boolean);

  const text = lines
    .map((line, index) => `BT /F1 ${index === 0 ? 18 : 10} Tf 50 ${760 - index * 18} Td (${escapePdfText(line)}) Tj ET`)
    .join('\n');
  const stream = Buffer.from(text, 'utf8');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
    `5 0 obj << /Length ${stream.length} >> stream\n${text}\nendstream endobj\n`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body, 'utf8'));
    body += object;
  }
  const xrefOffset = Buffer.byteLength(body, 'utf8');
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (let index = 1; index <= objects.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(body, 'utf8');
}

export function invoiceFilename(order: { id: string; order_code?: string | null }, extension: 'html' | 'pdf') {
  const safeId = String(order.order_code || order.id).replace(/[^a-zA-Z0-9_-]/g, '-');
  return `invoice-${safeId}.${extension}`;
}
