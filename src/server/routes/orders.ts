import type { RouteContext } from "./context.js";
import crypto from "crypto";
import {
  toPlainNumber,
  serializeOrder,
  serializeOrderShipment,
  serializeOrderItem,
  serializeAccountActionRequest,
  getCustomerOrderActionState,
} from "./serializers.js";
import { PRODUCT_STATUSES, isSellerApproved } from "../../lib/sellerApproval.js";
import {
  isCheckoutPaymentMethodEnabled,
} from "../../features/shared/services/platform/commerceChannels.js";
import {
  createNotification,
  ensureTenantSetting,
  grantReward,
  updateMissionProgress,
} from "../../features/admin/services/engagement/gamification.js";
import { enqueueOrderProcessing } from "../../workers/queue.js";
import { ensureRedis } from "../../features/shared/services/messaging/redis.js";

export function registerOrderRoutes(ctx: RouteContext): void {
  const {
    app,
    env,
    prisma,
    prismaDirect,
    authenticateToken,
    logServerError,
    getActiveAdminUsers,
    getResellerIdFromOrderRefCode,
    settleResellerCommissionsForOrder,
    reverseResellerCommissionsForOrder,
    emitStockUpdate,
    sendEmail,
    webpush,
    generateUniqueOrderCode,
    validateCouponForCart,
    userCartKey,
  } = ctx;

  const notifyOrderPlaced = async (userId: number | string, orderId: number | string, total: number) => {
    const user = await prisma.user.findUnique({
      where: { id: String(userId) },
      select: { email: true, notificationPreference: true },
    });
    const html = `<p>Your order #${orderId} has been placed.</p><p>Total: ${total}</p>`;
    const allowsOrderUpdates = user?.notificationPreference?.orderUpdates ?? true;
    const allowsEmail = user?.notificationPreference?.emailEnabled ?? true;

    if (allowsOrderUpdates && allowsEmail && user?.email) {
      await sendEmail(user.email, "Order placed", html);
    }

    if (webpush && allowsOrderUpdates) {
      const subs = await prismaDirect.pushSubscription.findMany({
        where: { userId: String(userId) },
        select: { data: true },
      });

      for (const s of subs) {
        try {
          await webpush.sendNotification(s.data, JSON.stringify({ title: "Order placed", body: `Order #${orderId} total ${total}` }));
        } catch (err) {
          console.error("Push send error", err);
        }
      }
    }
  };

  function escapeHtml(value: unknown) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapePdfText(value: unknown) {
    return String(value ?? "")
      .replaceAll("\\", "\\\\")
      .replaceAll("(", "\\(")
      .replaceAll(")", "\\)")
      .replaceAll("\r", " ")
      .replaceAll("\n", " ");
  }

  function buildSimplePdf(lines: Array<{ text: string; x: number; y: number; size?: number }>) {
    const content = lines
      .map(({ text, x, y, size = 12 }) => `BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdfText(text)}) Tj ET`)
      .join("\n");

    const stream = `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`;
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      stream,
    ];

    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [0];

    for (let index = 0; index < objects.length; index += 1) {
      offsets.push(Buffer.byteLength(pdf, "utf8"));
      pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
    }

    const xrefStart = Buffer.byteLength(pdf, "utf8");
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += "0000000000 65535 f \n";
    for (let index = 1; index < offsets.length; index += 1) {
      pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

    return Buffer.from(pdf, "utf8");
  }

  function formatInvoiceCurrency(value: unknown) {
    return `${toPlainNumber(value).toFixed(2)} BDT`;
  }

  function buildInvoiceAddressLines(shippingAddress: Record<string, any>) {
    const lines = [
      shippingAddress.fullName || shippingAddress.name || "Customer",
      shippingAddress.phone || null,
      shippingAddress.alternatePhone || shippingAddress.alternate_phone || null,
      shippingAddress.address || null,
      [shippingAddress.upazila, shippingAddress.district, shippingAddress.division].filter(Boolean).join(", ") || null,
      shippingAddress.city || null,
    ]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);

    return lines;
  }

  function buildInvoiceSellerEntries(order: any) {
    const sellerMap = new Map<string, { sellerName: string; storeName: string | null; email: string | null; phone: string | null }>();

    const shipments = Array.isArray(order?.shipments) ? order.shipments : [];
    for (const shipment of shipments) {
      const sellerId = String(shipment?.sellerId || shipment?.seller?.id || "").trim();
      const sellerName = String(shipment?.seller?.name || "").trim();
      const storeName = String(shipment?.seller?.storeName || "").trim() || null;
      const email = String(shipment?.seller?.email || "").trim() || null;
      const phone = String(shipment?.seller?.phone || "").trim() || null;
      const key = sellerId || `${sellerName}:${storeName || ""}`;
      if (!key || !sellerName) continue;
      if (!sellerMap.has(key)) {
        sellerMap.set(key, { sellerName, storeName, email, phone });
      }
    }

    if (sellerMap.size === 0 && Array.isArray(order?.items)) {
      for (const item of order.items) {
        const sellerId = String(item?.product?.seller?.id || "").trim();
        const sellerName = String(item?.product?.seller?.name || "").trim();
        const storeName = String(item?.product?.seller?.storeName || "").trim() || null;
        const email = String(item?.product?.seller?.email || "").trim() || null;
        const phone = String(item?.product?.seller?.phone || "").trim() || null;
        const key = sellerId || `${sellerName}:${storeName || ""}`;
        if (!key || !sellerName) continue;
        if (!sellerMap.has(key)) {
          sellerMap.set(key, { sellerName, storeName, email, phone });
        }
      }
    }

    return Array.from(sellerMap.values());
  }

  function buildInvoiceHtml(order: any, shippingAddress: Record<string, any>) {
    const itemSubtotal = Array.isArray(order.items)
      ? order.items.reduce((sum: number, item: any) => sum + toPlainNumber(item.price) * Number(item.qty || 0), 0)
      : 0;
    const orderTotal = toPlainNumber(order.total);
    const adjustmentAmount = Math.max(0, itemSubtotal - orderTotal);
    const shippingLines = buildInvoiceAddressLines(shippingAddress);
    const sellerEntries = buildInvoiceSellerEntries(order);
    const shipments = Array.isArray(order.shipments) ? order.shipments : [];
    const customerEmail = String(order?.user?.email || "").trim() || null;
    const paymentReference = String(order?.paymentIntentId || order?.trackingId || order?.id || "").trim() || null;
    const rows = order.items
      .map(
        (item: any) => `
          <tr>
            <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
              <div style="font-weight:700;color:#0f172a;">${escapeHtml(item.product?.name || "Product")}</div>
              ${
                item.variantSummary
                  ? `<div style="margin-top:4px;font-size:12px;color:#0f766e;">${escapeHtml(item.variantSummary)}</div>`
                  : ""
              }
              ${
                item.variantSku || item.product?.sku
                  ? `<div style="margin-top:4px;font-size:11px;color:#64748b;">SKU: ${escapeHtml(item.variantSku || item.product?.sku)}</div>`
                  : ""
              }
            </td>
            <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;text-align:center;vertical-align:top;">${escapeHtml(item.qty)}</td>
            <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;text-align:right;vertical-align:top;">${formatInvoiceCurrency(item.price)}</td>
            <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;text-align:right;vertical-align:top;font-weight:700;">${formatInvoiceCurrency(toPlainNumber(item.price) * item.qty)}</td>
          </tr>
        `,
      )
      .join("");

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Invoice ${escapeHtml(order.id)}</title>
          <style>
            @page {
              size: A4;
              margin: 14mm;
            }
            * { box-sizing: border-box; }
            body {
              font-family: Arial, sans-serif;
              background: #f8fafc;
              margin: 0;
              padding: 24px;
              color: #0f172a;
            }
            .invoice-shell {
              width: 100%;
              max-width: 794px;
              margin: 0 auto;
              background: #ffffff;
              border: 1px solid #e2e8f0;
              border-radius: 24px;
              padding: 32px;
            }
            .brand-lockup {
              display: flex;
              align-items: center;
              gap: 14px;
            }
            .brand-logo {
              width: 58px;
              height: 58px;
              border-radius: 18px;
              border: 1px solid #dbeafe;
              background: linear-gradient(135deg, #ffffff 0%, #ecfeff 100%);
              padding: 8px;
            }
            .brand-copy {
              display: flex;
              flex-direction: column;
              gap: 4px;
            }
            .brand-name {
              font-size: 24px;
              font-weight: 800;
              color: #0f172a;
              letter-spacing: -0.02em;
            }
            .brand-subtitle {
              font-size: 12px;
              font-weight: 700;
              letter-spacing: .2em;
              color: #0f766e;
              text-transform: uppercase;
            }
            .summary-grid,
            .meta-grid,
            .seller-grid {
              display: grid;
              gap: 18px;
            }
            .summary-grid,
            .meta-grid { grid-template-columns: 1fr 1fr; }
            .seller-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            @media print {
              body { background: #ffffff; padding: 0; }
              .invoice-shell {
                max-width: none;
                border: 0;
                border-radius: 0;
                padding: 0;
              }
            }
          </style>
        </head>
        <body>
          <div class="invoice-shell">
            <div style="display:flex;justify-content:space-between;gap:24px;align-items:flex-start;border-bottom:1px solid #e2e8f0;padding-bottom:24px;">
              <div>
                <div class="brand-lockup">
                  <img src="/icon.svg" alt="LofiMart" class="brand-logo" />
                  <div class="brand-copy">
                    <div class="brand-subtitle">LofiMart Invoice</div>
                    <div class="brand-name">LofiMart</div>
                  </div>
                </div>
                <h1 style="margin:18px 0 0;font-size:28px;">Order #${escapeHtml(order.orderCode || order.id)}</h1>
                <p style="margin:12px 0 0;font-size:14px;color:#475569;">Placed on ${escapeHtml(new Date(order.createdAt).toLocaleString())}</p>
              </div>
              <div style="min-width:260px;padding:18px;border:1px solid #e2e8f0;border-radius:18px;background:#f8fafc;">
                <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:.16em;color:#64748b;text-transform:uppercase;">Invoice summary</p>
                <p style="margin:12px 0 0;font-size:14px;"><strong>Internal ID:</strong> ${escapeHtml(order.id)}</p>
                <p style="margin:8px 0 0;font-size:14px;"><strong>Order status:</strong> ${escapeHtml(String(order.status).replaceAll("_", " "))}</p>
                <p style="margin:8px 0 0;font-size:14px;"><strong>Payment method:</strong> ${escapeHtml(order.paymentMethod || "N/A")}</p>
                <p style="margin:8px 0 0;font-size:14px;"><strong>Payment status:</strong> ${escapeHtml(order.paymentStatus || "untracked")}</p>
              </div>
            </div>
            <div class="meta-grid" style="margin-top:28px;">
              <div style="padding:20px;border:1px solid #e2e8f0;border-radius:18px;background:#f8fafc;">
                <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:.16em;color:#64748b;text-transform:uppercase;">Billing and delivery</p>
                <div style="font-size:14px;line-height:1.75;color:#334155;">
                  ${shippingLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
                  ${customerEmail ? `<div>${escapeHtml(customerEmail)}</div>` : ""}
                </div>
              </div>
              <div style="padding:20px;border:1px solid #e2e8f0;border-radius:18px;background:#f8fafc;">
                <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:.16em;color:#64748b;text-transform:uppercase;">Shipping progress</p>
                <div style="font-size:14px;line-height:1.75;color:#334155;">
                  <div><strong>Courier:</strong> ${escapeHtml(order.courierProvider || "Pending assignment")}</div>
                  <div><strong>Tracking:</strong> ${escapeHtml(order.trackingId || "Pending assignment")}</div>
                  <div><strong>Shipment count:</strong> ${shipments.length}</div>
                  ${
                    shipments.length > 0
                      ? shipments
                          .slice(0, 3)
                          .map(
                            (shipment: any) =>
                              `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #e2e8f0;"><strong>${escapeHtml(
                                shipment.warehouse?.name || "Shipment",
                              )}:</strong> ${escapeHtml(String(shipment.status || "processing").replaceAll("_", " "))}${
                                shipment.trackingId ? ` \u2022 ${escapeHtml(shipment.trackingId)}` : ""
                              }</div>`,
                          )
                          .join("")
                      : `<div style="margin-top:8px;color:#64748b;">Courier allocation will appear here after seller processing.</div>`
                  }
                </div>
              </div>
            </div>
            ${
              sellerEntries.length > 0
                ? `<div style="margin-top:18px;padding:20px;border:1px solid #e2e8f0;border-radius:18px;background:#f8fafc;">
              <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:.16em;color:#64748b;text-transform:uppercase;">Seller information</p>
              <div class="seller-grid" style="gap:12px;">
                ${sellerEntries
                  .map(
                    (entry) => `<div style="padding:14px;border:1px solid #e2e8f0;border-radius:14px;background:#ffffff;">
                      <div style="font-size:14px;font-weight:700;color:#0f172a;">${escapeHtml(entry.storeName || entry.sellerName)}</div>
                      <div style="margin-top:4px;font-size:13px;color:#475569;">Seller: ${escapeHtml(entry.sellerName)}</div>
                      ${entry.phone ? `<div style="margin-top:4px;font-size:12px;color:#64748b;">Phone: ${escapeHtml(entry.phone)}</div>` : ""}
                      ${entry.email ? `<div style="margin-top:4px;font-size:12px;color:#64748b;">Email: ${escapeHtml(entry.email)}</div>` : ""}
                    </div>`,
                  )
                  .join("")}
              </div>
            </div>`
                : ""
            }
            <table style="width:100%;border-collapse:collapse;margin-top:28px;font-size:14px;">
              <thead>
                <tr style="background:#f8fafc;">
                  <th style="padding:14px 16px;text-align:left;border-bottom:1px solid #e5e7eb;">Item</th>
                  <th style="padding:14px 16px;text-align:center;border-bottom:1px solid #e5e7eb;">Qty</th>
                  <th style="padding:14px 16px;text-align:right;border-bottom:1px solid #e5e7eb;">Unit Price</th>
                  <th style="padding:14px 16px;text-align:right;border-bottom:1px solid #e5e7eb;">Line Total</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <div style="margin-top:24px;display:flex;justify-content:flex-end;">
              <div style="width:100%;max-width:320px;padding:20px;border:1px solid #e2e8f0;border-radius:18px;background:#f8fafc;">
                <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px;">
                  <span style="color:#64748b;">Items subtotal</span>
                  <strong>${formatInvoiceCurrency(itemSubtotal)}</strong>
                </div>
                <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px;">
                  <span style="color:#64748b;">Shipping</span>
                  <strong>Free</strong>
                </div>
                ${paymentReference ? `<div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px;">
                  <span style="color:#64748b;">Reference ID</span>
                  <strong>${escapeHtml(paymentReference)}</strong>
                </div>` : ""}
                ${
                  adjustmentAmount > 0
                    ? `<div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px;">
                  <span style="color:#64748b;">Discount / adjustment</span>
                  <strong style="color:#0f766e;">-${formatInvoiceCurrency(adjustmentAmount)}</strong>
                </div>`
                    : ""
                }
                <div style="display:flex;justify-content:space-between;padding:14px 0 0;margin-top:8px;border-top:1px solid #e5e7eb;font-size:18px;">
                  <span style="font-weight:700;">Total charged</span>
                  <strong style="color:#0f766e;">${formatInvoiceCurrency(orderTotal)}</strong>
                </div>
              </div>
            </div>
            <div style="margin-top:28px;padding:18px 20px;border-radius:18px;background:#0f172a;color:#e2e8f0;page-break-inside:avoid;">
              <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#94a3b8;">Support note</p>
              <p style="margin:10px 0 0;font-size:14px;line-height:1.7;">
                Keep this invoice for delivery reference, support follow-up, and payment clarification. If you need help, share order code <strong>${escapeHtml(
                  order.orderCode || order.id,
                )}</strong> with support.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  function buildInvoicePdf(order: any, shippingAddress: Record<string, any>) {
    const itemSubtotal = Array.isArray(order.items)
      ? order.items.reduce((sum: number, item: any) => sum + toPlainNumber(item.price) * Number(item.qty || 0), 0)
      : 0;
    const orderTotal = toPlainNumber(order.total);
    const adjustmentAmount = Math.max(0, itemSubtotal - orderTotal);
    const addressLines = buildInvoiceAddressLines(shippingAddress);
    const sellerEntries = buildInvoiceSellerEntries(order);
    const customerEmail = String(order?.user?.email || "").trim() || null;
    const paymentReference = String(order?.paymentIntentId || order?.trackingId || order?.id || "").trim() || null;
    const lines: Array<{ text: string; x: number; y: number; size?: number }> = [
      { text: "LofiMart Invoice", x: 40, y: 800, size: 12 },
      { text: `Order #${order.orderCode || order.id}`, x: 40, y: 775, size: 22 },
      { text: `Placed: ${new Date(order.createdAt).toLocaleString()}`, x: 40, y: 755, size: 11 },
      { text: `Internal ID: ${order.id}`, x: 360, y: 792, size: 10 },
      { text: `Payment: ${order.paymentMethod || "N/A"}`, x: 360, y: 775, size: 11 },
      { text: `Payment status: ${order.paymentStatus || "untracked"}`, x: 360, y: 758, size: 11 },
      { text: `Order status: ${String(order.status).replaceAll("_", " ")}`, x: 360, y: 741, size: 11 },
      { text: "Billing and delivery", x: 40, y: 715, size: 13 },
      { text: "Shipping progress", x: 320, y: 715, size: 13 },
      { text: `Courier: ${String(order.courierProvider || "Pending assignment")}`, x: 320, y: 695, size: 10 },
      { text: `Tracking: ${String(order.trackingId || "Pending assignment")}`, x: 320, y: 678, size: 10 },
      { text: `Shipments: ${String(Array.isArray(order.shipments) ? order.shipments.length : 0)}`, x: 320, y: 661, size: 10 },
      { text: "Items", x: 40, y: 610, size: 13 },
      { text: "Item", x: 40, y: 590, size: 11 },
      { text: "Qty", x: 310, y: 590, size: 11 },
      { text: "Unit", x: 380, y: 590, size: 11 },
      { text: "Total", x: 480, y: 590, size: 11 },
    ];

    let addressY = 695;
    for (const line of addressLines.slice(0, 4)) {
      lines.push({ text: String(line), x: 40, y: addressY, size: 10 });
      addressY -= 17;
    }
    if (customerEmail) {
      lines.push({ text: customerEmail, x: 40, y: addressY, size: 10 });
    }

    if (sellerEntries.length > 0) {
      lines.push({ text: "Seller information", x: 40, y: 628, size: 12 });
      let sellerY = 612;
      for (const entry of sellerEntries.slice(0, 4)) {
        lines.push({ text: `${entry.storeName || entry.sellerName} / Seller: ${entry.sellerName}`, x: 40, y: sellerY, size: 9 });
        sellerY -= 14;
        if (entry.phone || entry.email) {
          lines.push({ text: `${entry.phone || "No phone"}${entry.email ? ` / ${entry.email}` : ""}`, x: 48, y: sellerY, size: 8 });
          sellerY -= 12;
        }
      }
    }

    let currentY = sellerEntries.length > 0 ? 548 : 570;
    for (const item of order.items) {
      if (currentY < 150) break;
      const productName = String(item.product?.name || "Product").slice(0, 42);
      const variantText = item.variantSummary ? ` / ${String(item.variantSummary).slice(0, 18)}` : "";
      lines.push({ text: `${productName}${variantText}`, x: 40, y: currentY, size: 10 });
      lines.push({ text: String(item.qty), x: 315, y: currentY, size: 10 });
      lines.push({ text: formatInvoiceCurrency(item.price), x: 380, y: currentY, size: 10 });
      lines.push({ text: formatInvoiceCurrency(toPlainNumber(item.price) * item.qty), x: 470, y: currentY, size: 10 });
      currentY -= 18;
      if (item.variantSku || item.product?.sku) {
        lines.push({ text: `SKU: ${String(item.variantSku || item.product?.sku).slice(0, 42)}`, x: 48, y: currentY, size: 8 });
        currentY -= 14;
      }
    }

    currentY -= 10;
    lines.push({ text: `Items subtotal: ${formatInvoiceCurrency(itemSubtotal)}`, x: 330, y: currentY, size: 11 });
    lines.push({ text: "Shipping: Free", x: 360, y: currentY - 18, size: 11 });
    if (paymentReference) {
      lines.push({ text: `Reference: ${paymentReference}`, x: 330, y: currentY - 36, size: 10 });
    }
    if (adjustmentAmount > 0) {
      lines.push({ text: `Discount / adjustment: -${formatInvoiceCurrency(adjustmentAmount)}`, x: 290, y: currentY - (paymentReference ? 54 : 36), size: 11 });
      lines.push({ text: `Total charged: ${formatInvoiceCurrency(orderTotal)}`, x: 325, y: currentY - (paymentReference ? 80 : 62), size: 14 });
    } else {
      lines.push({ text: `Total charged: ${formatInvoiceCurrency(orderTotal)}`, x: 325, y: currentY - (paymentReference ? 60 : 42), size: 14 });
    }
    lines.push({
      text: `Keep invoice for support reference. Use order code ${String(order.orderCode || order.id).slice(0, 36)} if you contact support.`,
      x: 40,
      y: 70,
      size: 9,
    });

    return buildSimplePdf(lines);
  }

  function buildEditableCartItemsFromOrder(order: any, products: any[]) {
    const productMap = new Map(products.map((product: any) => [String(product.id), product]));

    return Array.isArray(order?.items)
      ? order.items
          .map((item: any) => {
            const product = productMap.get(String(item.productId));
            if (!product) return null;

            const selectedVariantKey = item.variantSku || item.variantSummary || "";

            return {
              id: product.id,
              sku: item.variantSku ?? product.sku ?? null,
              name: product.name,
              slug: product.slug,
              description: product.description ?? "",
              price: toPlainNumber(item.price),
              old_price: toPlainNumber(product.oldPrice ?? item.price),
              image: product.image ?? null,
              gallery_images: Array.isArray(product.galleryImages) ? product.galleryImages : [],
              video_url: product.videoUrl ?? null,
              model_3d: product.model3d ?? null,
              category: product.category ?? "",
              stock: Number(product.stock ?? 0),
              rating: Number(product.rating ?? 0),
              reviews_count: Number(product.reviewsCount ?? 0),
              variant_options: Array.isArray(product.variantOptions) ? product.variantOptions : [],
              specifications: Array.isArray(product.specifications) ? product.specifications : [],
              reseller_enabled: Boolean(product.resellerEnabled),
              reseller_base_price:
                product.resellerBasePrice === null || typeof product.resellerBasePrice === "undefined"
                  ? null
                  : toPlainNumber(product.resellerBasePrice),
              reseller_suggested_price:
                product.resellerSuggestedPrice === null || typeof product.resellerSuggestedPrice === "undefined"
                  ? null
                  : toPlainNumber(product.resellerSuggestedPrice),
              reseller_notes: product.resellerNotes ?? null,
              seller_id: product.sellerId ?? null,
              seller_name: product.seller?.name ?? undefined,
              store_name: product.seller?.storeName ?? null,
              seller_rating:
                Array.isArray(product.seller?.products) && product.seller.products.length > 0
                  ? Number(
                      (
                        product.seller.products.reduce((sum: number, entry: any) => sum + Number(entry.rating ?? 0), 0) /
                        product.seller.products.length
                      ).toFixed(1),
                    )
                  : null,
              response_time_hours: product.seller?.responseTimeHours ?? null,
              verification_badge: product.seller?.verificationSubmission?.status === "verified",
              selected_variant_key: selectedVariantKey,
              selected_variant_summary: item.variantSummary ?? null,
              selected_variant_sku: item.variantSku ?? null,
              quantity: Number(item.qty ?? 1),
            };
          })
          .filter(Boolean)
      : [];
  }

  app.post("/api/orders", authenticateToken, async (req: any, res: any) => {
    const { total, couponCode, paymentMethod, shippingAddress, items, refCode } = req.body;
    const userId = req.user.id;

    try {
      if (!(await isCheckoutPaymentMethodEnabled(paymentMethod))) {
        return res.status(400).json({ error: "Only Cash on delivery is available right now." });
      }

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Order items are required" });
      }

      const productIds = items.map((item) => String(item.id));
      const resellerId = await getResellerIdFromOrderRefCode(typeof refCode === "string" ? refCode : null);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          stock: true,
          sellerId: true,
          productStatus: true,
          price: true,
          resellerEnabled: true,
          resellerBasePrice: true,
          seller: {
            select: {
              id: true,
              sellerStatus: true,
              storefrontPublished: true,
            },
          },
          inventoryItems: {
            select: {
              warehouseId: true,
              quantity: true,
              warehouse: {
                select: {
                  id: true,
                  name: true,
                  city: true,
                  managerId: true,
                },
              },
            },
            orderBy: [
              { quantity: 'desc' },
            ],
          },
        },
      });

      const stockById = new Map<string, number>(products.map((product: any) => [product.id, Number(product.stock)]));
      const productById = new Map<string, any>(products.map((product: any) => [product.id, product]));
      const resellerMarkupRows = resellerId
        ? await prismaDirect.resellerMarkup.findMany({
            where: {
              resellerId,
              productId: {
                in: productIds,
              },
            },
            select: {
              productId: true,
              markupAmount: true,
            },
          })
        : [];
      const resellerMarkupMap = new Map(
        resellerMarkupRows.map((row: any) => [row.productId, Number(toPlainNumber(row.markupAmount) || 0)]),
      );

      const normalizedOrderItems = items.map((item: any) => {
        const product = productById.get(String(item.id));
        const requestedQuantity = Number(item.quantity);
        const fallbackPrice = Number(item.price ?? 0);
        let effectivePrice = fallbackPrice;

        if (resellerId && product?.resellerEnabled) {
          const basePrice = Number(toPlainNumber(product.resellerBasePrice ?? 0) || 0);
          const markupAmount = resellerMarkupMap.get(String(item.id));
          if (Number.isFinite(markupAmount as number)) {
            effectivePrice = Number((basePrice + Number(markupAmount || 0)).toFixed(2));
          } else if (Number.isFinite(basePrice) && basePrice > 0) {
            effectivePrice = Math.max(fallbackPrice, basePrice);
          }
        } else if (product) {
          effectivePrice = Number(toPlainNumber(product.price) || fallbackPrice || 0);
        }

        return {
          ...item,
          quantity: requestedQuantity,
          price: effectivePrice,
        };
      });

      const grossOrderTotal = Number(
        normalizedOrderItems.reduce(
          (sum: number, item: any) => sum + Number(item.price || 0) * Number(item.quantity || 0),
          0,
        ),
      );

      const couponSellerIds = [...new Set(products.map((product: any) => String(product.sellerId || "")).filter(Boolean))];
      const couponScopedSellerId = couponSellerIds.length === 1 ? couponSellerIds[0] : null;
      const validatedCoupon = couponCode
        ? await validateCouponForCart({
            code: couponCode,
            orderValue: grossOrderTotal,
            sellerId: couponScopedSellerId as string | null,
            productIds,
          })
        : null;
      const couponDiscountAmount = validatedCoupon
        ? validatedCoupon.discount_type === "percentage"
          ? (grossOrderTotal * Number(validatedCoupon.discount_value || 0)) / 100
          : Number(validatedCoupon.discount_value || 0)
        : 0;
      const finalOrderTotal = Math.max(0, grossOrderTotal - Math.min(grossOrderTotal, couponDiscountAmount));

      for (const item of normalizedOrderItems) {
        const currentStock = stockById.get(String(item.id));
        if (currentStock === undefined) {
          return res.status(404).json({ error: `Product ${item.id} not found` });
        }
        const product = productById.get(String(item.id));
        if (
          !product ||
          product.productStatus !== PRODUCT_STATUSES.published ||
          !isSellerApproved(product.seller?.sellerStatus) ||
          !Boolean(product.seller?.storefrontPublished)
        ) {
          return res.status(403).json({ error: "One or more products are not available for sale right now." });
        }
        if (currentStock < Number(item.quantity)) {
          return res.status(400).json({ error: `Insufficient stock for product ${item.id}` });
        }
      }

      const orderCode = await generateUniqueOrderCode();
      const createdOrder = await prisma.$transaction(async (tx: any) => {
        const order = await tx.order.create({
          data: {
            orderCode,
            userId: String(userId),
            tenantId: req.user.tenantId ?? null,
            total: Number(finalOrderTotal.toFixed(2)),
            status: "processing",
            paymentMethod,
            paymentStatus: "pending",
            refCode: refCode || null,
            shippingAddress,
            items: {
              create: normalizedOrderItems.map((item: any) => ({
                productId: String(item.id),
                qty: Number(item.quantity),
                price: Number(item.price),
                variantSummary: typeof item.selected_variant_summary === "string" ? item.selected_variant_summary : null,
                variantSku: typeof item.selected_variant_sku === "string" ? item.selected_variant_sku : null,
              })),
            },
          },
          include: {
            items: true,
          },
        });

        const orderItemsByProductId = new Map<string, { id: string; qty: number; price: number }[]>();
        for (const orderItem of order.items) {
          const bucket = orderItemsByProductId.get(orderItem.productId) ?? [];
          bucket.push({
            id: orderItem.id,
            qty: Number(orderItem.qty),
            price: Number(orderItem.price),
          });
          orderItemsByProductId.set(orderItem.productId, bucket);
        }

        const shipmentGroups = new Map<string, {
          sellerId: string;
          warehouseId: string | null;
          total: number;
          itemCount: number;
          items: Array<{ orderItemId: string; productId: string; qty: number; price: number }>;
        }>();

        for (const item of normalizedOrderItems) {
          const product = productById.get(String(item.id));
          if (!product || !product.sellerId) {
            continue;
          }

          const selectedWarehouse = product.inventoryItems.find((inventoryItem: any) => Number(inventoryItem.quantity) > 0)?.warehouseId ?? null;
          const key = `${product.sellerId}::${selectedWarehouse ?? 'unassigned'}`;
          const group = shipmentGroups.get(key) ?? {
            sellerId: product.sellerId,
            warehouseId: selectedWarehouse,
            total: 0,
            itemCount: 0,
            items: [],
          };

          const linkedOrderItems = orderItemsByProductId.get(String(item.id)) ?? [];
          const linkedOrderItem = linkedOrderItems.shift();
          orderItemsByProductId.set(String(item.id), linkedOrderItems);

          if (!linkedOrderItem) {
            continue;
          }

          group.total += Number(linkedOrderItem.price) * Number(linkedOrderItem.qty);
          group.itemCount += Number(linkedOrderItem.qty);
          (group.items as any).push({
            orderItemId: linkedOrderItem.id,
            productId: String(item.id),
            qty: Number(linkedOrderItem.qty),
            price: Number(linkedOrderItem.price),
          });
          shipmentGroups.set(key, group);
        }

        for (const group of shipmentGroups.values()) {
          const shipment = await tx.orderShipment.create({
            data: {
              orderId: order.id,
              sellerId: group.sellerId,
              warehouseId: group.warehouseId,
              status: 'processing',
              total: group.total,
              itemCount: group.itemCount,
            },
          });

          if (group.items.length > 0) {
            await tx.orderShipmentItem.createMany({
              data: group.items.map((shipmentItem) => ({
                shipmentId: shipment.id,
                orderItemId: shipmentItem.orderItemId,
                productId: shipmentItem.productId,
                qty: shipmentItem.qty,
                price: shipmentItem.price,
              })),
            });
          }
        }

        const lowStockAlerts: Array<{
          id: string;
          stock: number;
          name: string;
          sellerId: string | null;
          warehouseId: string | null;
          warehouseName: string | null;
        }> = [];
        const stockUpdates: Array<{ id: string; stock: number }> = [];

        for (const item of normalizedOrderItems) {
          const updated = await tx.product.update({
            where: { id: String(item.id) },
            data: {
              stock: {
                decrement: Number(item.quantity),
              },
            },
            select: {
              id: true,
              stock: true,
            },
          });
          const productMeta = productById.get(String(item.id));
          if (
            productMeta &&
            Number(updated.stock) <= Number(env.LOW_STOCK_THRESHOLD)
          ) {
            const selectedInventoryItem =
              productMeta.inventoryItems.find((inventoryItem: any) => Number(inventoryItem.quantity) > 0) ??
              productMeta.inventoryItems[0] ??
              null;
            lowStockAlerts.push({
              id: String(updated.id),
              stock: Number(updated.stock),
              name: String((item as { name?: string }).name || ''),
              sellerId: productMeta.sellerId ?? null,
              warehouseId: selectedInventoryItem?.warehouseId ?? null,
              warehouseName: selectedInventoryItem?.warehouse?.name ?? null,
            });
          }
          stockUpdates.push({
            id: String(updated.id),
            stock: Number(updated.stock),
          });
        }

        return {
          ...order,
          lowStockAlerts,
          stockUpdates,
        };
      }, {
        maxWait: 10_000,
        timeout: 20_000,
      });

      const redis = await ensureRedis();
      await redis.del(userCartKey(userId));
      const orderRevenueTotal = normalizedOrderItems.reduce(
        (sum: number, item: any) => sum + Number(item.price || 0) * Number(item.quantity || 0),
        0,
      );
      if (Array.isArray(createdOrder.stockUpdates)) {
        for (const update of createdOrder.stockUpdates) {
          emitStockUpdate(update.id as any, update.stock);
        }
      }
      notifyOrderPlaced(userId, createdOrder.id as any, Number(orderRevenueTotal));
      if (Array.isArray(createdOrder.lowStockAlerts) && createdOrder.lowStockAlerts.length > 0) {
        const notifiedProductIds = new Set<string>();
        for (const product of createdOrder.lowStockAlerts) {
          if (!product.sellerId || notifiedProductIds.has(product.id)) continue;
          notifiedProductIds.add(product.id);
          await createNotification({
            userId: product.sellerId,
            type: 'inventory',
            title: product.stock <= 2 ? 'Critical stock alert' : 'Low stock alert',
            message:
              product.stock <= 2
                ? `A recent order pushed product ${product.id} down to ${product.stock} unit${product.stock === 1 ? '' : 's'}${product.warehouseName ? ` at ${product.warehouseName}` : ''}. Restock urgently.`
                : `Product ${product.id} is now at ${product.stock} units and below your stock threshold.`,
            actionUrl:
              product.stock <= 2
                ? product.warehouseId
                  ? `/seller/pickup-locations?warehouse=${encodeURIComponent(product.warehouseId)}`
                  : `/seller/products/edit/${encodeURIComponent(product.id)}`
                : `/seller/products?search=${encodeURIComponent(product.id)}&product=${encodeURIComponent(product.id)}`,
            metadata: {
              productId: product.id,
              stock: product.stock,
              orderId: String(createdOrder.id),
              warehouseId: product.warehouseId,
              warehouseName: product.warehouseName,
            },
          });

          if (product.stock <= 2) {
            const admins = await getActiveAdminUsers();
            await Promise.all(
              admins.map((admin) =>
                createNotification({
                  userId: admin.id,
                  type: 'inventory',
                  title: 'Critical stock requires review',
                  message: `Product ${product.id} has dropped to ${product.stock} unit${product.stock === 1 ? '' : 's'} after order ${createdOrder.id}.`,
                  actionUrl: `/admin/inventory?section=po&product=${encodeURIComponent(product.id)}`,
                  metadata: {
                    productId: product.id,
                    stock: product.stock,
                    orderId: String(createdOrder.id),
                    severity: 'critical',
                  },
                }),
              ),
            );
          }
        }
      }
      void enqueueOrderProcessing({
        orderId: String(createdOrder.id),
        userId: String(userId),
        tenantId: req.user.tenantId ?? null,
      });

      const tenantSetting = await ensureTenantSetting(req.user.tenantId ?? null);
      const cashbackAmount = Number(finalOrderTotal) * ((tenantSetting?.orderCashbackBps ?? 0) / 10000);
      if (cashbackAmount > 0) {
        await grantReward({
          userId: String(userId),
          tenantId: req.user.tenantId ?? null,
          eventType: "order_cashback",
          source: "order",
          description: `Cashback reward for order ${createdOrder.id}`,
          walletAmount: Number(cashbackAmount.toFixed(2)),
          referenceId: String(createdOrder.id),
        });
      }

      if (Math.random() <= (tenantSetting?.surpriseRewardChance ?? 0)) {
        await grantReward({
          userId: String(userId),
          tenantId: req.user.tenantId ?? null,
          eventType: "surprise_reward",
          source: "order",
          description: `Surprise post-checkout reward for order ${createdOrder.id}`,
          coins: 50,
          referenceId: String(createdOrder.id),
        });
      }

      await updateMissionProgress(String(userId), "first-order", 1);
      await updateMissionProgress(String(userId), "multi-order", 1);
      await createNotification({
        userId: String(userId),
        tenantId: req.user.tenantId ?? null,
        type: "order_update",
        title: "Order placed successfully",
        message: `Order ${createdOrder.id} is confirmed and is now being processed.`,
        actionUrl: `/order-success?orderId=${createdOrder.id}`,
      });
      res.json({ success: true, orderId: createdOrder.id });
    } catch (error) {
      res.status(500).json({ error: "Failed to place order" });
    }
  });

  app.get("/api/orders/my-orders", authenticateToken, async (req: any, res) => {
    const orders = await prisma.order.findMany({
      where: { userId: String(req.user.id) },
      orderBy: { createdAt: "desc" },
      include: {
        shipments: {
          include: {
            warehouse: {
              select: {
                id: true,
                name: true,
                city: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    res.json(orders.map(serializeOrder));
  });

  app.get("/api/orders/:id", authenticateToken, async (req: any, res) => {
    const order = await prisma.order.findFirst({
      where: {
        id: req.params.id,
        userId: String(req.user.id),
      },
      include: {
        user: {
          select: {
            email: true,
            phone: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                name: true,
                image: true,
                sku: true,
                seller: {
                  select: {
                    id: true,
                    name: true,
                    storeName: true,
                    email: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
        shipments: {
          include: {
            seller: {
              select: {
                id: true,
                name: true,
                storeName: true,
                email: true,
                phone: true,
              },
            },
            warehouse: {
              select: {
                id: true,
                name: true,
                city: true,
              },
            },
            items: {
              include: {
                product: {
                  select: {
                    name: true,
                    image: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!order) return res.status(404).json({ error: "Order not found" });

    const returnRequest = await prisma.accountActionRequest.findFirst({
      where: {
        userId: String(req.user.id),
        orderId: order.id,
        type: "return_request",
      } as any,
      orderBy: { createdAt: "desc" },
    });

    res.json({
      ...serializeOrder(order),
      items: order.items.map(serializeOrderItem),
      return_request: returnRequest ? serializeAccountActionRequest(returnRequest) : null,
    });
  });

  app.post("/api/orders/:id/cancel", authenticateToken, async (req: any, res) => {
    const order = await prisma.order.findFirst({
      where: {
        id: req.params.id,
        userId: String(req.user.id),
      },
      include: {
        items: true,
        shipments: true,
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const controls = getCustomerOrderActionState(order);
    if (!controls.canCancel) {
      return res.status(409).json({ error: controls.blockReason || "This order can no longer be cancelled." });
    }

    try {
      const updatedOrder = await prisma.$transaction(async (tx: any) => {
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stock: {
                increment: Number(item.qty || 0),
              },
            },
          });
        }

        await tx.orderShipment.updateMany({
          where: { orderId: order.id },
          data: {
            status: "cancelled",
          },
        });

        return tx.order.update({
          where: { id: order.id },
          data: {
            status: "cancelled",
            paymentStatus: order.paymentMethod === "cod" ? "cancelled" : order.paymentStatus,
            failureReason: "Cancelled by customer before seller acceptance",
          },
          include: {
            shipments: true,
          },
        });
      });

      const uniqueSellerIds = [...new Set(order.shipments.map((shipment: any) => String(shipment.sellerId || "")).filter(Boolean))];

      await Promise.all([
        createNotification({
          userId: String(req.user.id),
          tenantId: order.tenantId ?? null,
          type: "order_update",
          title: "Order cancelled",
          message: `Order ${order.orderCode || order.id} was cancelled before seller acceptance.`,
          actionUrl: `/account/orders/${order.id}`,
          metadata: {
            orderId: order.id,
            status: "cancelled",
            source: "customer_cancel",
          },
        }),
        ...uniqueSellerIds.map((sellerId) =>
          createNotification({
            userId: sellerId as string,
            tenantId: order.tenantId ?? null,
            createdById: String(req.user.id),
            type: "order_update",
            title: "Customer cancelled an order",
            message: `Order ${order.orderCode || order.id} was cancelled before you accepted it.`,
            actionUrl: `/seller/orders?order=${encodeURIComponent(order.id)}`,
            metadata: {
              orderId: order.id,
              status: "cancelled",
              source: "customer_cancel",
            },
          }),
        ),
      ]);

      res.json({
        success: true,
        order: serializeOrder(updatedOrder),
      });
    } catch (error) {
      logServerError("cancel customer order", error, { userId: String(req.user.id), orderId: req.params.id });
      res.status(500).json({ error: "Failed to cancel order" });
    }
  });

  app.post("/api/orders/:id/edit", authenticateToken, async (req: any, res) => {
    const order = await prisma.order.findFirst({
      where: {
        id: req.params.id,
        userId: String(req.user.id),
      },
      include: {
        items: true,
        shipments: true,
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const controls = getCustomerOrderActionState(order);
    if (!controls.canEdit) {
      return res.status(409).json({ error: controls.blockReason || "This order can no longer be edited." });
    }

    const productIds = [...new Set(order.items.map((item: any) => String(item.productId)).filter(Boolean))];
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
      },
      include: {
        seller: {
          select: {
            id: true,
            name: true,
            storeName: true,
            responseTimeHours: true,
            verificationSubmission: {
              select: {
                status: true,
              },
            },
            products: {
              select: {
                rating: true,
              },
            },
          },
        },
      },
    });

    if (products.length !== productIds.length) {
      return res.status(409).json({ error: "Some products in this order are no longer available for editing." });
    }

    const editableCartItems = buildEditableCartItemsFromOrder(order, products);

    try {
      const updatedOrder = await prisma.$transaction(async (tx: any) => {
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stock: {
                increment: Number(item.qty || 0),
              },
            },
          });
        }

        await tx.orderShipment.updateMany({
          where: { orderId: order.id },
          data: {
            status: "cancelled",
          },
        });

        return tx.order.update({
          where: { id: order.id },
          data: {
            status: "cancelled",
            paymentStatus: order.paymentMethod === "cod" ? "cancelled" : order.paymentStatus,
            failureReason: "Customer reopened order for edits before seller acceptance",
          },
          include: {
            shipments: true,
          },
        });
      });

      const uniqueSellerIds = [...new Set(order.shipments.map((shipment: any) => String(shipment.sellerId || "")).filter(Boolean))];

      await Promise.all([
        createNotification({
          userId: String(req.user.id),
          tenantId: order.tenantId ?? null,
          type: "order_update",
          title: "Order reopened for edits",
          message: `Order ${order.orderCode || order.id} was moved back to your cart before seller acceptance.`,
          actionUrl: `/cart`,
          metadata: {
            orderId: order.id,
            status: "cancelled",
            source: "customer_edit",
          },
        }),
        ...uniqueSellerIds.map((sellerId) =>
          createNotification({
            userId: sellerId as string,
            tenantId: order.tenantId ?? null,
            createdById: String(req.user.id),
            type: "order_update",
            title: "Customer reopened an order",
            message: `Order ${order.orderCode || order.id} was returned to the customer's cart before you accepted it.`,
            actionUrl: `/seller/orders?order=${encodeURIComponent(order.id)}`,
            metadata: {
              orderId: order.id,
              status: "cancelled",
              source: "customer_edit",
            },
          }),
        ),
      ]);

      res.json({
        success: true,
        order: serializeOrder(updatedOrder),
        cart_items: editableCartItems,
      });
    } catch (error) {
      logServerError("edit customer order", error, { userId: String(req.user.id), orderId: req.params.id });
      res.status(500).json({ error: "Failed to reopen order for editing" });
    }
  });

  app.get("/api/orders/:id/invoice", authenticateToken, async (req: any, res) => {
    const order = await prisma.order.findFirst({
      where: {
        id: req.params.id,
        userId: String(req.user.id),
      },
      include: {
        user: {
          select: {
            email: true,
            phone: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                name: true,
                sku: true,
                seller: {
                  select: {
                    id: true,
                    name: true,
                    storeName: true,
                    email: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
        shipments: {
          include: {
            seller: {
              select: {
                id: true,
                name: true,
                storeName: true,
                email: true,
                phone: true,
              },
            },
            warehouse: {
              select: {
                name: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const shippingAddress =
      order.shippingAddress && typeof order.shippingAddress === "object"
        ? (order.shippingAddress as Record<string, any>)
        : {};

    const html = buildInvoiceHtml(order, shippingAddress);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=\"invoice-${order.id}.html\"`);
    res.send(html);
  });

  app.get("/api/orders/:id/invoice.pdf", authenticateToken, async (req: any, res) => {
    const order = await prisma.order.findFirst({
      where: {
        id: req.params.id,
        userId: String(req.user.id),
      },
      include: {
        user: {
          select: {
            email: true,
            phone: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                name: true,
                sku: true,
                seller: {
                  select: {
                    id: true,
                    name: true,
                    storeName: true,
                    email: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
        shipments: {
          include: {
            seller: {
              select: {
                id: true,
                name: true,
                storeName: true,
                email: true,
                phone: true,
              },
            },
            warehouse: {
              select: {
                name: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const shippingAddress =
      order.shippingAddress && typeof order.shippingAddress === "object"
        ? (order.shippingAddress as Record<string, any>)
        : {};

    const pdfBuffer = buildInvoicePdf(order, shippingAddress);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=\"invoice-${order.id}.pdf\"`);
    res.setHeader("Content-Length", String(pdfBuffer.length));
    res.send(pdfBuffer);
  });

  app.post("/api/orders/:id/return-request", authenticateToken, async (req: any, res) => {
    const order = await prisma.order.findFirst({
      where: {
        id: req.params.id,
        userId: String(req.user.id),
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (!["delivered", "returned"].includes(String(order.status))) {
      return res.status(400).json({ error: "Return requests are available only after delivery." });
    }

    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 10) {
      return res.status(400).json({ error: "Please provide a clear return reason with at least 10 characters." });
    }

    const existing = await prisma.accountActionRequest.findFirst({
      where: {
        userId: String(req.user.id),
        orderId: order.id,
        type: "return_request",
        status: { in: ["pending", "approved"] },
      } as any,
    });

    if (existing) {
      return res.status(409).json({ error: "A return request for this order is already active." });
    }

    const request = await prisma.accountActionRequest.create({
      data: {
        userId: String(req.user.id),
        orderId: order.id,
        type: "return_request",
        status: "pending",
        reason,
      } as any,
    });

    await createNotification({
      userId: String(req.user.id),
      tenantId: order.tenantId ?? null,
      type: "account_action",
      title: "Return request received",
      message: `Your return request for order ${order.id} has been submitted for review.`,
      actionUrl: `/account/orders/${order.id}?return=${request.id}`,
      metadata: { orderId: order.id, requestId: request.id, type: "return_request" },
    });

    const admins = await getActiveAdminUsers();
    await Promise.all(
      admins.map((admin) =>
        createNotification({
          userId: admin.id,
          tenantId: order.tenantId ?? null,
          createdById: String(req.user.id),
          type: "account_action",
          title: "New return request requires review",
          message: `Order ${order.id} has a new customer return request waiting for review.`,
          actionUrl: `/admin/returns?request=${request.id}&search=${encodeURIComponent(order.id)}`,
          metadata: {
            orderId: order.id,
            requestId: request.id,
            type: "return_request",
            status: "pending",
          },
        }),
      ),
    );

    res.json({ success: true, request: serializeAccountActionRequest(request) });
  });

  app.patch("/api/orders/:id/status", authenticateToken, async (req: any, res) => {
    const { status, courierProvider, trackingId, deliveryFailureReason } = req.body;
    const orderId = req.params.id;
    const userRole = req.user.role;

    if (userRole !== 'admin' && userRole !== 'seller') {
      return res.status(403).json({ error: "Unauthorized" });
    }

    try {
      if (userRole === 'seller') {
        const hasProduct = await prisma.orderItem.findFirst({
          where: {
            orderId,
            product: {
              sellerId: String(req.user.id),
            },
          },
          select: { id: true },
        });
        
        if (!hasProduct) return res.status(403).json({ error: "Unauthorized" });
      }

      const timestampData: Record<string, unknown> = {};

      if (status === 'pickup_requested') timestampData.pickupRequestedAt = new Date();
      if (status === 'picked_up') timestampData.pickedUpAt = new Date();
      if (status === 'out_for_delivery') timestampData.outForDeliveryAt = new Date();
      if (status === 'delivered') timestampData.deliveredAt = new Date();
      if (status !== 'delivery_failed') timestampData.deliveryFailureReason = null;
      if (status === 'delivery_failed' && typeof deliveryFailureReason === 'string' && deliveryFailureReason.trim()) {
        timestampData.deliveryFailureReason = deliveryFailureReason.trim();
      }

      const updatedOrder: any = await prisma.order.update({
        where: { id: orderId },
        data: {
          status,
          courierProvider: typeof courierProvider === 'string' && courierProvider.trim() ? courierProvider.trim() : undefined,
          trackingId: typeof trackingId === 'string' && trackingId.trim() ? trackingId.trim() : undefined,
          ...timestampData,
        } as any,
      });

      const customerMessageByStatus: Record<string, string> = {
        packed: `Order ${updatedOrder.id} has been packed and is being prepared for courier handover.`,
        ready_for_pickup: `Order ${updatedOrder.id} is ready for courier pickup.`,
        pickup_requested: `Courier pickup has been requested for order ${updatedOrder.id}.`,
        picked_up: `Order ${updatedOrder.id} has been picked up by the courier.`,
        in_transit: `Order ${updatedOrder.id} is now in transit.`,
        out_for_delivery: `Order ${updatedOrder.id} is out for delivery.`,
        delivered: `Order ${updatedOrder.id} has been delivered successfully.`,
        delivery_failed: `Delivery attempt failed for order ${updatedOrder.id}. Our team will follow up shortly.`,
      };

      if (customerMessageByStatus[status]) {
        await createNotification({
          userId: updatedOrder.userId,
          tenantId: updatedOrder.tenantId ?? null,
          type: 'order_update',
          title: 'Shipment update',
          message: customerMessageByStatus[status],
          actionUrl: `/track?order=${updatedOrder.id}`,
          metadata: {
            orderId: updatedOrder.id,
            status: updatedOrder.status,
            courierProvider: updatedOrder.courierProvider,
            trackingId: updatedOrder.trackingId,
          },
        });
      }

      if (status === 'delivered') {
        await settleResellerCommissionsForOrder(updatedOrder.id);
      } else if (status === 'cancelled' || status === 'returned' || status === 'delivery_failed') {
        await reverseResellerCommissionsForOrder(updatedOrder.id, status);
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update order status" });
    }
  });

  app.get("/api/orders/track/:id", async (req, res) => {
    const trackingKey = String(req.params.id || "").trim();
    const order: any = await prisma.order.findFirst({
      where: {
        OR: [
          { id: trackingKey },
          { orderCode: trackingKey.toUpperCase() },
        ],
      },
      select: {
        id: true,
        orderCode: true,
        status: true,
        createdAt: true,
        courierProvider: true,
        trackingId: true,
        pickupRequestedAt: true,
        pickedUpAt: true,
        outForDeliveryAt: true,
        deliveredAt: true,
        deliveryFailureReason: true,
        shipments: {
          include: {
            warehouse: {
              select: {
                id: true,
                name: true,
                city: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      } as any,
    });
    if (!order) return res.status(404).json({ error: "Order not found" });

    const shipmentStages = [
      { label: 'Order placed', statuses: ['pending', 'processing', 'packed', 'ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned', 'cancelled'] },
      { label: 'Processing', statuses: ['processing', 'packed', 'ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'] },
      { label: 'Packed', statuses: ['packed', 'ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'] },
      { label: 'Ready for pickup', statuses: ['ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'] },
      { label: 'Pickup requested', statuses: ['pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'] },
      { label: 'Picked up', statuses: ['picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'] },
      { label: 'In transit', statuses: ['in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'] },
      { label: 'Out for delivery', statuses: ['out_for_delivery', 'delivered', 'delivery_failed'] },
      { label: 'Delivered', statuses: ['delivered'] },
    ];

    const stepDates: Record<string, string> = {
      'Order placed': new Date(order.createdAt).toLocaleString(),
      'Processing': order.status !== 'pending' ? 'Updated' : '-',
      'Packed': ['packed', 'ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'].includes(order.status) ? 'Updated' : '-',
      'Ready for pickup': ['ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'].includes(order.status) ? 'Updated' : '-',
      'Pickup requested': order.pickupRequestedAt ? new Date(order.pickupRequestedAt).toLocaleString() : '-',
      'Picked up': order.pickedUpAt ? new Date(order.pickedUpAt).toLocaleString() : '-',
      'In transit': ['in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'].includes(order.status) ? 'Updated' : '-',
      'Out for delivery': order.outForDeliveryAt ? new Date(order.outForDeliveryAt).toLocaleString() : '-',
      'Delivered': order.deliveredAt ? new Date(order.deliveredAt).toLocaleString() : '-',
    };

    const steps = shipmentStages.map((stage) => ({
      label: stage.label,
      date: stepDates[stage.label] ?? '-',
      completed: stage.statuses.includes(order.status),
    }));

    res.json({
      id: order.id,
      order_code: order.orderCode ?? null,
      status: order.status,
      created_at: order.createdAt.toISOString(),
      courier_provider: order.courierProvider ?? null,
      tracking_id: order.trackingId ?? null,
      delivery_failure_reason: order.deliveryFailureReason ?? null,
      shipments: Array.isArray(order.shipments) ? order.shipments.map(serializeOrderShipment) : [],
      steps,
    });
  });
}
