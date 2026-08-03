import type { RouteContext } from "./context.js";
import {
  serializeProduct,
  serializeFlashSaleCampaign,
  serializeFlashSaleEntry,
  normalizeStorefrontSlug,
  normalizeStorefrontDomain,
  generateStorefrontDomainVerificationToken,
  buildStorefrontDomainVerificationPayload,
  canPublishSellerProduct,
  buildSellerApprovalRequirementState,
  normalizeBangladeshPhone,
  buildHourlySeriesFromOrders,
} from "../../server/serializers.js";
import {
  serializeOrder,
  serializeOrderShipment,
  serializeOrderItem,
  toPlainNumber,
} from "./serializers.js";
import {
  PRODUCT_STATUSES,
  SELLER_STATUSES,
  isSellerApproved,
  getSellerApprovalBlockedMessage,
  normalizeSellerStatus,
  canSellerSubmitForReview,
} from "../../lib/sellerApproval.js";
import {
  createNotification,
} from "../../features/admin/services/engagement/gamification.js";
import { deleteCacheByPrefix } from "../../features/shared/services/cache/store.js";
import { logisticsModule } from "../../modules/logistics/index.js";
import { storefrontSettingsSchema } from "../../modules/profile/validation.js";
import {
  isCourierProviderEnabled,
  getCommerceChannelSettings,
} from "../../features/shared/services/platform/commerceChannels.js";

async function getSellerApprovalGuardSnapshot(prisma: any, userId: string) {
  const [seller, verificationSubmission, payoutMethodCount, warehouses] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        emailVerified: true,
        phoneVerified: true,
        storeName: true,
        bio: true,
        storefrontSlug: true,
        storefrontHeadline: true,
        sellerStatus: true,
      },
    }),
    prisma.verificationSubmission.findUnique({
      where: { userId },
      select: {
        id: true,
        status: true,
      },
    }),
    prisma.payoutMethod.count({
      where: { userId, status: "active" },
    }),
    prisma.warehouse.findMany({
      where: { managerId: userId },
      select: {
        address: true,
        city: true,
        phone: true,
        contactName: true,
      },
    }),
  ]);

  if (!seller) {
    return null;
  }

  const approval = buildSellerApprovalRequirementState({
    seller,
    verificationSubmission,
    payoutMethodCount,
    warehouses,
  });

  return {
    seller,
    verificationSubmission,
    payoutMethodCount,
    warehouses,
    approval,
  };
}

async function loadRecentManualOrdersForSeller(prisma: any, userId: string) {
  const orders = await prisma.order.findMany({
    where: {
      items: {
        some: {
          product: {
            sellerId: userId,
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              image: true,
              sku: true,
            },
          },
        },
      },
    },
  });

  return orders
    .filter((order: any) => {
      const shippingAddress =
        order.shippingAddress && typeof order.shippingAddress === "object"
          ? (order.shippingAddress as Record<string, any>)
          : null;
      return (
        Boolean(shippingAddress?.manual_order) &&
        shippingAddress?.created_by_role === "seller" &&
        String(shippingAddress?.created_by_user_id || "") === userId
      );
    })
    .map((order: any) => ({
      ...serializeOrder(order),
      items: order.items.map(serializeOrderItem),
    }));
}

