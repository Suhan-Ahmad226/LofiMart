export type ExistingAccountOutcome =
  | { action: 'resume' }
  | { action: 'conflict'; code: 'ACCOUNT_EXISTS' };

/**
 * Decides what to do when a public registration matches an existing local user.
 *
 * The only account we ever resume is an UNVERIFIED leftover created by an
 * earlier interrupted registration whose FULL identity (email AND phone) matches.
 * A partial match (e.g. attacker using a victim's email with their own phone) or
 * any already-verified account is always treated as a conflict so the caller
 * returns ACCOUNT_EXISTS instead of attaching the new OTP session to it.
 */
export function classifyExistingAccountRegistration(params: {
  existingEmail: string | null;
  existingPhone: string | null;
  existingEmailVerified: boolean;
  existingPhoneVerified: boolean;
  requestEmail: string;
  requestPhone: string | null;
}): ExistingAccountOutcome {
  const fullyVerified = params.existingEmailVerified || params.existingPhoneVerified;
  const identityMatches =
    params.existingEmail === params.requestEmail && params.existingPhone === params.requestPhone;

  if (!fullyVerified && identityMatches) {
    return { action: 'resume' };
  }

  return { action: 'conflict', code: 'ACCOUNT_EXISTS' };
}