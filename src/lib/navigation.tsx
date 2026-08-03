'use client';

import NextLink from 'next/link';
import {
  useParams as useNextParams,
  usePathname,
  useRouter,
} from 'next/navigation';
import React from 'react';

type To = string;

type NavigateOptions = {
  replace?: boolean;
  scroll?: boolean;
  state?: unknown;
};

type LinkProps = Omit<React.ComponentProps<typeof NextLink>, 'href'> & {
  to: To;
  state?: unknown;
};

const NAVIGATION_STATE_PREFIX = '__amarshop_nav_state__:';
const isDev = process.env.NODE_ENV !== 'production';

function normalizeTarget(target: To) {
  return target || '/';
}

function storageKey(target: To) {
  return `${NAVIGATION_STATE_PREFIX}${normalizeTarget(target)}`;
}

function persistNavigationState(target: To, state: unknown) {
  if (typeof window === 'undefined' || typeof state === 'undefined') return;

  try {
    window.sessionStorage.setItem(storageKey(target), JSON.stringify(state));
  } catch (error) {
    if (isDev) {
      console.warn('Failed to persist navigation state', error);
    }
  }
}

function readNavigationState(target: To) {
  if (typeof window === 'undefined') return null;

  try {
    const value = window.sessionStorage.getItem(storageKey(target));
    return value ? JSON.parse(value) : null;
  } catch (error) {
    if (isDev) {
      console.warn('Failed to read navigation state', error);
    }
    return null;
  }
}

function toSearchString(params: URLSearchParams) {
  const value = params.toString();
  return value ? `?${value}` : '';
}

export function Link({ to, state, onClick, replace, scroll, ...props }: LinkProps) {
  const href = normalizeTarget(to);

  return (
    <NextLink
      href={href}
      replace={replace}
      scroll={scroll}
      onClick={(event) => {
        persistNavigationState(href, state);
        onClick?.(event);
      }}
      {...props}
    />
  );
}

export function useNavigate() {
  const router = useRouter();

  return React.useCallback(
    (to: To, options: NavigateOptions = {}) => {
      const href = normalizeTarget(to);
      persistNavigationState(href, options.state);
      const method = options.replace ? router.replace : router.push;
      method(href, { scroll: options.scroll });
    },
    [router],
  );
}

export function useLocation() {
  const pathname = usePathname();
  const [search, setSearch] = React.useState('');

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      setSearch(window.location.search);
    }
  }, [pathname]);

  const current = `${pathname}${search}`;

  return React.useMemo(
    () => ({
      pathname,
      search,
      hash: '',
      state: readNavigationState(current) ?? readNavigationState(pathname),
      key: current,
    }),
    [current, pathname, search],
  );
}

export function useParams<T extends Record<string, string | string[] | undefined>>() {
  return useNextParams<T>();
}

export function useSearchParams(): [
  URLSearchParams,
  (
    nextInit:
      | string
      | URLSearchParams
      | Record<string, string | number | boolean | null | undefined>,
    options?: { replace?: boolean; scroll?: boolean },
  ) => void,
] {
  const pathname = usePathname();
  const navigate = useNavigate();
  const [search, setSearch] = React.useState('');

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      setSearch(window.location.search);
    }
  }, [pathname]);

  const params = React.useMemo(() => new URLSearchParams(search), [search]);

  const setSearchParams = React.useCallback(
    (
      nextInit:
        | string
        | URLSearchParams
        | Record<string, string | number | boolean | null | undefined>,
      options?: { replace?: boolean; scroll?: boolean },
    ) => {
      const nextParams =
        typeof nextInit === 'string'
          ? new URLSearchParams(nextInit)
          : nextInit instanceof URLSearchParams
            ? new URLSearchParams(nextInit.toString())
            : new URLSearchParams(
                Object.entries(nextInit).reduce<Record<string, string>>((acc, [key, value]) => {
                  if (value !== null && typeof value !== 'undefined') {
                    acc[key] = String(value);
                  }
                  return acc;
                }, {}),
              );

      navigate(`${pathname}${toSearchString(nextParams)}`, options);
    },
    [navigate, pathname],
  );

  return [params, setSearchParams];
}
