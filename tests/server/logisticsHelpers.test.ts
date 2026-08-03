import { describe, it, expect } from "vitest";
import {
  normalizeCourierStatus,
  normalizePathaoShipmentStatus,
  buildShipmentTimestampData,
  extractCourierWebhookDetails,
} from "../../src/server/routes/logisticsHelpers.js";

describe("normalizeCourierStatus", () => {
  it("maps 'pending' to pickup_requested", () => {
    expect(normalizeCourierStatus("pending")).toBe("pickup_requested");
  });

  it("maps 'in_review' to pickup_requested", () => {
    expect(normalizeCourierStatus("in_review")).toBe("pickup_requested");
  });

  it("passes through direct matches unchanged", () => {
    expect(normalizeCourierStatus("processing")).toBe("processing");
    expect(normalizeCourierStatus("picked_up")).toBe("picked_up");
    expect(normalizeCourierStatus("in_transit")).toBe("in_transit");
    expect(normalizeCourierStatus("delivered")).toBe("delivered");
    expect(normalizeCourierStatus("cancelled")).toBe("cancelled");
  });

  it("normalizes spaces and hyphens", () => {
    expect(normalizeCourierStatus("out for delivery")).toBe("out_for_delivery");
    expect(normalizeCourierStatus("delivery-failed")).toBe("delivery_failed");
  });

  it("maps common synonyms", () => {
    expect(normalizeCourierStatus("created")).toBe("pending");
    expect(normalizeCourierStatus("order_created")).toBe("pending");
    expect(normalizeCourierStatus("shipped")).toBe("in_transit");
    expect(normalizeCourierStatus("transit")).toBe("in_transit");
    expect(normalizeCourierStatus("pickedup")).toBe("picked_up");
    expect(normalizeCourierStatus("pickup_done")).toBe("picked_up");
  });

  it("maps delivery failure variants", () => {
    expect(normalizeCourierStatus("failed")).toBe("delivery_failed");
    expect(normalizeCourierStatus("delivery_exception")).toBe("delivery_failed");
    expect(normalizeCourierStatus("on_hold")).toBe("delivery_failed");
    expect(normalizeCourierStatus("pickup_failed")).toBe("delivery_failed");
  });

  it("maps return variants", () => {
    expect(normalizeCourierStatus("returned")).toBe("returned");
    expect(normalizeCourierStatus("returned_to_merchant")).toBe("returned");
    expect(normalizeCourierStatus("return_in_transit")).toBe("returned");
    expect(normalizeCourierStatus("paid_return")).toBe("returned");
  });

  it("returns null for completely unknown values", () => {
    expect(normalizeCourierStatus("xyzzy")).toBeNull();
    expect(normalizeCourierStatus("")).toBeNull();
    expect(normalizeCourierStatus(null)).toBeNull();
  });
});

describe("normalizePathaoShipmentStatus", () => {
  it("maps Pathao event values correctly", () => {
    expect(normalizePathaoShipmentStatus("pickup_requested")).toBe("pickup_requested");
    expect(normalizePathaoShipmentStatus("picked_up")).toBe("picked_up");
    expect(normalizePathaoShipmentStatus("cancelled")).toBe("cancelled");
    expect(normalizePathaoShipmentStatus("delivered")).toBe("delivered");
  });

  it("uses event over status when event is more specific", () => {
    expect(normalizePathaoShipmentStatus("in_transit", "pending")).toBe("in_transit");
  });

  it("falls back to status when event is unknown", () => {
    expect(normalizePathaoShipmentStatus("unknown_event", "delivered")).toBe("delivered");
  });

  it("normalizes dots and spaces in status values", () => {
    expect(normalizePathaoShipmentStatus("order.created")).toBe("pickup_requested");
    expect(normalizePathaoShipmentStatus("order_created")).toBe("pickup_requested");
  });

  it("falls back to normalizeCourierStatus for unmapped values", () => {
    expect(normalizePathaoShipmentStatus(null, "pending")).toBe("pickup_requested");
  });
});

describe("buildShipmentTimestampData", () => {
  it("sets pickupRequestedAt for pickup_requested", () => {
    const result = buildShipmentTimestampData("pickup_requested", {});
    expect(result.pickupRequestedAt).toBeInstanceOf(Date);
  });

  it("sets pickedUpAt for picked_up", () => {
    const result = buildShipmentTimestampData("picked_up", {});
    expect(result.pickedUpAt).toBeInstanceOf(Date);
  });

  it("preserves existing timestamps", () => {
    const existing = new Date("2024-01-01");
    const result = buildShipmentTimestampData("picked_up", { pickedUpAt: existing });
    expect(result.pickedUpAt).toBe(existing);
  });

  it("clears deliveryFailureReason for non-failure statuses", () => {
    const result = buildShipmentTimestampData("delivered", {});
    expect(result.deliveryFailureReason).toBeNull();
  });

  it("returns empty object for null/undefined status", () => {
    expect(buildShipmentTimestampData(null, {})).toEqual({});
    expect(buildShipmentTimestampData(undefined, {})).toEqual({});
  });
});

describe("extractCourierWebhookDetails", () => {
  it("extracts tracking_id from payload", () => {
    const result = extractCourierWebhookDetails({ tracking_id: "TK123" });
    expect(result.trackingId).toBe("TK123");
  });

  it("extracts trackingId (camelCase)", () => {
    const result = extractCourierWebhookDetails({ trackingId: "TK456" });
    expect(result.trackingId).toBe("TK456");
  });

  it("extracts consignment_id as fallback tracking ID", () => {
    const result = extractCourierWebhookDetails({ consignment_id: "CS789" });
    expect(result.trackingId).toBe("CS789");
  });

  it("extracts consignmentId as string", () => {
    const result = extractCourierWebhookDetails({ consignmentId: 12345 });
    expect(result.consignmentId).toBe("12345");
  });

  it("extracts invoice from payload", () => {
    const result = extractCourierWebhookDetails({ invoice: "INV-001" });
    expect(result.invoice).toBe("INV-001");
  });

  it("extracts merchant_order_id as invoice fallback", () => {
    const result = extractCourierWebhookDetails({ merchant_order_id: "MO-001" });
    expect(result.invoice).toBe("MO-001");
  });

  it("normalizes status", () => {
    const result = extractCourierWebhookDetails({ status: "delivered" });
    expect(result.normalizedStatus).toBe("delivered");
  });

  it("extracts Pathao-specific fields", () => {
    const result = extractCourierWebhookDetails({
      event: "picked_up",
      order_status_slug: "in_transit",
    });
    expect(result.pathaoEvent).toBe("picked_up");
    expect(result.pathaoOrderStatus).toBe("in_transit");
    expect(result.pathaoNormalizedStatus).toBe("picked_up");
  });

  it("handles empty/null payload gracefully", () => {
    const result = extractCourierWebhookDetails({});
    expect(result.trackingId).toBeNull();
    expect(result.rawStatus).toBeNull();
  });
});
