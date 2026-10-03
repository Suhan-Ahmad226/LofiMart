import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Identity resolution is the single place where a Supabase Auth identity turns
 * into a LofiMart application user. These tests cover the rules the whole auth
 * system depends on: one person is one profile no matter how many providers
 * they use, and no flow can merge two different identities.
 */

type Row = Record<string, unknown> & { id: string };

const store = vi.hoisted(() => {
  const users: Row[] = [];
  const providerAccounts: Row[] = [];

  function uniqueError() {
    return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
  }

  function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email?: string; supabaseAuthId?: string; id?: string } }) => {
        const found = users.find((row) => {
          if (where.id) return row.id === where.id;
          if (where.email) return (row.email as string)?.toLowerCase() === where.email.toLowerCase();
          if (where.supabaseAuthId) return row.supabaseAuthId === where.supabaseAuthId;
          return false;
        });
        return found ? (clone(found) as never) : null;
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        const matches = (row: Row) => {
          if (where.email && (row.email as string)?.toLowerCase() !== String(where.email).toLowerCase()) return false;
          if (where.supabaseAuthId && row.supabaseAuthId !== where.supabaseAuthId) return false;
          if (where.OR) {
            return where.OR.some((clause: Record<string, any>) =>
              Object.entries(clause).every(([field, value]) => (row as Record<string, unknown>)[field] === value),
            );
          }
          return true;
        };
        const found = users.find(matches);
        return found ? (clone(found) as never) : null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const email = String(data.email ?? '').toLowerCase();
        if (users.some((row) => (row.email as string)?.toLowerCase() === email)) throw uniqueError();
        if (data.supabaseAuthId && users.some((row) => row.supabaseAuthId === data.supabaseAuthId)) throw uniqueError();

        const row: Row = { id: `user-${users.length + 1}`, ...data };
        users.push(row);
        return clone(row) as never;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = users.find((candidate) => candidate.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return clone(row) as never;
      }),
    },
    providerAccount: {
      findUnique: vi.fn(
        async ({ where, include }: { where: { provider_providerAccountId: { provider: string; providerAccountId: string } }; include?: { user?: boolean } }) => {
          const { provider, providerAccountId } = where.provider_providerAccountId;
          const row = providerAccounts.find(
            (candidate) => candidate.provider === provider && candidate.providerAccountId === providerAccountId,
          );
          if (!row) return null;

          const linked = clone(row) as Record<string, unknown>;
          if (include?.user) {
            linked.user = clone(users.find((candidate) => candidate.id === row.userId) ?? null);
          }
          return linked as never;
        },
      ),
      findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => {
        const row = providerAccounts.find(
          (candidate) =>
            candidate.provider === where.provider &&
            candidate.providerAccountId === where.providerAccountId &&
            (!where.userId || candidate.userId !== where.userId),
        );
        return row ? (clone(row) as never) : null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const duplicate = providerAccounts.some(
          (row) => row.provider === data.provider && row.providerAccountId === data.providerAccountId,
        );
        if (duplicate) throw uniqueError();

        const row: Row = { id: `link-${providerAccounts.length + 1}`, ...data };
        providerAccounts.push(row);
        return clone(row) as never;
      }),
    },
  };

  return { users, providerAccounts, prismaMock: prisma };
});

vi.mock('@/lib/server', () => ({ prisma: store.prismaMock }));

import { resolveSupabaseIdentity } from '@/features/auth/server/identity-resolution';

const GOOGLE = { provider: 'google', providerAccountId: 'google-sub-1' };
const FACEBOOK = { provider: 'facebook', providerAccountId: 'facebook-sub-1' };

const userId = (result: Awaited<ReturnType<typeof resolveSupabaseIdentity>>) =>
  result.status === 'resolved' ? result.user.id : null;

