import { describe, it, expect } from 'vitest';
import {
  getDivisionOptions,
  getDistrictOptions,
  getUpazilaOptions,
  buildBangladeshAddressLine,
} from '@/lib/bangladesh-address';

describe('Bangladesh Address', () => {
  it('getDivisionOptions returns array of division names', () => {
    const divisions = getDivisionOptions();
    expect(Array.isArray(divisions)).toBe(true);
    expect(divisions.length).toBeGreaterThan(0);
    expect(typeof divisions[0]).toBe('string');
  });

  it('getDistrictOptions returns districts for a valid division', () => {
    const divisions = getDivisionOptions();
    if (divisions.length > 0) {
      const districts = getDistrictOptions(divisions[0]);
      expect(Array.isArray(districts)).toBe(true);
      expect(districts.length).toBeGreaterThan(0);
    }
  });

  it('getDistrictOptions returns empty array for unknown division', () => {
    const districts = getDistrictOptions('Nonexistent Division');
    expect(districts).toEqual([]);
  });

  it('getUpazilaOptions returns upazilas for valid division+district', () => {
    const divisions = getDivisionOptions();
    if (divisions.length > 0) {
      const districts = getDistrictOptions(divisions[0]);
      if (districts.length > 0) {
        const upazilas = getUpazilaOptions(divisions[0], districts[0]);
        expect(Array.isArray(upazilas)).toBe(true);
      }
    }
  });

  it('getUpazilaOptions returns empty array for invalid inputs', () => {
    expect(getUpazilaOptions('Bad', 'Bad')).toEqual([]);
  });

  it('buildBangladeshAddressLine joins non-empty parts', () => {
    const line = buildBangladeshAddressLine({
      address: '123 Main St',
      upazila: 'Dhanmondi',
      district: 'Dhaka',
      division: 'Dhaka',
    });
    expect(line).toContain('123 Main St');
    expect(line).toContain('Dhanmondi');
  });

  it('buildBangladeshAddressLine handles empty parts', () => {
    const line = buildBangladeshAddressLine({});
    expect(typeof line).toBe('string');
  });
});
