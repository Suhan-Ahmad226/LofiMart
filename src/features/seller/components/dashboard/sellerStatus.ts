/**
 * Presentation helpers for seller status values.
 *
 * Kept out of `DashboardSections.tsx` so that file only exports components
 * (React Fast Refresh requires it) and so the mapping can be unit tested
 * without a renderer.
 */

export type SellerStatusTone = 'success' | 'warning' | 'danger' | 'info' | 'pending' | 'neutral' | 'primary';

const SUCCESS_STATUSES = new Set(['delivered', 'shipped', 'completed', 'paid', 'approved']);
const DANGER_STATUSES = new Set([
  'cancelled',
  'returned',
  'failed',
  'delivery_failed',
  'rejected',
  'suspended',
  'refunded',
]);
const PENDING_STATUSES = new Set(['in_transit', 'out_for_delivery', 'picked_up']);
const INFO_STATUSES = new Set(['processing', 'packed', 'ready_for_pickup', 'pickup_requested']);

/**
 * Maps an order / shipment status string onto the design system chip tones.
 * Unrecognised values fall back to the neutral tone rather than guessing.
 */
export function toneForOrderStatus(status: string): SellerStatusTone {
  const normalized = String(status || '').toLowerCase();

  if (SUCCESS_STATUSES.has(normalized)) return 'success';
  if (DANGER_STATUSES.has(normalized)) return 'danger';
  if (PENDING_STATUSES.has(normalized)) return 'pending';
  if (INFO_STATUSES.has(normalized)) return 'info';
  if (normalized === 'pending') return 'warning';

  return 'neutral';
}

/** `ready_for_pickup` -> `Ready For Pickup`. */
export function formatStatusLabel(status: string): string {
  return String(status || '')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/**
 * Renders an elapsed-time label for a timestamp. Returns an empty string for
 * unparseable input so callers never show "NaN days ago".
 */
export function formatRelativeTime(isoDate: string, now = Date.now()): string {
  const timestamp = new Date(isoDate).getTime();
  if (!Number.isFinite(timestamp)) return '';

  const diffMinutes = Math.max(0, Math.round((now - timestamp) / 60000));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}
