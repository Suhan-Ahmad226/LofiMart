import type { RouteContext } from "./context.js";
import { getOrSetCache } from "../../features/shared/services/cache/store.js";
import { logisticsModule } from "../../modules/logistics/index.js";
import {
  getCommerceChannelSettings,
  isCourierProviderEnabled,
} from "../../features/shared/services/platform/commerceChannels.js";
import {
  calculatePathaoPrice,
  createPathaoBulkOrders,
  createPathaoOrder,
  createPathaoStore,
  getPathaoOrderInfo,
  getPathaoStoreInfo,
  getPathaoTokenDiagnostics,
  getPathaoWebhookIntegrationSecret,
  issuePathaoAccessToken,
  listPathaoAreas,
  listPathaoCities,
  listPathaoStores,
  listPathaoZones,
  refreshPathaoAccessToken,
} from "../../features/courier/services/pathaoClient.js";
import { getRedxOrderInfo } from "../../features/courier/services/redxApiAdapter.js";
import {
  createSteadfastBulkOrders,
  createSteadfastReturnRequest,
  getSteadfastBalance,
  getSteadfastOrderInfo,
  getSteadfastPayment,
  getSteadfastPayments,
  getSteadfastPoliceStations,
  getSteadfastReturnRequest,
  getSteadfastReturnRequests,
} from "../../features/courier/services/steadfastApiAdapter.js";
import {
  normalizeCourierStatus,
  normalizePathaoShipmentStatus,
  buildShipmentTimestampData,
  extractCourierWebhookDetails,
} from "./logisticsHelpers.js";
import { createNotification } from "../../features/admin/services/engagement/gamification.js";
import { serializeOrderShipment } from "./serializers.js";

