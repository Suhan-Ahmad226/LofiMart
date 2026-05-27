export type CourierProviderView = {
  code: string;
  name: string;
  mode: 'manual' | 'api';
  supportsCod: boolean;
  supportsTrackingSync: boolean;
  supportsPickupBooking: boolean;
  setupStatus?: 'manual_ready' | 'api_ready' | 'missing_config';
  setupMessage?: string;
  brandColor?: string;
  shortLabel?: string;
};

export type ShipmentBookingInput = {
  orderId: string;
  shipmentId?: string;
  providerCode: string;
  merchantReference: string;
  customer: {
    name: string;
    phone?: string | null;
    secondaryPhone?: string | null;
    city?: string | null;
    address?: string | null;
    cityId?: number | null;
    zoneId?: number | null;
    areaId?: number | null;
  };
  amount: number;
  codAmount?: number;
  pickupLocation?: {
    warehouseId?: string | null;
    name?: string | null;
    contactName?: string | null;
    phone?: string | null;
    secondaryContact?: string | null;
    otpNumber?: string | null;
    address?: string | null;
    city?: string | null;
    areaId?: number | null;
    zoneId?: number | null;
    cityId?: number | null;
    storeId?: number | null;
  } | null;
  parcel?: {
    quantity?: number;
    weightKg?: number;
    deliveryType?: 12 | 48;
    itemType?: 1 | 2;
    description?: string | null;
    specialInstruction?: string | null;
  } | null;
};

export type ShipmentBookingResult = {
  providerCode: string;
  providerName: string;
  trackingId: string;
  bookingMode: 'manual' | 'api';
  status: 'pickup_requested';
  notes?: string;
  deliveryFee?: number | null;
  metadata?: Record<string, unknown> | null;
};

export interface CourierAdapter {
  getProvider(): CourierProviderView;
  bookShipment(input: ShipmentBookingInput): Promise<ShipmentBookingResult>;
}

export interface CourierProviderRegistry {
  listProviders(): CourierProviderView[];
  getProvider(code: string): CourierAdapter | null;
}