export function registerSellerRoutes(ctx: RouteContext): void {
  const {
    app,
    env,
    prisma,
    authenticateToken,
    requireRole,
    getActiveAdminUsers,
    handleAuditLog,
    logServerError,
    loadManualOrderCatalogForRole,
    createManualMarketplaceOrder,
    updateManualMarketplaceOrder,
    cancelManualMarketplaceOrder,
  } = ctx;

  app.get("/api/seller/products", authenticateToken, requireRole("seller"), async (req: any, res) => {
    const products = await prisma.product.findMany({
      where: { sellerId: String(req.user.id) },
      orderBy: { createdAt: "desc" },
    });
    res.json(products.map(serializeProduct));
  });

  app.get("/api/seller/products/:id", authenticateToken, requireRole("seller"), async (req: any, res) => {
    const product = await prisma.product.findFirst({
      where: {
        id: String(req.params.id),
        sellerId: String(req.user.id),
      },
    });

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(serializeProduct(product));
  });

  app.get("/api/seller/flash-sale", authenticateToken, requireRole("seller"), async (req: any, res) => {
    const sellerId = String(req.user.id);

    try {
      const [campaigns, entries] = await Promise.all([
        prisma.flashSaleCampaign.findMany({
          where: {
            status: { in: ["draft", "scheduled", "live", "published"] },
          },
          orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
        }),
        prisma.flashSaleEntry.findMany({
          where: { sellerId },
          include: {
            product: {
              include: {
                seller: { select: { name: true } },
              },
            },
            seller: { select: { name: true } },
            reviewedBy: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
      ]);

      res.json({
        campaigns: campaigns.map(serializeFlashSaleCampaign),
        entries: entries.map(serializeFlashSaleEntry),
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to load seller flash sale workspace" });
    }
  });

  app.post("/api/seller/flash-sale/entries", authenticateToken, requireRole("seller"), async (req: any, res) => {
    const sellerId = String(req.user.id);
    const campaignId = typeof req.body?.campaignId === "string" ? req.body.campaignId.trim() : "";
    const productId = typeof req.body?.productId === "string" ? req.body.productId.trim() : "";
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
    const allocatedStock = Number(req.body?.allocatedStock ?? 0);
    const salePrice = Number(req.body?.salePrice ?? 0);

    if (!campaignId || !productId || !Number.isFinite(salePrice) || salePrice <= 0) {
      return res.status(400).json({ error: "Campaign, product, and valid sale price are required" });
    }

    try {
      const seller = await prisma.user.findUnique({
        where: { id: sellerId },
        select: { sellerStatus: true },
      });
      if (!isSellerApproved(seller?.sellerStatus)) {
        return res.status(403).json({ error: getSellerApprovalBlockedMessage("flash_sale_submission", seller?.sellerStatus) });
      }

      const [campaign, product, existing] = await Promise.all([
        prisma.flashSaleCampaign.findUnique({
          where: { id: campaignId },
        }),
        prisma.product.findFirst({
          where: {
            id: productId,
            sellerId,
            productStatus: PRODUCT_STATUSES.published,
          },
        }),
        prisma.flashSaleEntry.findUnique({
          where: {
            campaignId_productId: {
              campaignId,
              productId,
            },
          },
        }),
      ]);

      if (!campaign) {
        return res.status(404).json({ error: "Flash sale campaign not found" });
      }

      if (!product) {
        return res.status(404).json({ error: "Seller product not found" });
      }

      if (existing && existing.sellerId !== sellerId) {
        return res.status(403).json({ error: "This product is already reserved by another seller submission" });
      }

      if (campaign.status === "ended" || campaign.status === "archived") {
        return res.status(400).json({ error: "This campaign is no longer accepting product submissions" });
      }

      const entry = await prisma.flashSaleEntry.upsert({
        where: {
          campaignId_productId: {
            campaignId,
            productId,
          },
        },
        update: {
          salePrice,
          allocatedStock: Number.isFinite(allocatedStock) ? Math.max(0, Math.floor(allocatedStock)) : 0,
          note: note || null,
          status: "pending",
          reviewedAt: null,
          reviewedById: null,
          rejectionReason: null,
        },
        create: {
          campaignId,
          sellerId,
          productId,
          salePrice,
          allocatedStock: Number.isFinite(allocatedStock) ? Math.max(0, Math.floor(allocatedStock)) : 0,
          note: note || null,
          status: "pending",
        },
        include: {
          product: {
            include: {
              seller: { select: { name: true } },
            },
          },
          seller: { select: { name: true } },
          reviewedBy: { select: { name: true } },
        },
      });

      const admins = await getActiveAdminUsers();
      await Promise.all(
        admins.map((admin) =>
          createNotification({
            userId: admin.id,
            createdById: sellerId,
            type: "flash_sale",
            title: "New flash sale submission",
            message: `${entry.seller?.name || "A seller"} submitted ${entry.product?.name || "a product"} for flash sale review.`,
            actionUrl: `/admin/flash-sale?entry=${entry.id}`,
            metadata: {
              entryId: entry.id,
              campaignId,
              productId,
              sellerId,
              status: entry.status,
            },
          }),
        ),
      );

      await deleteCacheByPrefix("flash-sale:");
      res.json({ success: true, entry: serializeFlashSaleEntry(entry) });
    } catch (error) {
      res.status(500).json({ error: "Failed to submit flash sale product" });
    }
  });

  app.get("/api/seller/orders", authenticateToken, requireRole("seller"), async (req: any, res) => {
    const orders = await prisma.order.findMany({
      where: {
        items: {
          some: {
            product: {
              sellerId: String(req.user.id),
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      include: {
        shipments: {
          where: { sellerId: String(req.user.id) },
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

  app.get("/api/seller/manual-orders/catalog", authenticateToken, requireRole("seller"), async (req: any, res) => {
    try {
      const products = await loadManualOrderCatalogForRole("seller", String(req.user.id));
      const categories = [...new Set(products.map((product: any) => String(product.category || "Uncategorized")))];
      res.json({ products, categories });
    } catch (error) {
      res.status(500).json({ error: "Failed to load seller manual order catalog" });
    }
  });

  app.get("/api/seller/manual-orders", authenticateToken, requireRole("seller"), async (req: any, res) => {
    try {
      const orders = await loadRecentManualOrdersForSeller(prisma, String(req.user.id));
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to load seller manual orders" });
    }
  });

  app.patch("/api/seller/manual-orders/:id", authenticateToken, requireRole("seller"), async (req: any, res) => {
    try {
      const order = await updateManualMarketplaceOrder({
        role: "seller",
        userId: String(req.user.id),
        orderId: String(req.params.id),
        payload: req.body,
      });
      await createNotification({
        userId: String(req.user.id),
        tenantId: req.user.tenantId ?? null,
        type: "order_update",
        title: "Manual order updated",
        message: `Manual order ${order.order_code || order.id} was updated successfully.`,
        actionUrl: `/seller/manual-orders`,
        metadata: { orderId: order.id, orderCode: order.order_code ?? null },
      });
      res.json(order);
    } catch (error: any) {
      const message = String(error?.message || "Failed to update manual order");
      res.status(message.includes("not found") ? 404 : 400).json({ error: message });
    }
  });

  app.post("/api/seller/manual-orders/:id/cancel", authenticateToken, requireRole("seller"), async (req: any, res) => {
    try {
      const order = await cancelManualMarketplaceOrder({
        role: "seller",
        userId: String(req.user.id),
        orderId: String(req.params.id),
      });
      await createNotification({
        userId: String(req.user.id),
        tenantId: req.user.tenantId ?? null,
        type: "order_update",
        title: "Manual order cancelled",
        message: `Manual order ${order.order_code || order.id} was cancelled and stock was restored.`,
        actionUrl: `/seller/manual-orders`,
        metadata: { orderId: order.id, orderCode: order.order_code ?? null },
      });
      res.json(order);
    } catch (error: any) {
      const message = String(error?.message || "Failed to cancel manual order");
      res.status(message.includes("not found") ? 404 : 400).json({ error: message });
    }
  });

  app.post("/api/seller/manual-orders", authenticateToken, requireRole("seller"), async (req: any, res) => {
    try {
      const order = await createManualMarketplaceOrder({
        role: "seller",
        creator: {
          id: String(req.user.id),
          name: req.user.name ?? null,
          tenantId: req.user.tenantId ?? null,
        },
        payload: req.body,
      });

      await createNotification({
        userId: String(req.user.id),
        tenantId: req.user.tenantId ?? null,
        type: "order_update",
        title: "Manual order created",
        message: `Manual order ${order.orderCode || order.id} has been created successfully.`,
        actionUrl: `/seller/orders?search=${encodeURIComponent(order.orderCode || order.id)}`,
        metadata: {
          orderId: order.id,
          orderCode: order.orderCode ?? null,
          manualOrder: true,
        },
      });

      res.json({ success: true, orderId: order.id, orderCode: order.orderCode ?? null });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || "Failed to create seller manual order" });
    }
  });

  app.get("/api/seller/shipments", authenticateToken, requireRole("seller"), async (req: any, res) => {
    const shipments = await prisma.orderShipment.findMany({
      where: { sellerId: String(req.user.id) },
      orderBy: { createdAt: "desc" },
      include: {
        warehouse: {
          select: {
            id: true,
            name: true,
            city: true,
          },
        },
        order: {
          select: {
            createdAt: true,
            paymentMethod: true,
            shippingAddress: true,
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
    });

    res.json(
      shipments.map((shipment: any) => ({
        ...serializeOrderShipment(shipment),
        order_created_at: shipment.order.createdAt.toISOString(),
        shipping_address: shipment.order.shippingAddress ?? null,
        payment_method: shipment.order.paymentMethod ?? null,
      })),
    );
  });

  app.get("/api/seller/logistics/pathao-readiness", authenticateToken, requireRole("seller"), async (req: any, res) => {
    const sellerId = String(req.user.id);

    const [warehouses, shipments] = await Promise.all([
      prisma.warehouse.findMany({
        where: { managerId: sellerId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.orderShipment.findMany({
        where: {
          sellerId,
          status: {
            in: ["processing", "packed", "ready_for_pickup", "pickup_requested", "picked_up", "in_transit", "out_for_delivery"],
          },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          warehouse: {
            select: {
              id: true,
              name: true,
              phone: true,
              contactName: true,
              pathaoStoreId: true,
              pathaoCityId: true,
              pathaoZoneId: true,
              pathaoAreaId: true,
            },
          },
          order: {
            select: {
              shippingAddress: true,
            },
          },
        },
      }),
    ]);

    const warehouseBlockers = warehouses
      .map((warehouse: any) => {
        const blockers: string[] = [];
        if (!warehouse.pathaoCityId || !warehouse.pathaoZoneId || !warehouse.pathaoAreaId) {
          blockers.push("Pathao area mapping missing");
        }
        if (!warehouse.pathaoStoreId) {
          blockers.push("Pathao store not linked");
        }
        if (!normalizeBangladeshPhone(warehouse.phone)) {
          blockers.push("Valid 11-digit warehouse phone missing");
        }
        if (!warehouse.contactName?.trim()) {
          blockers.push("Warehouse contact name missing");
        }

        return {
          id: warehouse.id,
          name: warehouse.name,
          blockers,
        };
      })
      .filter((warehouse: any) => warehouse.blockers.length > 0)
      .slice(0, 8);

    const bookingCandidates = shipments.map((shipment: any) => {
      const shippingAddress =
        shipment.order.shippingAddress && typeof shipment.order.shippingAddress === "object"
          ? (shipment.order.shippingAddress as Record<string, unknown>)
          : {};
      const blockers: string[] = [];
      const recipientPhone = normalizeBangladeshPhone(typeof shippingAddress.phone === "string" ? shippingAddress.phone : null);
      const recipientAddress = typeof shippingAddress.address === "string" ? shippingAddress.address.trim() : "";
      const warehouse = shipment.warehouse;

      if (!warehouse) {
        blockers.push("Shipment warehouse missing");
      } else {
        if (!warehouse.pathaoStoreId) blockers.push("Warehouse store link missing");
        if (!warehouse.pathaoCityId || !warehouse.pathaoZoneId || !warehouse.pathaoAreaId) blockers.push("Warehouse Pathao mapping missing");
        if (!normalizeBangladeshPhone(warehouse.phone)) blockers.push("Warehouse phone invalid");
        if (!warehouse.contactName?.trim()) blockers.push("Warehouse contact name missing");
      }

      if (!recipientPhone) blockers.push("Recipient phone invalid");
      if (recipientAddress.length < 10) blockers.push("Recipient address too short");

      return {
        id: shipment.id,
        order_id: shipment.orderId,
        warehouse_id: warehouse?.id ?? null,
        warehouse_name: warehouse?.name ?? null,
        courier_provider: shipment.courierProvider ?? null,
        tracking_id: shipment.trackingId ?? null,
        status: shipment.status,
        blockers,
      };
    });

    res.json({
      updatedAt: new Date().toISOString(),
      envReady: ["PATHAO_BASE_URL", "PATHAO_CLIENT_ID", "PATHAO_CLIENT_SECRET", "PATHAO_USERNAME", "PATHAO_PASSWORD"].every(
        (key) => Boolean(process.env[key]),
      ),
      warehouseBlockers,
      bookingCandidates,
    });
  });

  app.post("/api/seller/courier/bookings", authenticateToken, requireRole("seller"), async (req: any, res) => {
    const sellerId = String(req.user.id);

    const seller = await prisma.user.findUnique({
      where: { id: sellerId },
      select: { sellerStatus: true },
    });
    if (!isSellerApproved(seller?.sellerStatus)) {
      return res.status(403).json({ error: getSellerApprovalBlockedMessage("courier_booking", seller?.sellerStatus) });
    }
    const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId : '';
    const shipmentId = typeof req.body?.shipmentId === 'string' ? req.body.shipmentId : '';
    const providerCode = typeof req.body?.providerCode === 'string' ? req.body.providerCode : '';

    if ((!orderId && !shipmentId) || !providerCode) {
      return res.status(400).json({ error: 'shipmentId or orderId and providerCode are required' });
    }

    if (!(await isCourierProviderEnabled(providerCode))) {
      const commerceChannels = await getCommerceChannelSettings();
      return res.status(400).json({
        error: `Only ${commerceChannels.courierProviders.map((code) => code.toUpperCase()).join(', ')} courier booking is enabled right now.`,
      });
    }

    try {
      const shipment = shipmentId
        ? await prisma.orderShipment.findFirst({
            where: {
              id: shipmentId,
              sellerId,
            },
            include: {
              order: {
                select: {
                  id: true,
                  userId: true,
                  tenantId: true,
                  total: true,
                  paymentMethod: true,
                  shippingAddress: true,
                },
              },
              warehouse: {
                select: {
                  id: true,
                  name: true,
                  city: true,
                  address: true,
                  phone: true,
                  contactName: true,
                  secondaryContact: true,
                  otpNumber: true,
                  pathaoStoreId: true,
                  pathaoCityId: true,
                  pathaoZoneId: true,
                  pathaoAreaId: true,
                },
              },
              items: {
                include: {
                  product: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          })
        : await prisma.orderShipment.findFirst({
            where: {
              orderId,
              sellerId,
            },
            include: {
              order: {
                select: {
                  id: true,
                  userId: true,
                  tenantId: true,
                  total: true,
                  paymentMethod: true,
                  shippingAddress: true,
                },
              },
              warehouse: {
                select: {
                  id: true,
                  name: true,
                  city: true,
                  address: true,
                  phone: true,
                  contactName: true,
                  secondaryContact: true,
                  otpNumber: true,
                  pathaoStoreId: true,
                  pathaoCityId: true,
                  pathaoZoneId: true,
                  pathaoAreaId: true,
                },
              },
              items: {
                include: {
                  product: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          });

      if (!shipment) {
        return res.status(404).json({ error: 'Seller shipment not found' });
      }

      let shippingAddress: Record<string, unknown> = {};
      if (shipment.order.shippingAddress && typeof shipment.order.shippingAddress === 'object') {
        shippingAddress = shipment.order.shippingAddress as Record<string, unknown>;
      }

      const booking = await logisticsModule.bookShipment({
        orderId: shipment.order.id,
        shipmentId: shipment.id,
        providerCode,
        merchantReference: `ASB-${shipment.order.id}-${shipment.id.slice(0, 8)}`,
        customer: {
          name: String(shippingAddress.name || shippingAddress.fullName || 'Customer'),
          phone: typeof shippingAddress.phone === 'string' ? shippingAddress.phone : null,
          secondaryPhone: typeof shippingAddress.secondaryPhone === 'string' ? shippingAddress.secondaryPhone : null,
          city: typeof shippingAddress.city === 'string' ? shippingAddress.city : null,
          address: typeof shippingAddress.address === 'string' ? shippingAddress.address : null,
          cityId: Number.isFinite(Number(shippingAddress.cityId)) ? Number(shippingAddress.cityId) : null,
          zoneId: Number.isFinite(Number(shippingAddress.zoneId)) ? Number(shippingAddress.zoneId) : null,
          areaId: Number.isFinite(Number(shippingAddress.areaId)) ? Number(shippingAddress.areaId) : null,
        },
        amount: Number(shipment.total),
        codAmount: shipment.order.paymentMethod === 'cod' ? Number(shipment.total) : 0,
        pickupLocation: shipment.warehouse
          ? {
              warehouseId: shipment.warehouse.id,
              name: shipment.warehouse.name,
              contactName: shipment.warehouse.contactName ?? shipment.warehouse.name,
              phone: shipment.warehouse.phone ?? null,
              secondaryContact: shipment.warehouse.secondaryContact ?? null,
              otpNumber: shipment.warehouse.otpNumber ?? null,
              address: shipment.warehouse.address,
              city: shipment.warehouse.city,
              storeId: shipment.warehouse.pathaoStoreId ?? null,
              cityId: shipment.warehouse.pathaoCityId ?? null,
              zoneId: shipment.warehouse.pathaoZoneId ?? null,
              areaId: shipment.warehouse.pathaoAreaId ?? null,
            }
          : null,
        parcel: {
          quantity: Math.max(1, Number(shipment.itemCount || shipment.items?.length || 1)),
          weightKg: Math.min(10, Math.max(0.5, Number((shipment.itemCount || 1) * 0.5))),
          deliveryType: 48,
          itemType: 2,
          description:
            Array.isArray(shipment.items) && shipment.items.length > 0
              ? shipment.items.map((item: any) => item.product?.name || 'Product').join(', ')
              : `Marketplace shipment ${shipment.id.slice(0, 8)}`,
          specialInstruction: `Pickup shipment ${shipment.id.slice(0, 8)} from ${shipment.warehouse?.name || 'seller location'}.`,
        },
      });

      const bookingMetadata =
        booking.metadata && typeof booking.metadata === 'object'
          ? (booking.metadata as Record<string, unknown>)
          : null;

      const updatedShipment: any = await prisma.orderShipment.update({
        where: { id: shipment.id },
        data: {
          status: 'pickup_requested',
          courierProvider: booking.providerName,
          trackingId: booking.trackingId,
          pickupRequestedAt: new Date(),
          shipmentMetadata: {
            bookingMode: booking.bookingMode,
            providerCode: booking.providerCode,
            notes: booking.notes ?? null,
            providerPayload: bookingMetadata,
            bookingReference:
              bookingMetadata && typeof bookingMetadata.bookingReference === 'string'
                ? bookingMetadata.bookingReference
                : null,
            consignmentId:
              bookingMetadata && (
                typeof bookingMetadata.consignmentId === 'string' ||
                typeof bookingMetadata.consignmentId === 'number'
              )
                ? String(bookingMetadata.consignmentId)
                : null,
            invoice:
              bookingMetadata && typeof bookingMetadata.invoice === 'string'
                ? bookingMetadata.invoice
                : null,
            pickupLocation: shipment.warehouse
              ? {
                  id: shipment.warehouse.id,
                  name: shipment.warehouse.name,
                  city: shipment.warehouse.city,
                  address: shipment.warehouse.address,
                }
              : null,
          },
        } as any,
        include: {
          warehouse: {
            select: {
              id: true,
              name: true,
              city: true,
            },
          },
        },
      });

      await createNotification({
        userId: shipment.order.userId,
        tenantId: shipment.order.tenantId ?? null,
        type: 'order_update',
        title: 'Courier pickup requested',
        message: `Courier pickup has been requested for shipment ${shipment.id.slice(0, 8)} of order ${shipment.order.id}. Tracking ID: ${booking.trackingId}.`,
        actionUrl: `/account/orders/${shipment.order.id}?shipment=${shipment.id}`,
        metadata: {
          orderId: shipment.order.id,
          shipmentId: shipment.id,
          status: updatedShipment.status,
          courierProvider: booking.providerName,
          trackingId: booking.trackingId,
        },
      });

      res.json({
        success: true,
        booking,
        shipment: serializeOrderShipment(updatedShipment),
      });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to create courier booking' });
    }
  });

  app.patch("/api/seller/settings", authenticateToken, requireRole("seller"), async (req: any, res) => {
    const { storeName, storeDescription } = req.body;
    const userId = req.user.id;

    try {
      await prisma.user.update({
        where: { id: String(userId) },
        data: { name: storeName },
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update seller settings" });
    }
  });

  app.get("/api/seller/storefront-settings", authenticateToken, requireRole("seller"), async (req: any, res) => {
    try {
      const seller = await prisma.user.findUnique({
        where: { id: String(req.user.id) },
        select: {
          id: true,
          name: true,
          bio: true,
          storeName: true,
          storefrontSlug: true,
          storefrontBannerUrl: true,
          storefrontHeadline: true,
          storefrontAccentColor: true,
          storefrontCustomDomain: true,
          storefrontPublished: true,
          storefrontDomainStatus: true,
          storefrontDomainVerificationToken: true,
          storefrontDomainVerifiedAt: true,
          sellerStatus: true,
          submittedForReviewAt: true,
          approvedAt: true,
          rejectionReason: true,
          suspensionReason: true,
        },
      });

      if (!seller) {
        return res.status(404).json({ error: "Seller not found" });
      }

      res.json({
        store_name: seller.storeName || seller.name || "",
        bio: seller.bio || "",
        storefront_slug: seller.storefrontSlug || normalizeStorefrontSlug(seller.storeName || seller.name || "store"),
        storefront_banner_url: seller.storefrontBannerUrl || "",
        storefront_headline: seller.storefrontHeadline || "",
        storefront_accent_color: seller.storefrontAccentColor || "#0F766E",
        storefront_custom_domain: seller.storefrontCustomDomain || "",
        storefront_published: Boolean(seller.storefrontPublished ?? true),
        seller_status: normalizeSellerStatus(seller.sellerStatus),
        submitted_for_review_at: seller.submittedForReviewAt ? seller.submittedForReviewAt.toISOString() : null,
        approved_at: seller.approvedAt ? seller.approvedAt.toISOString() : null,
        rejection_reason: seller.rejectionReason ?? null,
        suspension_reason: seller.suspensionReason ?? null,
        domain_verification: buildStorefrontDomainVerificationPayload(
          seller.storefrontCustomDomain,
          seller.storefrontDomainVerificationToken,
          seller.storefrontDomainStatus,
          seller.storefrontDomainVerifiedAt,
        ),
      });
    } catch (error) {
      logServerError("load seller storefront settings", error, { userId: String(req.user.id) });
      res.status(500).json({ error: "Failed to load seller storefront settings" });
    }
  });

  app.patch("/api/seller/storefront-settings", authenticateToken, requireRole("seller"), async (req: any, res) => {
    const parsed = storefrontSettingsSchema.safeParse({
      storefront_slug: normalizeStorefrontSlug(String(req.body?.storefront_slug || "")),
      storefront_headline: req.body?.storefront_headline,
      storefront_banner_url: req.body?.storefront_banner_url,
      storefront_accent_color: typeof req.body?.storefront_accent_color === "string" ? req.body.storefront_accent_color.trim() : "",
      storefront_custom_domain: normalizeStorefrontDomain(req.body?.storefront_custom_domain) || "",
      storefront_published: Boolean(req.body?.storefront_published),
    });

    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid storefront settings payload" });
    }

    const userId = String(req.user.id);
    const payload = parsed.data;

    try {
      const conflictingSlug = await prisma.user.findFirst({
        where: {
          storefrontSlug: payload.storefront_slug,
          id: { not: userId },
        },
        select: { id: true },
      });

      if (conflictingSlug) {
        return res.status(409).json({ error: "This storefront slug is already in use." });
      }

      if (payload.storefront_custom_domain) {
        const conflictingDomain = await prisma.user.findFirst({
          where: {
            storefrontCustomDomain: payload.storefront_custom_domain,
            id: { not: userId },
          },
          select: { id: true },
        });

        if (conflictingDomain) {
          return res.status(409).json({ error: "This custom domain is already connected to another storefront." });
        }
      }

      const nextDomain = payload.storefront_custom_domain || null;
      const currentSeller = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          storefrontCustomDomain: true,
          storefrontDomainVerificationToken: true,
          sellerStatus: true,
        },
      });

      const domainChanged = normalizeStorefrontDomain(currentSeller?.storefrontCustomDomain) !== normalizeStorefrontDomain(nextDomain);
      const nextToken =
        nextDomain && (domainChanged || !currentSeller?.storefrontDomainVerificationToken)
          ? generateStorefrontDomainVerificationToken()
          : currentSeller?.storefrontDomainVerificationToken ?? null;

      const updatedSeller = await prisma.user.update({
        where: { id: userId },
        data: {
          storefrontSlug: payload.storefront_slug,
          storefrontHeadline: payload.storefront_headline || null,
          storefrontBannerUrl: payload.storefront_banner_url || null,
          storefrontAccentColor: payload.storefront_accent_color || "#0F766E",
          storefrontCustomDomain: nextDomain,
          storefrontPublished: canPublishSellerProduct(currentSeller?.sellerStatus) ? payload.storefront_published : false,
          storefrontDomainStatus: nextDomain ? "pending" : "unverified",
          storefrontDomainVerificationToken: nextDomain ? nextToken : null,
          storefrontDomainVerifiedAt: nextDomain ? null : null,
        },
      });

      await handleAuditLog(userId, "seller.storefront.updated", "user", userId, {
        storefront_slug: updatedSeller.storefrontSlug,
        storefront_published: updatedSeller.storefrontPublished,
        storefront_custom_domain: updatedSeller.storefrontCustomDomain,
      });

      res.json({
        success: true,
        storefront: {
          store_name: updatedSeller.storeName ?? null,
          storefront_slug: updatedSeller.storefrontSlug,
          storefront_banner_url: updatedSeller.storefrontBannerUrl,
          storefront_headline: updatedSeller.storefrontHeadline,
          storefront_accent_color: updatedSeller.storefrontAccentColor,
          storefront_custom_domain: updatedSeller.storefrontCustomDomain,
          storefront_published: updatedSeller.storefrontPublished,
          domain_verification: buildStorefrontDomainVerificationPayload(
            updatedSeller.storefrontCustomDomain,
            updatedSeller.storefrontDomainVerificationToken,
            updatedSeller.storefrontDomainStatus,
            updatedSeller.storefrontDomainVerifiedAt,
          ),
        },
      });
    } catch (error) {
      logServerError("update seller storefront settings", error, { userId });
      res.status(500).json({ error: "Failed to update seller storefront settings" });
      }
    });

  app.get("/api/seller/onboarding-status", authenticateToken, requireRole("seller"), async (req: any, res) => {
    const sellerId = String(req.user.id);

    try {
      const [seller, verificationSubmission, payoutMethodCount, warehouses] = await Promise.all([
        prisma.user.findUnique({
          where: { id: sellerId },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            emailVerified: true,
            phoneVerified: true,
            storeName: true,
            bio: true,
            storefrontSlug: true,
            storefrontHeadline: true,
            storefrontPublished: true,
            sellerStatus: true,
            submittedForReviewAt: true,
            approvedAt: true,
            rejectionReason: true,
            suspensionReason: true,
          },
        }),
        prisma.verificationSubmission.findUnique({
          where: { userId: sellerId },
          select: {
            id: true,
            status: true,
            submittedAt: true,
            rejectionReason: true,
          },
        }),
        prisma.payoutMethod.count({
          where: { userId: sellerId, status: 'active' },
        }),
        prisma.warehouse.findMany({
          where: { managerId: sellerId },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            phone: true,
            contactName: true,
            pathaoStoreId: true,
          },
        }),
      ]);

      if (!seller) {
        return res.status(404).json({ error: "Seller not found" });
      }

      const sellerStatus = normalizeSellerStatus(seller.sellerStatus);
      const hasVerifiedEmail = Boolean(seller.emailVerified);
      const hasVerifiedPhone = Boolean(seller.phoneVerified);
      const approvalState = buildSellerApprovalRequirementState({
        seller,
        verificationSubmission,
        payoutMethodCount,
        warehouses,
      });
      const hasStoreIdentity = approvalState.hasStoreIdentity;
      const hasStoreStory = approvalState.hasStoreStory;
      const pickupReady = approvalState.pickupReady;
      const courierLinked = warehouses.some((warehouse: any) => Boolean(warehouse.pathaoStoreId));
      const verificationSubmitted = Boolean(verificationSubmission);
      const verificationApproved = verificationSubmission?.status === "verified";
      const payoutReady = payoutMethodCount > 0;
      const storefrontPublished = Boolean(seller.storefrontPublished) && isSellerApproved(sellerStatus);

      const steps = [
        {
          id: 'account',
          title: 'Verify account',
          description: 'Confirm your email and phone so support, payout, and courier operations can trust your account.',
          completed: hasVerifiedEmail && hasVerifiedPhone,
          status: hasVerifiedEmail && hasVerifiedPhone
            ? 'Email and phone verified'
            : hasVerifiedEmail
              ? 'Email verified, phone pending'
              : 'Email verification pending',
          action_path: '/seller/settings?section=profile',
        },
        {
          id: 'storefront',
          title: 'Set up store identity',
          description: 'Add your store name, slug, and public story so your storefront feels complete and trustworthy.',
          completed: hasStoreIdentity && hasStoreStory,
          status: hasStoreIdentity
            ? hasStoreStory
              ? 'Store identity complete'
              : 'Add headline or bio'
            : 'Store name and slug missing',
          action_path: '/seller/onboarding#storefront',
        },
        {
          id: 'pickup',
          title: 'Add pickup location',
          description: 'Complete at least one pickup point so courier booking and seller logistics can start.',
          completed: pickupReady,
          status: warehouses.length === 0
            ? 'No pickup location added'
            : pickupReady
              ? `${warehouses.length} pickup point${warehouses.length === 1 ? '' : 's'} ready`
              : 'Pickup info incomplete',
          action_path: '/seller/pickup-locations',
        },
        {
          id: 'verification',
          title: 'Submit business verification',
          description: 'Upload your identity and business documents so admin can review and approve your seller account.',
          completed: verificationSubmitted,
          status: verificationApproved
            ? 'Verified'
            : verificationSubmission?.status === 'rejected'
              ? `Rejected${verificationSubmission.rejectionReason ? `: ${verificationSubmission.rejectionReason}` : ''}`
              : verificationSubmitted
                ? `Submitted${verificationSubmission?.submittedAt ? ` on ${new Date(verificationSubmission.submittedAt).toLocaleDateString()}` : ''}`
                : 'Not submitted',
          action_path: '/seller/settings?section=verification',
        },
        {
          id: 'payout',
          title: 'Add payout method',
          description: 'Set where your earnings should go so settlements do not get blocked later.',
          completed: payoutReady,
          status: payoutReady ? `${payoutMethodCount} payout method${payoutMethodCount === 1 ? '' : 's'} active` : 'No payout method added',
          action_path: '/seller/settings?section=payout',
        },
        {
          id: 'courier',
          title: 'Connect courier readiness',
          description: 'Link your pickup point with courier mapping so live bookings can start without ops delay.',
          completed: courierLinked,
          status: courierLinked ? 'Courier store linked' : 'Courier store not linked yet',
          action_path: '/seller/courier',
        },
        {
          id: 'publish',
          title: 'Publish storefront',
          description: 'Make your public storefront live after admin approval is complete.',
          completed: storefrontPublished,
          status: storefrontPublished
            ? 'Storefront is live'
            : isSellerApproved(sellerStatus)
              ? 'Storefront still private'
              : 'Locked until admin approval',
          action_path: '/seller/onboarding#storefront',
        },
      ];

      const completedSteps = steps.filter((step) => step.completed).length;
      const progressPercent = Math.round((completedSteps / steps.length) * 100);
      const nextStep = steps.find((step) => !step.completed) ?? null;

      res.json({
        seller: {
          id: seller.id,
          name: seller.name,
          email: seller.email,
          phone: seller.phone,
          store_name: seller.storeName,
          storefront_slug: seller.storefrontSlug,
          seller_status: sellerStatus,
          submitted_for_review_at: seller.submittedForReviewAt ? seller.submittedForReviewAt.toISOString() : null,
          approved_at: seller.approvedAt ? seller.approvedAt.toISOString() : null,
          rejection_reason: seller.rejectionReason ?? null,
          suspension_reason: seller.suspensionReason ?? null,
        },
        summary: {
          completed_steps: completedSteps,
          total_steps: steps.length,
          progress_percent: progressPercent,
          ready_for_live_booking: isSellerApproved(sellerStatus) && pickupReady && courierLinked,
          ready_for_admin_review: canSellerSubmitForReview(approvalState.requirements, sellerStatus),
          ready_for_payout: isSellerApproved(sellerStatus) && payoutReady,
          ready_for_storefront_publish: isSellerApproved(sellerStatus) && hasStoreIdentity && pickupReady,
        },
        steps,
        next_step: nextStep,
        pickups: {
          total: warehouses.length,
          linked_courier_store_count: warehouses.filter((warehouse: any) => warehouse.pathaoStoreId).length,
        },
        verification: verificationSubmission
          ? {
              status: verificationSubmission.status,
              rejection_reason: verificationSubmission.rejectionReason ?? null,
            }
          : null,
        approval: {
          status: sellerStatus,
          submitted_for_review_at: seller.submittedForReviewAt ? seller.submittedForReviewAt.toISOString() : null,
          approved_at: seller.approvedAt ? seller.approvedAt.toISOString() : null,
          rejection_reason: seller.rejectionReason ?? null,
          suspension_reason: seller.suspensionReason ?? null,
          requirements: approvalState.requirements,
          missing_requirements: approvalState.missingRequirements,
          can_submit_for_review: canSellerSubmitForReview(approvalState.requirements, sellerStatus),
        },
      });
    } catch (error) {
      logServerError("load seller onboarding status", error, { userId: sellerId });
      res.status(500).json({ error: "Failed to load seller onboarding status" });
    }
  });

  app.post("/api/seller/submit-for-review", authenticateToken, requireRole("seller"), async (req: any, res) => {
    const sellerId = String(req.user.id);

    try {
      const snapshot = await getSellerApprovalGuardSnapshot(prisma, sellerId);
      if (!snapshot) {
        return res.status(404).json({ error: "Seller not found." });
      }

      const sellerStatus = normalizeSellerStatus(snapshot.seller.sellerStatus);
      if (!canSellerSubmitForReview(snapshot.approval.requirements, sellerStatus)) {
        return res.status(400).json({
          error: "Complete all required onboarding steps before submitting for review.",
          missing_requirements: snapshot.approval.missingRequirements,
        });
      }

      const updatedSeller = await prisma.user.update({
        where: { id: sellerId },
        data: {
          sellerStatus: SELLER_STATUSES.pending_review,
          submittedForReviewAt: new Date(),
          approvedAt: null,
          approvedById: null,
          rejectionReason: null,
          suspensionReason: null,
          storefrontPublished: false,
        },
        select: {
          id: true,
          email: true,
          name: true,
          tenantId: true,
          sellerStatus: true,
          submittedForReviewAt: true,
        },
      });

      const admins = await getActiveAdminUsers();
      await Promise.all(
        admins.map((admin) =>
          createNotification({
            userId: admin.id,
            tenantId: updatedSeller.tenantId ?? null,
            createdById: sellerId,
            type: "account_action",
            title: "Seller submitted for approval",
            message: `${updatedSeller.name || updatedSeller.email || "A seller"} submitted their account for admin review.`,
            actionUrl: `/admin/sellers?seller=${encodeURIComponent(updatedSeller.id)}`,
            metadata: {
              sellerId: updatedSeller.id,
              sellerStatus: updatedSeller.sellerStatus,
            },
          }),
        ),
      );

      await handleAuditLog(sellerId, "seller.submitted_for_review", "user", sellerId, {
        seller_status: updatedSeller.sellerStatus,
      });

      res.json({
        success: true,
        seller_status: normalizeSellerStatus(updatedSeller.sellerStatus),
        submitted_for_review_at: updatedSeller.submittedForReviewAt?.toISOString() ?? null,
      });
    } catch (error) {
      logServerError("submit seller for review", error, { userId: sellerId });
      res.status(500).json({ error: "Failed to submit seller account for review." });
    }
  });

  app.get("/api/seller/earnings", authenticateToken, requireRole("seller"), async (req: any, res) => {
    const sellerId = String(req.user.id);
    const [orders, totalEarnings] = await Promise.all([
      prisma.order.findMany({
        where: {
          items: {
            some: {
              product: {
                sellerId,
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            where: {
              product: {
                sellerId,
              },
            },
          },
        },
      }),
      prisma.orderItem.aggregate({
        where: {
          product: { sellerId },
          order: { status: { not: 'cancelled' } },
        },
        _sum: { price: true },
      }),
    ]);

    const transactions = orders.map((order: any) => ({
      order_id: order.id,
      date: order.createdAt.toISOString(),
      amount: order.items.reduce((sum: any, item: any) => sum + (Number(item.price) * item.qty), 0),
      status: order.status,
    }));

    res.json({
      totalEarnings: toPlainNumber(totalEarnings._sum.price ?? 0),
      transactions
    });
  });

  app.get("/api/seller/stats", authenticateToken, requireRole("seller"), async (req: any, res) => {
    const sellerId = String(req.user.id);
    const [totalProducts, totalOrders, totalEarnings, topProducts] = await Promise.all([
      prisma.product.count({ where: { sellerId } }),
      prisma.order.count({
        where: {
          items: {
            some: {
              product: { sellerId },
            },
          },
        },
      }),
      prisma.orderItem.findMany({
        where: {
          product: { sellerId },
        },
        select: {
          qty: true,
          price: true,
          productId: true,
          product: {
            select: { id: true, name: true, image: true },
          },
        },
      }),
      prisma.product.findMany({
        where: { sellerId },
        include: {
          orderItems: {
            select: { qty: true, price: true },
          },
        },
        take: 20,
      }),
    ]);

    const topProductRows = topProducts
      .map((product: any) => ({
        id: product.id,
        name: product.name,
        image: product.image,
        sales: product.orderItems.reduce((sum: any, item: any) => sum + item.qty, 0),
        revenue: product.orderItems.reduce((sum: any, item: any) => sum + (Number(item.price) * item.qty), 0),
      }))
      .sort((a: any, b: any) => b.sales - a.sales)
      .slice(0, 5);

    res.json({
      totalProducts,
      totalOrders,
      totalEarnings: totalEarnings.reduce((sum: any, item: any) => sum + (Number(item.price) * item.qty), 0),
      topProducts: topProductRows
    });
  });

  app.get("/api/seller/dashboard-insights", authenticateToken, requireRole("seller"), async (req: any, res) => {
    const sellerId = String(req.user.id);
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [recentOrders, products, shipments] = await Promise.all([
      prisma.order.findMany({
        where: {
          createdAt: { gte: since },
          items: {
            some: {
              product: { sellerId },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            where: {
              product: { sellerId },
            },
          },
        },
        take: 12,
      }),
      prisma.product.findMany({
        where: { sellerId },
        orderBy: { stock: 'asc' },
        take: 30,
        select: {
          id: true,
          name: true,
          stock: true,
          inventoryItems: {
            select: {
              warehouseId: true,
              quantity: true,
              warehouse: {
                select: {
                  name: true,
                },
              },
            },
            orderBy: [{ quantity: 'desc' }],
          },
        },
      }),
      prisma.orderShipment.findMany({
        where: { sellerId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          order: {
            select: {
              createdAt: true,
            },
          },
        },
      }),
    ]);

    const salesSeries = buildHourlySeriesFromOrders(
      recentOrders.map((order: any) => ({
        createdAt: order.createdAt,
        total: order.items.reduce((sum: any, item: any) => sum + Number(item.price) * item.qty, 0),
      })),
      7,
    );

    const lowStockProducts = products
      .filter((product: any) => Number(product.stock) <= Number((env as any).LOW_STOCK_THRESHOLD))
      .slice(0, 5);

    res.json({
      salesSeries,
      lowStockProducts: lowStockProducts.map((product: any) => ({
        id: product.id,
        name: product.name,
        stock: product.stock,
        warehouse_name:
          product.inventoryItems.find((inventoryItem: any) => Number(inventoryItem.quantity) > 0)?.warehouse?.name ??
          product.inventoryItems[0]?.warehouse?.name ??
          null,
        warehouse_id:
          product.inventoryItems.find((inventoryItem: any) => Number(inventoryItem.quantity) > 0)?.warehouseId ??
          product.inventoryItems[0]?.warehouseId ??
          null,
      })),
      recentShipments: shipments.map((shipment: any) => ({
        id: shipment.id,
        order_id: shipment.orderId,
        created_at: shipment.order.createdAt.toISOString(),
        total: toPlainNumber(shipment.total),
        status: shipment.status,
      })),
      activeShipments: shipments.filter((shipment: any) =>
        ['processing', 'packed', 'ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery'].includes(shipment.status),
      ).length,
      deliveredShipments: shipments.filter((shipment: any) => shipment.status === 'delivered').length,
    });
  });
}
