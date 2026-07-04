export type NavigationRole = 'guest' | 'customer' | 'seller' | 'reseller' | 'admin';

export type RoleAwareLink = {
  href: string;
  label: string;
  visibleTo: NavigationRole[];
};

export function isRoleAllowed(
  visibleTo: NavigationRole[],
  role: NavigationRole,
) {
  return visibleTo.includes(role);
}

export function filterRoleAwareLinks<T extends RoleAwareLink>(
  links: T[],
  role: NavigationRole,
) {
  return links.filter((link) => isRoleAllowed(link.visibleTo, role));
}
