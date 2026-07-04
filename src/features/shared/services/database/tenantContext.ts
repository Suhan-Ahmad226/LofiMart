import { AsyncLocalStorage } from 'node:async_hooks';

type TenantContextValue = {
  tenantId?: string | null;
  bypass?: boolean;
};

const tenantStorage = new AsyncLocalStorage<TenantContextValue>();

export function withTenantContext<T>(context: TenantContextValue, fn: () => Promise<T>) {
  return tenantStorage.run(context, fn);
}

export function getTenantContext() {
  return tenantStorage.getStore() ?? {};
}
