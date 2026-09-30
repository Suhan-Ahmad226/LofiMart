// Roles a user is allowed to self-select during public registration.
// Deliberately excludes admin / super-admin to prevent privilege escalation.
const PUBLIC_REGISTRATION_ROLES = ['customer', 'seller', 'reseller'] as const;

export type PublicRegistrationRole = (typeof PUBLIC_REGISTRATION_ROLES)[number];

/**
 * Sanitizes a client-supplied role value for self-service registration.
 *
 * Never trust client-supplied roles: any value that is not an allowed public
 * role (e.g. "admin", "staff", or arbitrary strings) is coerced to "customer".
 */
export function sanitizeRegistrationRole(value: unknown): PublicRegistrationRole {
  return PUBLIC_REGISTRATION_ROLES.includes(value as PublicRegistrationRole)
    ? (value as PublicRegistrationRole)
    : 'customer';
}
