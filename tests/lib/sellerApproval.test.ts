import { describe, it, expect } from 'vitest';
import {
  SELLER_STATUSES,
  normalizeSellerStatus,
  isSellerApproved,
  sellerCanEditAndResubmit,
  getSellerStatusLabel,
  getSellerStatusTone,
  buildSellerApprovalRequirements,
  getMissingSellerApprovalRequirements,
  canSellerSubmitForReview,
  getSellerApprovalBlockedActionLabel,
  getSellerApprovalBlockedMessage,
} from '@/lib/sellerApproval';

describe('normalizeSellerStatus', () => {
  it('normalizes valid statuses', () => {
    expect(normalizeSellerStatus('draft')).toBe('draft');
    expect(normalizeSellerStatus('approved')).toBe('approved');
    expect(normalizeSellerStatus('pending_review')).toBe('pending_review');
  });

  it('converts "active" to "approved"', () => {
    expect(normalizeSellerStatus('active')).toBe('approved');
  });

  it('returns "draft" for unknown values', () => {
    expect(normalizeSellerStatus('unknown')).toBe('draft');
    expect(normalizeSellerStatus(null)).toBe('draft');
    expect(normalizeSellerStatus(undefined)).toBe('draft');
  });

  it('is case-insensitive', () => {
    expect(normalizeSellerStatus('APPROVED')).toBe('approved');
    expect(normalizeSellerStatus('  Rejected  ')).toBe('rejected');
  });
});

describe('isSellerApproved', () => {
  it('returns true only for approved', () => {
    expect(isSellerApproved('approved')).toBe(true);
    expect(isSellerApproved('active')).toBe(true);
    expect(isSellerApproved('draft')).toBe(false);
  });
});

describe('sellerCanEditAndResubmit', () => {
  it('returns true for draft and rejected', () => {
    expect(sellerCanEditAndResubmit('draft')).toBe(true);
    expect(sellerCanEditAndResubmit('rejected')).toBe(true);
  });

  it('returns false for approved and pending', () => {
    expect(sellerCanEditAndResubmit('approved')).toBe(false);
    expect(sellerCanEditAndResubmit('pending_review')).toBe(false);
  });
});

describe('getSellerStatusLabel', () => {
  it('replaces underscores with spaces', () => {
    expect(getSellerStatusLabel('pending_review')).toBe('pending review');
    expect(getSellerStatusLabel('approved')).toBe('approved');
  });
});

describe('getSellerStatusTone', () => {
  it('returns correct tones', () => {
    expect(getSellerStatusTone('approved')).toBe('success');
    expect(getSellerStatusTone('rejected')).toBe('critical');
    expect(getSellerStatusTone('suspended')).toBe('critical');
    expect(getSellerStatusTone('pending_review')).toBe('warning');
    expect(getSellerStatusTone('draft')).toBe('neutral');
  });
});

describe('buildSellerApprovalRequirements', () => {
  it('builds 6 requirements from input', () => {
    const reqs = buildSellerApprovalRequirements({
      emailVerified: true,
      phoneVerified: false,
      hasStoreInfo: true,
      hasPickupLocation: false,
      hasKycSubmission: false,
      hasPayoutMethod: false,
    });
    expect(reqs).toHaveLength(6);
    expect(reqs[0].completed).toBe(true);
    expect(reqs[1].completed).toBe(false);
    expect(reqs[5].completed).toBe(false);
  });
});

describe('getMissingSellerApprovalRequirements', () => {
  it('filters completed requirements', () => {
    const reqs = buildSellerApprovalRequirements({
      emailVerified: true,
      phoneVerified: true,
      hasStoreInfo: true,
      hasPickupLocation: true,
      hasKycSubmission: true,
      hasPayoutMethod: true,
    });
    expect(getMissingSellerApprovalRequirements(reqs)).toHaveLength(0);
  });

  it('returns incomplete requirements', () => {
    const reqs = buildSellerApprovalRequirements({
      emailVerified: true,
      phoneVerified: false,
      hasStoreInfo: false,
      hasPickupLocation: false,
      hasKycSubmission: false,
      hasPayoutMethod: false,
    });
    expect(getMissingSellerApprovalRequirements(reqs)).toHaveLength(5);
  });
});

describe('canSellerSubmitForReview', () => {
  it('returns true when all requirements met and status is draft', () => {
    const reqs = buildSellerApprovalRequirements({
      emailVerified: true,
      phoneVerified: true,
      hasStoreInfo: true,
      hasPickupLocation: true,
      hasKycSubmission: true,
      hasPayoutMethod: true,
    });
    expect(canSellerSubmitForReview(reqs, 'draft')).toBe(true);
  });

  it('returns false when requirements missing', () => {
    const reqs = buildSellerApprovalRequirements({
      emailVerified: true,
      phoneVerified: false,
      hasStoreInfo: true,
      hasPickupLocation: true,
      hasKycSubmission: true,
      hasPayoutMethod: true,
    });
    expect(canSellerSubmitForReview(reqs, 'draft')).toBe(false);
  });

  it('returns false when status is approved', () => {
    const reqs = buildSellerApprovalRequirements({
      emailVerified: true,
      phoneVerified: true,
      hasStoreInfo: true,
      hasPickupLocation: true,
      hasKycSubmission: true,
      hasPayoutMethod: true,
    });
    expect(canSellerSubmitForReview(reqs, 'approved')).toBe(false);
  });
});

describe('getSellerApprovalBlockedActionLabel', () => {
  it('returns labels for all capabilities', () => {
    expect(getSellerApprovalBlockedActionLabel('product_publish')).toBe('publish products');
    expect(getSellerApprovalBlockedActionLabel('payout_withdrawal')).toBe('withdraw payouts');
    expect(getSellerApprovalBlockedActionLabel('courier_booking')).toBe('book courier pickups');
  });
});

describe('getSellerApprovalBlockedMessage', () => {
  it('returns appropriate messages per status', () => {
    const rejected = getSellerApprovalBlockedMessage('product_publish', 'rejected');
    expect(rejected).toContain('needs fixes');

    const suspended = getSellerApprovalBlockedMessage('product_publish', 'suspended');
    expect(suspended).toContain('suspended');

    const pending = getSellerApprovalBlockedMessage('product_publish', 'pending_review');
    expect(pending).toContain('under admin review');

    const draft = getSellerApprovalBlockedMessage('product_publish', 'draft');
    expect(draft).toContain('Complete onboarding');
  });
});
