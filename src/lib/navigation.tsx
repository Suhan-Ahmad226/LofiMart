'use client';

import NextLink from 'next/link';
import {
  useParams as useNextParams,
  usePathname,
  useRouter,
  useSearchParams as useNextSearchParams,
} from 'next/navigation';
import React from 'react';

type To = string;

type NavigateOptions = {
  replace?: boolean;
  scroll?: boolean;
  state?: unknown;
};

type SearchParamsInit =
  | string
  | URLSearchParams
  | Record<string, string | number | boolean | null | undefined>;

type SetSearchParamsOptions = {
  replace?: boolean;
  scroll?: boolean;
};

type LinkProps = Omit<
  React.ComponentProps<typeof NextLink>,
  'href'
> & {
  to: To;
  state?: unknown;
};

const NAVIGATION_STATE_PREFIX = '__lofimart_nav_state__:';

const isDev = process.env.NODE_ENV !== 'production';

function normalizeTarget(target: To): string {
  return target?.trim() || '/';
}

function storageKey(target: To): string {
  return `${NAVIGATION_STATE_PREFIX}${normalizeTarget(target)}`;
}

function persistNavigationState(
  target: To,
  state: unknown,
): void {
  if (
    typeof window === 'undefined' ||
    typeof state === 'undefined'
  ) {
    return;
  }

  try {
    window.sessionStorage.setItem(
      storageKey(target),
      JSON.stringify(state),
    );
  } catch (error) {
    if (isDev) {
      console.warn(
        '[navigation] Failed to persist navigation state:',
        error,
      );
    }
  }
}

function readNavigationState(
  target: To,
): unknown {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const value = window.sessionStorage.getItem(
      storageKey(target),
    );

    if (!value) {
      return null;
    }

    return JSON.parse(value);
  } catch (error) {
    if (isDev) {
      console.warn(
        '[navigation] Failed to read navigation state:',
        error,
      );
    }

    return null;
  }
}

function toSearchString(
  params: URLSearchParams,
): string {
  const value = params.toString();

  return value ? `?${value}` : '';
}

function createSearchParams(
  init: SearchParamsInit,
): URLSearchParams {
  if (typeof init === 'string') {
    return new URLSearchParams(
      init.startsWith('?') ? init.slice(1) : init,
    );
  }

  if (init instanceof URLSearchParams) {
    return new URLSearchParams(init.toString());
  }

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(init)) {
    if (value === null || value === undefined) {
      continue;
    }

    params.set(key, String(value));
  }

  return params;
}

export function Link({
  to,
  state,
  onClick,
  replace,
  scroll,
  ...props
}: LinkProps) {
  const href = normalizeTarget(to);

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);

      if (event.defaultPrevented) {
        return;
      }

      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      persistNavigationState(href, state);
    },
    [href, onClick, state],
  );

  return (
    <NextLink
      {...props}
      href={href}
      replace={replace}
      scroll={scroll}
      onClick={handleClick}
    />
  );
}

export function useNavigate() {
  const router = useRouter();

  return React.useCallback(
    (
      to: To,
      options: NavigateOptions = {},
    ): void => {
      const href = normalizeTarget(to);

      persistNavigationState(
        href,
        options.state,
      );

      const navigationOptions =
        typeof options.scroll === 'undefined'
          ? undefined
          : {
              scroll: options.scroll,
            };

      if (options.replace) {
        if (navigationOptions) {
          router.replace(
            href,
            navigationOptions,
          );
        } else {
          router.replace(href);
        }

        return;
      }

      if (navigationOptions) {
        router.push(
          href,
          navigationOptions,
        );
      } else {
        router.push(href);
      }
    },
    [router],
  );
}

export function useLocation() {
  const pathname = usePathname();
  const nextSearchParams = useNextSearchParams();

  const search = React.useMemo(() => {
    const value = nextSearchParams.toString();

    return value ? `?${value}` : '';
  }, [nextSearchParams]);

  const key = React.useMemo(
    () => `${pathname}${search}`,
    [pathname, search],
  );

  const state = React.useMemo(
    () =>
      readNavigationState(key) ??
      readNavigationState(pathname),
    [key, pathname],
  );

  return React.useMemo(
    () => ({
      pathname,
      search,
      hash: '',
      state,
      key,
    }),
    [pathname, search, state, key],
  );
}

export function useParams<
  T extends Record<
    string,
    string | string[] | undefined
  > = Record<
    string,
    string | string[] | undefined
  >,
>() {
  return useNextParams<T>();
}

export function useSearchParams(): [
  URLSearchParams,
  (
    nextInit: SearchParamsInit,
    options?: SetSearchParamsOptions,
  ) => void,
] {
  const pathname = usePathname();
  const navigate = useNavigate();
  const nextSearchParams = useNextSearchParams();

  const params = React.useMemo(
    () =>
      new URLSearchParams(
        nextSearchParams.toString(),
      ),
    [nextSearchParams],
  );

  const setSearchParams = React.useCallback(
    (
      nextInit: SearchParamsInit,
      options: SetSearchParamsOptions = {},
    ): void => {
      const nextParams =
        createSearchParams(nextInit);

      const queryString =
        toSearchString(nextParams);

      const href =
        `${pathname}${queryString}`;

      navigate(href, options);
    },
    [navigate, pathname],
  );

  return [
    params,
    setSearchParams,
  ];
}