export function registerLogisticsRoutes(ctx: RouteContext): void {
  const { app, authenticateToken, requireRole, prisma, env, syncResellerSettlementFromShipmentStatus } = ctx;

  app.get("/api/logistics/providers", async (req: any, res) => {
    const providers = logisticsModule.listProviders();
    const includeDisabled = String(req.query?.includeDisabled || '').toLowerCase() === 'true';

    if (includeDisabled) {
      const commerceChannels = await getCommerceChannelSettings();
      return res.json(
        providers.map((provider) => ({
          ...provider,
          enabled: commerceChannels.courierProviders.includes(provider.code as any),
        })),
      );
    }

    const commerceChannels = await getCommerceChannelSettings();
    res.json(
      providers.filter((provider) => commerceChannels.courierProviders.includes(provider.code as any)),
    );
  });

  app.get("/api/logistics/pathao/cities", authenticateToken, requireRole("admin", "seller"), async (_req: any, res) => {
    try {
      const payload = await getOrSetCache(
        "pathao:cities",
        async () => listPathaoCities(),
        60 * 60 * 6,
      );
      res.json(payload);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to load Pathao cities' });
    }
  });

  app.get("/api/logistics/pathao/cities/:cityId/zones", authenticateToken, requireRole("admin", "seller"), async (req: any, res) => {
    const cityId = Number(req.params.cityId);
    if (!Number.isFinite(cityId) || cityId <= 0) {
      return res.status(400).json({ error: 'Valid cityId is required' });
    }

    try {
      const payload = await getOrSetCache(
        `pathao:zones:${cityId}`,
        async () => listPathaoZones(cityId),
        60 * 60 * 6,
      );
      res.json(payload);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to load Pathao zones' });
    }
  });

  app.get("/api/logistics/pathao/zones/:zoneId/areas", authenticateToken, requireRole("admin", "seller"), async (req: any, res) => {
    const zoneId = Number(req.params.zoneId);
    if (!Number.isFinite(zoneId) || zoneId <= 0) {
      return res.status(400).json({ error: 'Valid zoneId is required' });
    }

    try {
      const payload = await getOrSetCache(
        `pathao:areas:${zoneId}`,
        async () => listPathaoAreas(zoneId),
        60 * 60 * 6,
      );
      res.json(payload);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to load Pathao areas' });
    }
  });

  app.get("/api/logistics/pathao/stores", authenticateToken, requireRole("admin", "seller"), async (_req: any, res) => {
    try {
      const payload = await listPathaoStores();
      res.json(payload);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to load Pathao stores' });
    }
  });

  app.get("/api/logistics/pathao/stores/:storeId", authenticateToken, requireRole("admin", "seller"), async (req: any, res) => {
    const storeId = Number(req.params.storeId);
    if (!Number.isFinite(storeId) || storeId <= 0) {
      return res.status(400).json({ error: 'Valid storeId is required' });
    }

    try {
      const store = await getPathaoStoreInfo(storeId);
      if (!store) {
        return res.status(404).json({ error: 'Pathao store not found' });
      }
      res.json({ success: true, store });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to load Pathao store info' });
    }
  });

  app.get("/api/logistics/pathao/token", authenticateToken, requireRole("admin"), async (_req: any, res) => {
    try {
      const diagnostics = await getPathaoTokenDiagnostics();
      res.json({ success: true, diagnostics });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to load Pathao token diagnostics' });
    }
  });

  app.post("/api/logistics/pathao/token/issue", authenticateToken, requireRole("admin"), async (req: any, res) => {
    const grantType = req.body?.grant_type === 'refresh_token' ? 'refresh_token' : 'password';
    const refreshToken = typeof req.body?.refresh_token === 'string' ? req.body.refresh_token.trim() : null;

    try {
      const tokenBundle =
        grantType === 'refresh_token'
          ? await issuePathaoAccessToken({ mode: 'refresh_token', refreshToken, force: true })
          : await issuePathaoAccessToken({ mode: 'password', force: true });

      res.json({
        success: true,
        token_type: tokenBundle.tokenType,
        access_token: tokenBundle.accessToken,
        refresh_token: tokenBundle.refreshToken ?? null,
        expires_in: tokenBundle.expiresIn,
        issued_at: new Date(tokenBundle.issuedAt).toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to issue Pathao access token' });
    }
  });

  app.post("/api/logistics/pathao/token/refresh", authenticateToken, requireRole("admin"), async (_req: any, res) => {
    try {
      const tokenBundle = await refreshPathaoAccessToken();
      res.json({
        success: true,
        token_type: tokenBundle.tokenType,
        access_token: tokenBundle.accessToken,
        refresh_token: tokenBundle.refreshToken ?? null,
        expires_in: tokenBundle.expiresIn,
        issued_at: new Date(tokenBundle.issuedAt).toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to refresh Pathao access token' });
    }
  });

  app.post("/api/logistics/pathao/stores", authenticateToken, requireRole("admin", "seller"), async (req: any, res) => {
    const warehouseId = typeof req.body?.warehouseId === 'string' ? req.body.warehouseId.trim() : '';

    try {
      if (warehouseId) {
        const warehouse = await prisma.warehouse.findUnique({
          where: { id: warehouseId },
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
            contactName: true,
            secondaryContact: true,
            otpNumber: true,
            pathaoCityId: true,
            pathaoZoneId: true,
            pathaoAreaId: true,
          },
        });

        if (!warehouse) {
          return res.status(404).json({ error: 'Warehouse not found' });
        }

        if (!warehouse.pathaoCityId || !warehouse.pathaoZoneId || !warehouse.pathaoAreaId) {
          return res.status(400).json({ error: 'Warehouse is missing Pathao city, zone, or area mapping' });
        }

        const payload = {
          name: warehouse.name,
          contact_name: warehouse.contactName || warehouse.name,
          contact_number: String(warehouse.phone || '').trim(),
          secondary_contact: warehouse.secondaryContact || undefined,
          otp_number: warehouse.otpNumber || undefined,
          address: warehouse.address,
          city_id: warehouse.pathaoCityId,
          zone_id: warehouse.pathaoZoneId,
          area_id: warehouse.pathaoAreaId,
        };

        const created = await createPathaoStore(payload);
        const stores = await listPathaoStores();
        const items = Array.isArray((stores as any)?.data?.data) ? (stores as any).data.data : [];
        const matched = [...items].reverse().find((item: any) => String(item?.store_name || '').trim().toLowerCase() === warehouse.name.trim().toLowerCase());
        const storeId = Number(matched?.store_id || 0);

        if (storeId) {
          await prisma.warehouse.update({
            where: { id: warehouse.id },
            data: { pathaoStoreId: storeId },
          });
        }

        return res.json({ success: true, store: created, store_id: storeId || null });
      }

      const created = await createPathaoStore(req.body || {});
      res.json({ success: true, store: created });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to create Pathao store' });
    }
  });

  app.post("/api/logistics/pathao/orders", authenticateToken, requireRole("admin", "seller"), async (req: any, res) => {
    const payload = req.body || {};
    const storeId = Number(payload.store_id);
    const itemQuantity = Number(payload.item_quantity);
    const amountToCollect = Number(payload.amount_to_collect);
    const deliveryType = Number(payload.delivery_type);
    const itemType = Number(payload.item_type);

    if (!Number.isFinite(storeId) || storeId <= 0) {
      return res.status(400).json({ error: 'store_id is required' });
    }
    if (typeof payload.recipient_name !== 'string' || payload.recipient_name.trim().length < 3) {
      return res.status(400).json({ error: 'recipient_name is required' });
    }
    if (typeof payload.recipient_phone !== 'string' || payload.recipient_phone.trim().length < 11) {
      return res.status(400).json({ error: 'recipient_phone is required' });
    }
    if (typeof payload.recipient_address !== 'string' || payload.recipient_address.trim().length < 10) {
      return res.status(400).json({ error: 'recipient_address is required' });
    }
    if (!Number.isFinite(itemQuantity) || itemQuantity <= 0) {
      return res.status(400).json({ error: 'item_quantity must be greater than 0' });
    }
    if (!Number.isFinite(amountToCollect) || amountToCollect < 0) {
      return res.status(400).json({ error: 'amount_to_collect must be 0 or greater' });
    }
    if (![12, 48].includes(deliveryType)) {
      return res.status(400).json({ error: 'delivery_type must be 12 or 48' });
    }
    if (![1, 2].includes(itemType)) {
      return res.status(400).json({ error: 'item_type must be 1 or 2' });
    }

    try {
      const response = await createPathaoOrder({
        store_id: storeId,
        merchant_order_id: typeof payload.merchant_order_id === 'string' ? payload.merchant_order_id : undefined,
        recipient_name: payload.recipient_name,
        recipient_phone: payload.recipient_phone,
        recipient_secondary_phone: typeof payload.recipient_secondary_phone === 'string' ? payload.recipient_secondary_phone : undefined,
        recipient_address: payload.recipient_address,
        recipient_city: Number.isFinite(Number(payload.recipient_city)) && Number(payload.recipient_city) > 0 ? Number(payload.recipient_city) : undefined,
        recipient_zone: Number.isFinite(Number(payload.recipient_zone)) && Number(payload.recipient_zone) > 0 ? Number(payload.recipient_zone) : undefined,
        recipient_area: Number.isFinite(Number(payload.recipient_area)) && Number(payload.recipient_area) > 0 ? Number(payload.recipient_area) : undefined,
        delivery_type: deliveryType as 12 | 48,
        item_type: itemType as 1 | 2,
        special_instruction: typeof payload.special_instruction === 'string' ? payload.special_instruction : undefined,
        item_quantity: itemQuantity,
        item_weight: payload.item_weight ?? 0.5,
        item_description: typeof payload.item_description === 'string' ? payload.item_description : undefined,
        amount_to_collect: amountToCollect,
      });
      res.json(response);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to create Pathao order' });
    }
  });

  app.post("/api/logistics/pathao/price", authenticateToken, requireRole("admin", "seller"), async (req: any, res) => {
    const payload = {
      store_id: Number(req.body?.store_id),
      item_type: Number(req.body?.item_type || 2) as 1 | 2,
      delivery_type: Number(req.body?.delivery_type || 48) as 12 | 48,
      item_weight: Number(req.body?.item_weight || 0.5),
      recipient_city: Number(req.body?.recipient_city),
      recipient_zone: Number(req.body?.recipient_zone),
    };

    if (!Number.isFinite(payload.store_id) || !Number.isFinite(payload.recipient_city) || !Number.isFinite(payload.recipient_zone)) {
      return res.status(400).json({ error: 'store_id, recipient_city, and recipient_zone are required' });
    }

    try {
      const response = await calculatePathaoPrice(payload);
      res.json(response);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to calculate Pathao delivery price' });
    }
  });

  app.post("/api/logistics/pathao/orders/bulk", authenticateToken, requireRole("admin", "seller"), async (req: any, res) => {
    const orders = Array.isArray(req.body?.orders) ? req.body.orders : [];
    if (orders.length === 0) {
      return res.status(400).json({ error: 'At least one order payload is required' });
    }

    try {
      const response = await createPathaoBulkOrders(orders);
      res.json(response);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to create Pathao bulk orders' });
    }
  });

  app.post("/api/logistics/pathao/shipments/:shipmentId/sync", authenticateToken, requireRole("admin", "seller"), async (req: any, res) => {
    const shipmentId = String(req.params.shipmentId || '').trim();
    if (!shipmentId) {
      return res.status(400).json({ error: 'shipmentId is required' });
    }

    try {
      const shipment = await prisma.orderShipment.findFirst({
        where:
          req.user.role === 'admin'
            ? { id: shipmentId }
            : {
                id: shipmentId,
                sellerId: String(req.user.id),
              },
        include: {
          order: {
            select: {
              id: true,
              userId: true,
              tenantId: true,
            },
          },
        },
      });

      if (!shipment) {
        return res.status(404).json({ error: 'Shipment not found' });
      }

      if (!shipment.trackingId) {
        return res.status(400).json({ error: 'Shipment has no Pathao tracking ID yet' });
      }

      const pathaoPayload = await getPathaoOrderInfo(shipment.trackingId);
      const pathaoData = (pathaoPayload as any)?.data ?? {};
      const rawStatus = pathaoData?.order_status_slug ?? pathaoData?.order_status ?? pathaoData?.status ?? null;
      const normalizedStatus = normalizePathaoShipmentStatus(pathaoData?.event ?? null, rawStatus) || shipment.status;

      const mergedMetadata =
        shipment.shipmentMetadata && typeof shipment.shipmentMetadata === 'object'
          ? { ...(shipment.shipmentMetadata as Record<string, unknown>) }
          : {};

      const timestampData = buildShipmentTimestampData(normalizedStatus, shipment);

      const updatedShipment = await prisma.orderShipment.update({
        where: { id: shipment.id },
        data: {
          status: normalizedStatus,
          ...timestampData,
          shipmentMetadata: {
            ...mergedMetadata,
            pathaoLastSyncAt: new Date().toISOString(),
            pathaoLastEvent: pathaoData?.event ?? null,
            pathaoLastStatusSlug: pathaoData?.order_status_slug ?? pathaoData?.order_status ?? pathaoData?.status ?? null,
            pathaoLastOrderInfo: pathaoPayload,
          },
        } as any,
      });

      if (normalizedStatus !== shipment.status) {
        await createNotification({
          userId: shipment.order.userId,
          tenantId: shipment.order.tenantId ?? null,
          type: 'order_update',
          title: 'Shipment status refreshed',
          message: `Shipment ${shipment.id.slice(0, 8)} is now ${normalizedStatus.replaceAll('_', ' ')} after Pathao sync.`,
          actionUrl: `/account/orders/${shipment.order.id}?shipment=${shipment.id}`,
          metadata: {
            orderId: shipment.order.id,
            shipmentId: shipment.id,
            status: normalizedStatus,
            courierProvider: shipment.courierProvider,
            trackingId: shipment.trackingId,
          },
        });
      }

      await syncResellerSettlementFromShipmentStatus(shipment.order.id, normalizedStatus);

      res.json({
        success: true,
        shipment: serializeOrderShipment(updatedShipment),
        providerPayload: pathaoPayload,
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to sync Pathao shipment status' });
    }
  });

  app.get("/api/logistics/pathao/orders/:consignmentId/info", authenticateToken, requireRole("admin", "seller"), async (req: any, res) => {
    const consignmentId = String(req.params.consignmentId || '').trim();
    if (!consignmentId) {
      return res.status(400).json({ error: 'consignmentId is required' });
    }

    try {
      const response = await getPathaoOrderInfo(consignmentId);
      res.json(response);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to load Pathao order info' });
    }
  });

  app.post("/api/logistics/redx/shipments/:shipmentId/sync", authenticateToken, requireRole("admin", "seller"), async (req: any, res) => {
    const shipment = await prisma.orderShipment.findUnique({
      where: { id: req.params.shipmentId },
      include: {
        order: {
          select: {
            id: true,
            userId: true,
            tenantId: true,
          },
        },
      },
    });

    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    if (req.user.role === 'seller') {
      const sellerWarehouse = shipment.warehouseId
        ? await prisma.warehouse.findFirst({
            where: {
              id: shipment.warehouseId,
              managerId: String(req.user.id),
            },
            select: { id: true },
          })
        : null;

      if (!sellerWarehouse) {
        return res.status(403).json({ error: 'You do not have access to this shipment' });
      }
    }

    if (!shipment.trackingId) {
      return res.status(400).json({ error: 'This shipment does not have a RedX tracking ID yet.' });
    }

    try {
      const redxInfo = await getRedxOrderInfo(shipment.trackingId);
      const normalizedStatus = normalizeCourierStatus(redxInfo.rawStatus) || shipment.status;
      const mergedMetadata =
        shipment.shipmentMetadata && typeof shipment.shipmentMetadata === 'object'
          ? { ...(shipment.shipmentMetadata as Record<string, unknown>) }
          : {};

      const timestampData: Record<string, unknown> = {};
      if (normalizedStatus === 'picked_up') timestampData.pickedUpAt = shipment.pickedUpAt ?? new Date();
      if (normalizedStatus === 'out_for_delivery') timestampData.outForDeliveryAt = shipment.outForDeliveryAt ?? new Date();
      if (normalizedStatus === 'delivered') timestampData.deliveredAt = shipment.deliveredAt ?? new Date();

      const updatedShipment = await prisma.orderShipment.update({
        where: { id: shipment.id },
        data: {
          status: normalizedStatus,
          trackingId: redxInfo.trackingId || shipment.trackingId,
          ...timestampData,
          shipmentMetadata: {
            ...mergedMetadata,
            redxLastSyncAt: new Date().toISOString(),
            redxLastOrderInfo: redxInfo.payload,
          },
        } as any,
      });

      if (normalizedStatus !== shipment.status) {
        await createNotification({
          userId: shipment.order.userId,
          tenantId: shipment.order.tenantId ?? null,
          type: 'order_update',
          title: 'Shipment status refreshed',
          message: `Shipment ${shipment.id.slice(0, 8)} is now ${normalizedStatus.replaceAll('_', ' ')} after RedX sync.`,
          actionUrl: `/account/orders/${shipment.order.id}?shipment=${shipment.id}`,
          metadata: {
            orderId: shipment.order.id,
            shipmentId: shipment.id,
            status: normalizedStatus,
            courierProvider: shipment.courierProvider,
            trackingId: updatedShipment.trackingId,
          },
        });
      }

      await syncResellerSettlementFromShipmentStatus(shipment.order.id, normalizedStatus);

      res.json({
        success: true,
        shipment: serializeOrderShipment(updatedShipment),
        providerPayload: redxInfo.payload,
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to sync RedX shipment status' });
    }
  });

  app.post("/api/logistics/steadfast/shipments/:shipmentId/sync", authenticateToken, requireRole("admin", "seller"), async (req: any, res) => {
    const shipmentId = String(req.params.shipmentId || "");
    const shipment = await prisma.orderShipment.findFirst({
      where: {
        id: shipmentId,
        ...(req.user.role === 'seller' ? { sellerId: String(req.user.id) } : {}),
      },
      include: {
        order: {
          select: {
            id: true,
            userId: true,
            tenantId: true,
          },
        },
      },
    });

    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    if (!shipment.trackingId) {
      return res.status(400).json({ error: 'This shipment does not have a Steadfast tracking code yet.' });
    }

    try {
      const steadfastInfo = await getSteadfastOrderInfo(shipment.trackingId);
      const normalizedStatus = normalizeCourierStatus(steadfastInfo.rawStatus) || shipment.status;
      const mergedMetadata =
        shipment.shipmentMetadata && typeof shipment.shipmentMetadata === 'object'
          ? { ...(shipment.shipmentMetadata as Record<string, unknown>) }
          : {};

      const timestampData: Record<string, unknown> = {};
      if (normalizedStatus === 'picked_up') timestampData.pickedUpAt = shipment.pickedUpAt ?? new Date();
      if (normalizedStatus === 'out_for_delivery') timestampData.outForDeliveryAt = shipment.outForDeliveryAt ?? new Date();
      if (normalizedStatus === 'delivered') timestampData.deliveredAt = shipment.deliveredAt ?? new Date();

      const updatedShipment = await prisma.orderShipment.update({
        where: { id: shipment.id },
        data: {
          status: normalizedStatus,
          trackingId: steadfastInfo.trackingId || shipment.trackingId,
          ...timestampData,
          shipmentMetadata: {
            ...mergedMetadata,
            steadfastLastSyncAt: new Date().toISOString(),
            steadfastLastOrderInfo: steadfastInfo.payload,
            consignmentId: steadfastInfo.consignmentId || mergedMetadata.consignmentId || null,
          },
        } as any,
      });

      if (normalizedStatus !== shipment.status) {
        await createNotification({
          userId: shipment.order.userId,
          tenantId: shipment.order.tenantId ?? null,
          type: 'order_update',
          title: 'Shipment status refreshed',
          message: `Shipment ${shipment.id.slice(0, 8)} is now ${normalizedStatus.replaceAll('_', ' ')} after Steadfast sync.`,
          actionUrl: `/account/orders/${shipment.order.id}?shipment=${shipment.id}`,
          metadata: {
            orderId: shipment.order.id,
            shipmentId: shipment.id,
            status: normalizedStatus,
            courierProvider: shipment.courierProvider,
            trackingId: updatedShipment.trackingId,
          },
        });
      }

      await syncResellerSettlementFromShipmentStatus(shipment.order.id, normalizedStatus);

      res.json({
        success: true,
        shipment: serializeOrderShipment(updatedShipment),
        providerPayload: steadfastInfo.payload,
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to sync Steadfast shipment status' });
    }
  });

  app.get("/api/logistics/steadfast/balance", authenticateToken, requireRole("admin"), async (_req: any, res) => {
    try {
      const payload = await getSteadfastBalance();
      res.json(payload);
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to fetch Steadfast balance' });
    }
  });

  app.post("/api/logistics/steadfast/orders/bulk", authenticateToken, requireRole("admin"), async (req: any, res) => {
    const orders = Array.isArray(req.body?.orders) ? req.body.orders : [];

    if (orders.length === 0) {
      return res.status(400).json({ error: 'orders array is required' });
    }

    try {
      const payload = await createSteadfastBulkOrders(orders);
      res.json(payload);
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to create Steadfast bulk orders' });
    }
  });

  app.post("/api/logistics/steadfast/returns", authenticateToken, requireRole("admin"), async (req: any, res) => {
    const identifier =
      typeof req.body?.consignment_id === 'string'
        ? req.body.consignment_id
        : typeof req.body?.invoice === 'string'
          ? req.body.invoice
          : typeof req.body?.tracking_code === 'string'
            ? req.body.tracking_code
            : '';

    if (!identifier) {
      return res.status(400).json({ error: 'consignment_id or invoice or tracking_code is required' });
    }

    try {
      const payload = await createSteadfastReturnRequest({
        consignment_id: typeof req.body?.consignment_id === 'string' ? req.body.consignment_id : undefined,
        invoice: typeof req.body?.invoice === 'string' ? req.body.invoice : undefined,
        tracking_code: typeof req.body?.tracking_code === 'string' ? req.body.tracking_code : undefined,
        reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
      });
      res.json(payload);
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to create Steadfast return request' });
    }
  });

  app.get("/api/logistics/steadfast/returns", authenticateToken, requireRole("admin"), async (_req: any, res) => {
    try {
      const payload = await getSteadfastReturnRequests();
      res.json(payload);
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to fetch Steadfast return requests' });
    }
  });

  app.get("/api/logistics/steadfast/returns/:id", authenticateToken, requireRole("admin"), async (req: any, res) => {
    try {
      const payload = await getSteadfastReturnRequest(String(req.params.id || ''));
      res.json(payload);
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to fetch Steadfast return request' });
    }
  });

  app.get("/api/logistics/steadfast/payments", authenticateToken, requireRole("admin"), async (_req: any, res) => {
    try {
      const payload = await getSteadfastPayments();
      res.json(payload);
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to fetch Steadfast payments' });
    }
  });

  app.get("/api/logistics/steadfast/payments/:paymentId", authenticateToken, requireRole("admin"), async (req: any, res) => {
    try {
      const payload = await getSteadfastPayment(String(req.params.paymentId || ''));
      res.json(payload);
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to fetch Steadfast payment details' });
    }
  });

  app.get("/api/logistics/steadfast/police-stations", authenticateToken, requireRole("admin"), async (_req: any, res) => {
    try {
      const payload = await getSteadfastPoliceStations();
      res.json(payload);
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to fetch Steadfast police stations' });
    }
  });

  app.post("/api/logistics/webhooks/:provider", async (req, res) => {
    const provider = String(req.params.provider || '').toLowerCase();
    if (provider === 'pathao' && String(req.body?.event || '') === 'webhook_integration') {
      res.setHeader('X-Pathao-Merchant-Webhook-Integration-Secret', getPathaoWebhookIntegrationSecret());
      return res.status(202).json({ accepted: true });
    }

    const expectedToken =
      provider === 'pathao'
        ? (env as any).PATHAO_WEBHOOK_TOKEN
        : provider === 'redx'
          ? (env as any).REDX_WEBHOOK_TOKEN
          : provider === 'steadfast'
            ? ((env as any).STEADFAST_WEBHOOK_TOKEN || (env as any).STEADFAST_API_KEY)
          : undefined;

    const authorizationHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    const bearerToken = authorizationHeader.toLowerCase().startsWith('bearer ')
      ? authorizationHeader.slice(7).trim()
      : '';
    const providedToken =
      (typeof req.query?.token === 'string' && req.query.token) ||
      (typeof req.headers['x-courier-webhook-token'] === 'string' && req.headers['x-courier-webhook-token']) ||
      (provider === 'pathao' && typeof req.headers['x-pathao-signature'] === 'string' ? req.headers['x-pathao-signature'] : '') ||
      (provider === 'steadfast' ? bearerToken : '') ||
      '';

    if (expectedToken && providedToken !== expectedToken) {
      return res.status(401).json({ error: 'Invalid courier webhook token' });
    }

    try {
      const details = extractCourierWebhookDetails(req.body);

      if (!details.trackingId && !(provider === 'steadfast' && (details.consignmentId || details.invoice))) {
        return res.status(202).json({ accepted: true, reason: 'tracking_id_missing' });
      }

      let shipment = await prisma.orderShipment.findFirst({
        where: { trackingId: details.trackingId || undefined },
        select: {
          id: true,
          orderId: true,
          status: true,
          trackingId: true,
          shipmentMetadata: true,
          courierProvider: true,
          warehouseId: true,
          pickupRequestedAt: true,
          pickedUpAt: true,
          outForDeliveryAt: true,
          deliveredAt: true,
          deliveryFailureReason: true,
          updatedAt: true,
          order: {
            select: {
              userId: true,
              tenantId: true,
            },
          },
        },
      });

      if (!shipment && provider === 'steadfast') {
        const candidateShipments = await prisma.orderShipment.findMany({
          where: {
            courierProvider: {
              contains: 'steadfast',
              mode: 'insensitive',
            },
          },
          select: {
            id: true,
            orderId: true,
            status: true,
            trackingId: true,
            shipmentMetadata: true,
            courierProvider: true,
            warehouseId: true,
            pickupRequestedAt: true,
            pickedUpAt: true,
            outForDeliveryAt: true,
            deliveredAt: true,
            deliveryFailureReason: true,
            updatedAt: true,
            order: {
              select: {
                userId: true,
                tenantId: true,
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
          take: 200,
        });

        shipment =
          candidateShipments.find((entry: any) => {
            const metadata =
              entry.shipmentMetadata && typeof entry.shipmentMetadata === 'object'
                ? (entry.shipmentMetadata as Record<string, unknown>)
                : {};
            const consignmentId =
              typeof metadata.consignmentId === 'string'
                ? metadata.consignmentId
                : typeof metadata.consignmentId === 'number'
                  ? String(metadata.consignmentId)
                  : null;
            const invoice = typeof metadata.invoice === 'string' ? metadata.invoice : null;

            return (
              (details.consignmentId && consignmentId === details.consignmentId) ||
              (details.invoice && invoice === details.invoice)
            );
          }) || null;
      }

      if (!shipment) {
        return res.status(202).json({ accepted: true, reason: 'shipment_not_found' });
      }

      const shipmentMetadata =
        shipment.shipmentMetadata && typeof shipment.shipmentMetadata === 'object'
          ? { ...(shipment.shipmentMetadata as Record<string, unknown>) }
          : {};

      const nextStatus =
        provider === 'pathao'
          ? details.pathaoNormalizedStatus || details.normalizedStatus
          : details.normalizedStatus;
      const timestampData = buildShipmentTimestampData(nextStatus, shipment);

      await prisma.orderShipment.update({
        where: { id: shipment.id },
        data: {
          ...(nextStatus ? { status: nextStatus } : {}),
          ...timestampData,
          shipmentMetadata: {
            ...shipmentMetadata,
            lastWebhookSyncAt: new Date().toISOString(),
            lastWebhookProvider: provider,
            lastWebhookStatus: details.rawStatus,
            lastWebhookPayload: req.body,
            ...(provider === 'pathao'
              ? {
                  pathaoLastSyncAt: new Date().toISOString(),
                  pathaoLastEvent: details.pathaoEvent || null,
                  pathaoLastStatusSlug: details.pathaoOrderStatus || null,
                }
              : {}),
            ...(provider === 'steadfast'
              ? {
                  steadfastLastSyncAt: new Date().toISOString(),
                  consignmentId: details.consignmentId || shipmentMetadata.consignmentId || null,
                  invoice: details.invoice || shipmentMetadata.invoice || null,
                }
              : {}),
          },
        } as any,
      });

      if (nextStatus) {
        await createNotification({
          userId: shipment.order.userId,
          tenantId: shipment.order.tenantId ?? null,
          type: 'order_update',
          title: 'Shipment tracking updated',
          message: `Shipment ${shipment.id.slice(0, 8)} from order ${shipment.orderId} is now ${nextStatus.replaceAll('_', ' ')}.`,
          actionUrl: `/account/orders/${shipment.orderId}?shipment=${shipment.id}`,
          metadata: {
            orderId: shipment.orderId,
            shipmentId: shipment.id,
            status: nextStatus,
            courierProvider: provider,
            trackingId: details.trackingId,
          },
        });
        await syncResellerSettlementFromShipmentStatus(shipment.orderId, nextStatus);
      }

      if (provider === 'pathao') {
        res.setHeader('X-Pathao-Merchant-Webhook-Integration-Secret', getPathaoWebhookIntegrationSecret());
        return res.status(202).json({ accepted: true, shipmentId: shipment.id, orderId: shipment.orderId, status: nextStatus });
      }

      res.json({ success: true, shipmentId: shipment.id, orderId: shipment.orderId, status: nextStatus });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to process courier webhook' });
    }
  });
}