describe('identity resolution', () => {
  beforeEach(() => {
    store.users.length = 0;
    store.providerAccounts.length = 0;
    vi.clearAllMocks();
  });

  it('creates exactly one customer profile for a genuinely new identity', async () => {
    const result = await resolveSupabaseIdentity({
      supabaseUserId: 'auth-1',
      email: 'new@example.com',
      emailVerified: true,
      provider: GOOGLE,
      providerEmailVerified: true,
      requestedRole: 'customer',
    });

    expect(result.status).toBe('resolved');
    expect(store.users).toHaveLength(1);
    expect(result.status === 'resolved' && result.createdProfile).toBe(true);
    expect(result.status === 'resolved' && result.user.role).toBe('customer');
  });

  it('never grants a privileged role from client input', async () => {
    const result = await resolveSupabaseIdentity({
      supabaseUserId: 'auth-1',
      email: 'sneaky@example.com',
      emailVerified: true,
      requestedRole: 'admin',
    });

    expect(result.status === 'resolved' && result.user.role).toBe('customer');
  });

  it('resolves the same profile when the callback is replayed', async () => {
    const first = await resolveSupabaseIdentity({
      supabaseUserId: 'auth-1',
      email: 'replay@example.com',
      emailVerified: true,
      provider: GOOGLE,
      providerEmailVerified: true,
    });
    const second = await resolveSupabaseIdentity({
      supabaseUserId: 'auth-1',
      email: 'replay@example.com',
      emailVerified: true,
      provider: GOOGLE,
      providerEmailVerified: true,
    });

    expect(store.users).toHaveLength(1);
    expect(first.status === 'resolved' && first.createdProfile).toBe(true);
    expect(second.status === 'resolved' && second.createdProfile).toBe(false);
    expect(userId(second)).toBe(userId(first));
  });

  it('resolves case-insensitive email input to one canonical identity', async () => {
    const first = await resolveSupabaseIdentity({
      supabaseUserId: 'auth-1',
      email: '  USER@Gmail.Com ',
      emailVerified: true,
    });
    const second = await resolveSupabaseIdentity({
      supabaseUserId: 'auth-1',
      email: 'user@gmail.com',
      emailVerified: true,
    });

    expect(store.users).toHaveLength(1);
    expect(store.users[0].email).toBe('user@gmail.com');
    expect(second.status === 'resolved' && second.createdProfile).toBe(false);
    expect(userId(second)).toBe(userId(first));
  });

  it('links every provider to the one email account it belongs to', async () => {
    const viaEmail = await resolveSupabaseIdentity({
      supabaseUserId: 'auth-1',
      email: 'both@example.com',
      emailVerified: true,
    });
    const viaGoogle = await resolveSupabaseIdentity({
      supabaseUserId: 'auth-1',
      email: 'both@example.com',
      emailVerified: true,
      provider: GOOGLE,
      providerEmailVerified: true,
    });
    const viaFacebook = await resolveSupabaseIdentity({
      supabaseUserId: 'auth-1',
      email: 'both@example.com',
      emailVerified: true,
      provider: FACEBOOK,
      providerEmailVerified: true,
    });

    // Email -> Google -> Facebook must never produce three profiles.
    expect(store.users).toHaveLength(1);
    expect(store.providerAccounts).toHaveLength(2);
    expect(userId(viaGoogle)).toBe(userId(viaEmail));
    expect(userId(viaFacebook)).toBe(userId(viaEmail));
  });

  it('refuses to merge a provider identity that belongs to another Supabase user', async () => {
    await resolveSupabaseIdentity({
      supabaseUserId: 'auth-1',
      email: 'owner@example.com',
      emailVerified: true,
    });

    const result = await resolveSupabaseIdentity({
      supabaseUserId: 'auth-2',
      email: 'owner@example.com',
      emailVerified: true,
      provider: GOOGLE,
      providerEmailVerified: true,
    });

    expect(result.status).toBe('link_conflict');
    expect(store.users).toHaveLength(1);
    expect(store.providerAccounts).toHaveLength(0);
  });

  it('refuses to link an unverified provider email', async () => {
    await resolveSupabaseIdentity({
      supabaseUserId: 'auth-1',
      email: 'unverified@example.com',
      emailVerified: true,
    });

    const result = await resolveSupabaseIdentity({
      supabaseUserId: 'auth-1',
      email: 'unverified@example.com',
      emailVerified: false,
      provider: GOOGLE,
      providerEmailVerified: false,
    });

    expect(result.status).toBe('provider_email_unverified');
    expect(store.providerAccounts).toHaveLength(0);
  });

  it('requires an unverified local profile to be verified before it can sign in', async () => {
    store.users.push({ id: 'user-1', email: 'pending@example.com', supabaseAuthId: null, emailVerified: false });

    const result = await resolveSupabaseIdentity({
      supabaseUserId: 'auth-1',
      email: 'pending@example.com',
      emailVerified: true,
      provider: GOOGLE,
      providerEmailVerified: true,
    });

    expect(result.status).toBe('email_unverified');
    expect(store.providerAccounts).toHaveLength(0);
  });

  it('refuses a provider identity already linked to a different profile', async () => {
    store.users.push({ id: 'user-1', email: 'first@example.com', supabaseAuthId: 'auth-1', emailVerified: true });
    store.providerAccounts.push({
      id: 'link-1',
      userId: 'user-1',
      provider: 'google',
      providerAccountId: 'google-sub-1',
    });

    const result = await resolveSupabaseIdentity({
      supabaseUserId: 'auth-2',
      email: 'second@example.com',
      emailVerified: true,
      provider: GOOGLE,
      providerEmailVerified: true,
    });

    expect(result.status).toBe('link_conflict');
    expect(store.users).toHaveLength(1);
  });

  it('creates one profile when two registrations race for the same email', async () => {
    const [first, second] = await Promise.all([
      resolveSupabaseIdentity({ supabaseUserId: 'auth-1', email: 'race@example.com', emailVerified: true }),
      resolveSupabaseIdentity({ supabaseUserId: 'auth-1', email: 'race@example.com', emailVerified: true }),
    ]);

    expect(store.users).toHaveLength(1);
    expect(first.status).toBe('resolved');
    expect(second.status).toBe('resolved');
    expect(userId(first)).toBe(userId(second));
    // Exactly one of them is reported as the creator.
    expect([first, second].filter((entry) => entry.status === 'resolved' && entry.createdProfile)).toHaveLength(1);
  });

  it('creates one profile when two different providers race for the same email', async () => {
    const results = await Promise.all([
      resolveSupabaseIdentity({
        supabaseUserId: 'auth-1',
        email: 'cross@example.com',
        emailVerified: true,
        provider: GOOGLE,
        providerEmailVerified: true,
      }),
      resolveSupabaseIdentity({
        supabaseUserId: 'auth-2',
        email: 'cross@example.com',
        emailVerified: true,
        provider: FACEBOOK,
        providerEmailVerified: true,
      }),
    ]);

    // Two distinct Supabase identities claiming the same verified address can
    // never both become the same LofiMart profile; the loser must be refused.
    expect(store.users).toHaveLength(1);
    expect(results.filter((entry) => entry.status === 'resolved')).toHaveLength(1);
    expect(results.filter((entry) => entry.status === 'link_conflict')).toHaveLength(1);
  });

  it('never mints a profile when creation is not allowed', async () => {
    const result = await resolveSupabaseIdentity({
      supabaseUserId: 'auth-1',
      email: 'absent@example.com',
      emailVerified: true,
      allowCreate: false,
    });

    expect(result.status).toBe('not_found');
    expect(store.users).toHaveLength(0);
  });

  it('rejects an unusable identifier', async () => {
    const result = await resolveSupabaseIdentity({
      supabaseUserId: 'auth-1',
      email: 'not-an-email',
      emailVerified: true,
    });

    expect(result.status).toBe('invalid_email');
    expect(store.users).toHaveLength(0);
  });
});