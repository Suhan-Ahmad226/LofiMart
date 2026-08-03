import { describe, it, expect } from 'vitest';
import { filterRoleAwareLinks, isRoleAllowed } from '@/lib/role-navigation';
import type { RoleAwareLink } from '@/lib/role-navigation';

describe('isRoleAllowed', () => {
  it('returns true when role is in visibleTo', () => {
    expect(isRoleAllowed(['admin', 'seller'], 'admin')).toBe(true);
  });

  it('returns false when role is not in visibleTo', () => {
    expect(isRoleAllowed(['admin'], 'customer')).toBe(false);
  });
});

describe('filterRoleAwareLinks', () => {
  const links: RoleAwareLink[] = [
    { href: '/admin', label: 'Admin', visibleTo: ['admin'] },
    { href: '/seller', label: 'Seller', visibleTo: ['seller'] },
    { href: '/shop', label: 'Shop', visibleTo: ['customer', 'guest'] },
    { href: '/dashboard', label: 'Dashboard', visibleTo: ['admin', 'seller', 'customer'] },
  ];

  it('filters links by admin role', () => {
    const result = filterRoleAwareLinks(links, 'admin');
    expect(result).toHaveLength(2);
    expect(result.map((l) => l.href)).toContain('/admin');
    expect(result.map((l) => l.href)).toContain('/dashboard');
  });

  it('filters links by customer role', () => {
    const result = filterRoleAwareLinks(links, 'customer');
    expect(result).toHaveLength(2);
    expect(result.map((l) => l.href)).toContain('/shop');
    expect(result.map((l) => l.href)).toContain('/dashboard');
  });

  it('returns empty for role with no matching links', () => {
    const result = filterRoleAwareLinks(links, 'guest');
    expect(result).toHaveLength(1);
    expect(result[0].href).toBe('/shop');
  });
});
