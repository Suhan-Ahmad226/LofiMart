'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  ArrowRight,
  Bell,
  ChevronDown,
  ClipboardList,
  Heart,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Search,
  Settings,
  ShoppingCart,
  User,
  X,
} from 'lucide-react';

import {
  Link,
  useLocation,
  useNavigate,
} from '../../../lib/navigation';

import { useCart } from '../../../features/shop/state/CartContext';
import { useUser } from '../../../features/shared/state/UserContext';
import { useWishlist } from '../../../features/shop/state/WishlistContext';

import {
  AnimatedBadge,
  AnimatedIcon,
} from '@/features/shared/ui/AnimatedIcon';

import {
  filterRoleAwareLinks,
  type NavigationRole,
  type RoleAwareLink,
} from '../../../lib/role-navigation';

import { getCachedClientValue } from '../../../lib/client-cache';
import { useAuthModal } from '@/features/auth/context/AuthModalContext';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type HeaderSubcategory = {
  id: string | number;
  name: string;
};

type HeaderCategory = {
  id: string | number;
  name: string;
  subcategories?: HeaderSubcategory[];
};

type SearchSuggestion = {
  id: string | number;
  slug: string;
  name: string;
  category?: string | null;
  price?: number | string | null;
  sale_price?: number | string | null;
  image?: string | null;
  image_url?: string | null;
  thumbnail?: string | null;
  thumbnail_url?: string | null;
};

type SearchDiscoveryPayload = {
  trending?: unknown;
};

type AccountLink = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

type MobileSection = {
  title: string;
  links: {
    label: string;
    href: string;
  }[];
};

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const RECENT_SEARCHES_KEY = 'amarshop_recent_searches';

const MAX_RECENT_SEARCHES = 6;
const MAX_TRENDING_SEARCHES = 8;
const MAX_SUGGESTIONS = 8;

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_CACHE_TTL = 2 * 60 * 1000;
const DISCOVERY_CACHE_TTL = 10 * 60 * 1000;
const CATEGORY_CACHE_TTL = 15 * 60 * 1000;

const headerCategoryFallbacks: HeaderCategory[] = [
  {
    id: 'fashion',
    name: 'Fashion',
    subcategories: [
      { id: 'fashion-women', name: 'Women' },
      { id: 'fashion-men', name: 'Men' },
    ],
  },
  {
    id: 'electronics',
    name: 'Electronics',
    subcategories: [
      { id: 'electronics-mobile', name: 'Mobiles' },
      { id: 'electronics-audio', name: 'Audio' },
    ],
  },
  {
    id: 'home',
    name: 'Home & Living',
    subcategories: [
      { id: 'home-decor', name: 'Decor' },
      { id: 'home-kitchen', name: 'Kitchen' },
    ],
  },
  {
    id: 'beauty',
    name: 'Beauty',
    subcategories: [
      { id: 'beauty-skincare', name: 'Skincare' },
      { id: 'beauty-makeup', name: 'Makeup' },
    ],
  },
  {
    id: 'grocery',
    name: 'Groceries',
    subcategories: [
      { id: 'grocery-fresh', name: 'Fresh foods' },
      { id: 'grocery-pantry', name: 'Pantry' },
    ],
  },
  {
    id: 'sports',
    name: 'Sports',
    subcategories: [
      { id: 'sports-fitness', name: 'Fitness' },
      { id: 'sports-outdoor', name: 'Outdoor' },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeCategory(
  value: unknown,
  index: number,
): HeaderCategory | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = typeof value.name === 'string'
    ? value.name.trim()
    : '';

  if (!name) {
    return null;
  }

  const id =
    typeof value.id === 'string' || typeof value.id === 'number'
      ? value.id
      : `category-${index}`;

  const rawSubcategories = Array.isArray(value.subcategories)
    ? value.subcategories
    : [];

  const subcategories: HeaderSubcategory[] = rawSubcategories
    .filter(isRecord)
    .map((subcategory, subIndex) => {
      const subName =
        typeof subcategory.name === 'string'
          ? subcategory.name.trim()
          : '';

      if (!subName) {
        return null;
      }

      const subId =
        typeof subcategory.id === 'string' ||
        typeof subcategory.id === 'number'
          ? subcategory.id
          : `${id}-subcategory-${subIndex}`;

      return {
        id: subId,
        name: subName,
      };
    })
    .filter(
      (item): item is HeaderSubcategory => item !== null,
    );

  return {
    id,
    name,
    subcategories,
  };
}

function normalizeSuggestion(
  value: unknown,
  index: number,
): SearchSuggestion | null {
  if (!isRecord(value)) {
    return null;
  }

  const name =
    typeof value.name === 'string'
      ? value.name.trim()
      : '';

  const slug =
    typeof value.slug === 'string'
      ? value.slug.trim()
      : '';

  if (!name || !slug) {
    return null;
  }

  const id =
    typeof value.id === 'string' ||
    typeof value.id === 'number'
      ? value.id
      : `suggestion-${index}`;

  return {
    id,
    slug,
    name,
    category:
      typeof value.category === 'string'
        ? value.category
        : null,
    price:
      typeof value.price === 'number' ||
      typeof value.price === 'string'
        ? value.price
        : null,
    sale_price:
      typeof value.sale_price === 'number' ||
      typeof value.sale_price === 'string'
        ? value.sale_price
        : null,
    image:
      typeof value.image === 'string'
        ? value.image
        : null,
    image_url:
      typeof value.image_url === 'string'
        ? value.image_url
        : null,
    thumbnail:
      typeof value.thumbnail === 'string'
        ? value.thumbnail
        : null,
    thumbnail_url:
      typeof value.thumbnail_url === 'string'
        ? value.thumbnail_url
        : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Header                                                                     */
/* -------------------------------------------------------------------------- */

export const Header = () => {
  const { totalItems } = useCart();
  const { user, isAuthenticated, logout } = useUser();
  const { items: wishlistItems } = useWishlist();
  const { openAuth } = useAuthModal();

  const navigate = useNavigate();
  const location = useLocation();

  /* ------------------------------------------------------------------------ */
  /* State                                                                    */
  /* ------------------------------------------------------------------------ */

  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);

  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [trendingSearches, setTrendingSearches] = useState<string[]>([]);

  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearchInteracted, setHasSearchInteracted] = useState(false);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const [isScrolled, setIsScrolled] = useState(false);

  const [headerCategories, setHeaderCategories] =
    useState<HeaderCategory[]>(headerCategoryFallbacks);

  const [headerCategoriesLoaded, setHeaderCategoriesLoaded] =
    useState(false);

  /* ------------------------------------------------------------------------ */
  /* Refs                                                                     */
  /* ------------------------------------------------------------------------ */

  const searchRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);
  const categoryRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  const suggestionsCacheRef =
    useRef<Map<string, SearchSuggestion[]>>(new Map());

  const searchRequestIdRef = useRef(0);

  /* ------------------------------------------------------------------------ */
  /* Navigation role                                                          */
  /* ------------------------------------------------------------------------ */

  const navigationRole: NavigationRole = isAuthenticated
    ? (user?.role ?? 'customer')
    : 'guest';

  /* ------------------------------------------------------------------------ */
  /* Close menus when clicking outside                                        */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (
        searchRef.current &&
        !searchRef.current.contains(target) &&
        mobileSearchRef.current &&
        !mobileSearchRef.current.contains(target)
      ) {
        setShowSuggestions(false);
      }

      if (
        categoryRef.current &&
        !categoryRef.current.contains(target)
      ) {
        setCategoryOpen(false);
      }

      if (
        accountRef.current &&
        !accountRef.current.contains(target)
      ) {
        setAccountOpen(false);
      }
    };

    document.addEventListener(
      'mousedown',
      handlePointerDown,
    );

    return () => {
      document.removeEventListener(
        'mousedown',
        handlePointerDown,
      );
    };
  }, []);

  /* ------------------------------------------------------------------------ */
  /* Scroll state                                                             */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (ticking) return;

      ticking = true;

      window.requestAnimationFrame(() => {
        setIsScrolled(window.scrollY > 12);
        ticking = false;
      });
    };

    handleScroll();

    window.addEventListener(
      'scroll',
      handleScroll,
      { passive: true },
    );

    return () => {
      window.removeEventListener(
        'scroll',
        handleScroll,
      );
    };
  }, []);

  /* ------------------------------------------------------------------------ */
  /* Close menus after route navigation                                       */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    setCategoryOpen(false);
    setAccountOpen(false);
    setMobileOpen(false);
    setShowSuggestions(false);
  }, [location.pathname]);

  /* ------------------------------------------------------------------------ */
  /* Escape key                                                               */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      setShowSuggestions(false);
      setCategoryOpen(false);
      setAccountOpen(false);
      setMobileOpen(false);
    };

    document.addEventListener(
      'keydown',
      handleKeyDown,
    );

    return () => {
      document.removeEventListener(
        'keydown',
        handleKeyDown,
      );
    };
  }, []);

  /* ------------------------------------------------------------------------ */
  /* Search discovery                                                         */
  /* ------------------------------------------------------------------------ */

  const primeSearchDiscovery = useCallback(() => {
    setHasSearchInteracted(true);
    setShowSuggestions(true);
  }, []);

  /* ------------------------------------------------------------------------ */
  /* Recent searches                                                          */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (!hasSearchInteracted) {
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    try {
      const stored = window.localStorage.getItem(
        RECENT_SEARCHES_KEY,
      );

      if (!stored) {
        return;
      }

      const parsed: unknown = JSON.parse(stored);

      if (!Array.isArray(parsed)) {
        return;
      }

      const cleaned = parsed
        .filter(
          (item): item is string =>
            typeof item === 'string' &&
            item.trim().length > 0,
        )
        .map((item) => item.trim())
        .slice(0, MAX_RECENT_SEARCHES);

      setRecentSearches(cleaned);
    } catch {
      setRecentSearches([]);
    }
  }, [hasSearchInteracted]);

  /* ------------------------------------------------------------------------ */
  /* Save recent search                                                       */
  /* ------------------------------------------------------------------------ */

  const saveRecentSearch = useCallback(
    (term: string) => {
      const normalized = term.trim();

      if (
        !normalized ||
        typeof window === 'undefined'
      ) {
        return;
      }

      const next = [
        normalized,
        ...recentSearches.filter(
          (item) =>
            item.toLowerCase() !==
            normalized.toLowerCase(),
        ),
      ].slice(0, MAX_RECENT_SEARCHES);

      setRecentSearches(next);

      try {
        window.localStorage.setItem(
          RECENT_SEARCHES_KEY,
          JSON.stringify(next),
        );
      } catch {
        // Ignore localStorage failures.
      }
    },
    [recentSearches],
  );

  /* ------------------------------------------------------------------------ */
  /* Trending searches                                                        */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (!hasSearchInteracted) {
      return;
    }

    if (trendingSearches.length > 0) {
      return;
    }

    let cancelled = false;

    const loadDiscovery = async () => {
      try {
        const payload =
          await getCachedClientValue(
            'header-search-discovery:v1',
            DISCOVERY_CACHE_TTL,
            async () => {
              const response = await fetch(
                '/api/search/discovery',
                {
                  cache: 'no-store',
                },
              );

              if (!response.ok) {
                throw new Error(
                  'Failed to load search discovery',
                );
              }

              return response.json();
            },
          ) as SearchDiscoveryPayload | null;

        if (
          cancelled ||
          !payload ||
          !Array.isArray(payload.trending)
        ) {
          return;
        }

        const cleaned = payload.trending
          .filter(
            (item): item is string =>
              typeof item === 'string' &&
              item.trim().length > 0,
          )
          .map((item) => item.trim())
          .slice(0, MAX_TRENDING_SEARCHES);

        setTrendingSearches(cleaned);
      } catch {
        if (!cancelled) {
          setTrendingSearches([]);
        }
      }
    };

    void loadDiscovery();

    return () => {
      cancelled = true;
    };
  }, [
    hasSearchInteracted,
    trendingSearches.length,
  ]);

  /* ------------------------------------------------------------------------ */
  /* Header categories                                                        */
  /* ------------------------------------------------------------------------ */

  const loadHeaderCategories = useCallback(() => {
    if (headerCategoriesLoaded) {
      return;
    }

    setHeaderCategoriesLoaded(true);

    void (async () => {
      try {
        const payload =
          await getCachedClientValue(
            'header-categories-tree:v1',
            CATEGORY_CACHE_TTL,
            async () => {
              const response = await fetch(
                '/api/categories/tree',
                {
                  cache: 'no-store',
                },
              );

              if (!response.ok) {
                throw new Error(
                  'Failed to load category tree',
                );
              }

              return response.json();
            },
          );

        if (!Array.isArray(payload)) {
          return;
        }

        const categories = payload
          .map(normalizeCategory)
          .filter(
            (
              item,
            ): item is HeaderCategory =>
              item !== null,
          )
          .slice(0, 8);

        if (categories.length > 0) {
          setHeaderCategories(categories);
        }
      } catch {
        // Keep fallback categories.
      }
    })();
  }, [headerCategoriesLoaded]);

  /* ------------------------------------------------------------------------ */
  /* Search suggestions                                                       */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const normalizedQuery =
      searchQuery.trim().toLowerCase();

    if (normalizedQuery.length < 2) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    const cached =
      suggestionsCacheRef.current.get(
        normalizedQuery,
      );

    if (cached) {
      setSuggestions(cached);
      setShowSuggestions(true);
      setIsSearching(false);
      return;
    }

    const requestId =
      ++searchRequestIdRef.current;

    const controller = new AbortController();

    const timer = window.setTimeout(() => {
      const fetchSuggestions = async () => {
        setIsSearching(true);

        try {
          const payload =
            await getCachedClientValue(
              `search-suggestions:${normalizedQuery}`,
              SEARCH_CACHE_TTL,
              async () => {
                const response = await fetch(
                  `/api/products/suggestions?q=${encodeURIComponent(
                    normalizedQuery,
                  )}`,
                  {
                    signal:
                      controller.signal,
                    cache: 'no-store',
                  },
                );

                if (!response.ok) {
                  throw new Error(
                    'Failed to fetch suggestions',
                  );
                }

                return response.json();
              },
            );

          if (
            controller.signal.aborted ||
            requestId !==
              searchRequestIdRef.current
          ) {
            return;
          }

          const rawSuggestions =
            Array.isArray(payload)
              ? payload
              : isRecord(payload) &&
                  Array.isArray(payload.suggestions)
                ? payload.suggestions
                : [];

          const normalizedSuggestions =
            rawSuggestions
              .map(normalizeSuggestion)
              .filter(
                (
                  item,
                ): item is SearchSuggestion =>
                  item !== null,
              )
              .slice(0, MAX_SUGGESTIONS);

          suggestionsCacheRef.current.set(
            normalizedQuery,
            normalizedSuggestions,
          );

          setSuggestions(
            normalizedSuggestions,
          );

          setShowSuggestions(
            normalizedSuggestions.length > 0,
          );
        } catch (error) {
          if (
            controller.signal.aborted ||
            (error instanceof DOMException &&
              error.name === 'AbortError')
          ) {
            return;
          }

          if (
            requestId !==
            searchRequestIdRef.current
          ) {
            return;
          }

          setSuggestions([]);
          setShowSuggestions(false);
        } finally {
          if (
            requestId ===
            searchRequestIdRef.current
          ) {
            setIsSearching(false);
          }
        }
      };

      void fetchSuggestions();
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [searchQuery]);

  /* ------------------------------------------------------------------------ */
  /* Search                                                                   */
  /* ------------------------------------------------------------------------ */

  const submitSearch = useCallback(() => {
    const normalized = searchQuery.trim();

    if (!normalized) {
      return;
    }

    saveRecentSearch(normalized);

    setShowSuggestions(false);
    setMobileOpen(false);

    navigate(
      `/search?q=${encodeURIComponent(normalized)}`,
    );
  }, [
    navigate,
    saveRecentSearch,
    searchQuery,
  ]);

  const handleSearchSubmit = (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    submitSearch();
  };

  const handleSuggestionClick = useCallback(
    (slug: string) => {
      if (!slug) {
        return;
      }

      setSearchQuery('');
      setShowSuggestions(false);
      setMobileOpen(false);

      navigate(
        `/product/${encodeURIComponent(slug)}`,
      );
    },
    [navigate],
  );

  const handleSearchTermClick = useCallback(
    (term: string) => {
      const normalized = term.trim();

      if (!normalized) {
        return;
      }

      setSearchQuery(normalized);
      saveRecentSearch(normalized);

      setShowSuggestions(false);
      setMobileOpen(false);

      navigate(
        `/search?q=${encodeURIComponent(normalized)}`,
      );
    },
    [navigate, saveRecentSearch],
  );

  /* ------------------------------------------------------------------------ */
  /* Account                                                                  */
  /* ------------------------------------------------------------------------ */

  const getDashboardPath = useCallback(() => {
    switch (user?.role) {
      case 'admin':
        return '/admin/dashboard';

      case 'seller':
        return '/seller/dashboard';

      case 'reseller':
        return '/reseller-dashboard/overview';

      default:
        return '/account/dashboard';
    }
  }, [user?.role]);

  const handleAccountClick = useCallback(() => {
    if (isAuthenticated) {
      navigate(getDashboardPath());
    } else {
      openAuth({ returnTo: location.pathname + location.search });
    }

    setMobileOpen(false);
  }, [
    getDashboardPath,
    isAuthenticated,
    navigate,
    openAuth,
    location.pathname,
    location.search,
  ]);

  const handleLogout = useCallback(() => {
    logout();

    setAccountOpen(false);
    setMobileOpen(false);
    setShowSuggestions(false);

    navigate('/');
  }, [logout, navigate]);

  const handleNotificationsClick = useCallback(() => {
    if (isAuthenticated) {
      navigate('/account/notifications');
    } else {
      openAuth({ returnTo: '/account/notifications' });
    }

    setMobileOpen(false);
  }, [isAuthenticated, navigate, openAuth]);

  /* ------------------------------------------------------------------------ */
  /* Account links                                                            */
  /* ------------------------------------------------------------------------ */

  const accountLinks = useMemo<AccountLink[]>(() => {
    if (!isAuthenticated) {
      return [
        {
          label: 'Login',
          href: '/login',
          icon: <User size={16} />,
        },
        {
          label: 'Create account',
          href: '/register',
          icon: <ArrowRight size={16} />,
        },
      ];
    }

    const ordersPath =
      user?.role === 'seller'
        ? '/seller/orders'
        : user?.role === 'admin'
          ? '/admin/orders'
          : '/account/orders';

    const settingsPath =
      user?.role === 'seller'
        ? '/seller/settings'
        : user?.role === 'admin'
          ? '/admin/settings'
          : '/account/settings';

    return [
      {
        label: 'Dashboard',
        href: getDashboardPath(),
        icon: <LayoutDashboard size={16} />,
      },
      {
        label: 'Orders',
        href: ordersPath,
        icon: <ClipboardList size={16} />,
      },
      {
        label: 'Wishlist',
        href: '/wishlist',
        icon: <Heart size={16} />,
      },
      {
        label: 'Settings',
        href: settingsPath,
        icon: <Settings size={16} />,
      },
    ];
  }, [
    getDashboardPath,
    isAuthenticated,
    user?.role,
  ]);

  /* ------------------------------------------------------------------------ */
  /* Mobile sections                                                          */
  /* ------------------------------------------------------------------------ */

  const mobileSections = useMemo<MobileSection[]>(
    () => [
      {
        title: 'Shopping',
        links: [
          {
            label: 'Shop all',
            href: '/shop',
          },
          {
            label: 'Categories',
            href: '/categories',
          },
          {
            label: 'Cart',
            href: '/cart',
          },
          {
            label: 'Wishlist',
            href: '/wishlist',
          },
        ],
      },
      {
        title: 'Account',
        links: accountLinks.map(
          ({ label, href }) => ({
            label,
            href,
          }),
        ),
      },
      {
        title: 'Offers',
        links: [
          {
            label: 'Flash Sale',
            href: '/flash-sale',
          },
        ],
      },
      {
        title: 'Support',
        links: [
          {
            label: 'Track order',
            href: '/track',
          },
          {
            label: 'Help Center',
            href: '/help',
          },
          {
            label: 'Contact',
            href: '/contact',
          },
        ],
      },
    ],
    [
      accountLinks,
    ],
  );

  /* ------------------------------------------------------------------------ */
  /* Search dropdown component                                                */
  /* ------------------------------------------------------------------------ */

  const renderSearchDropdown = (
    mobile = false,
  ) => {
    const queryLength =
      searchQuery.trim().length;

    const showProductSuggestions =
      showSuggestions &&
      queryLength >= 2 &&
      suggestions.length > 0;

    const showDiscovery =
      showSuggestions &&
      queryLength < 2 &&
      (recentSearches.length > 0 ||
        trendingSearches.length > 0);

    if (
      !showProductSuggestions &&
      !showDiscovery
    ) {
      return null;
    }

    return (
      <div
        className={`absolute left-0 right-0 z-[70] mt-2 overflow-hidden rounded-2xl border border-black/5 bg-white shadow-2xl ${
          mobile
            ? 'top-full'
            : 'top-full'
        }`}
      >
        {showProductSuggestions ? (
          <div className="max-h-[min(70vh,28rem)] overflow-y-auto py-2">
            {suggestions.map((item) => {
              const image =
                item.image ||
                item.image_url ||
                item.thumbnail ||
                item.thumbnail_url;

              const price =
                item.sale_price ??
                item.price;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    handleSuggestionClick(
                      item.slug,
                    )
                  }
                  className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {image ? (
                      <img
                        src={image}
                        alt=""
                        className="h-11 w-11 shrink-0 rounded-xl border border-slate-100 object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Search size={16} />
                      </span>
                    )}

                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-foreground">
                        {item.name}
                      </p>

                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {item.category ||
                            'Product'}
                        </span>

                        {price !== null &&
                        price !== undefined &&
                        price !== '' ? (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                            ৳
                            {Number(
                              price,
                            ).toLocaleString(
                              'en-BD',
                            )}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <AnimatedIcon
                    loop="none"
                    className="shrink-0 text-muted-foreground/50 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
                  >
                    <ArrowRight size={14} />
                  </AnimatedIcon>
                </button>
              );
            })}

            <button
              type="button"
              onClick={submitSearch}
              className="w-full border-t border-slate-100 bg-primary/5 px-5 py-3 text-left text-xs font-bold text-primary transition-colors hover:bg-primary/10"
            >
              View all results for "
              {searchQuery}"
            </button>
          </div>
        ) : null}

        {showDiscovery ? (
          <div className="max-h-[min(60vh,24rem)] overflow-y-auto">
            {recentSearches.length > 0 ? (
              <div className="border-b border-slate-100 px-5 py-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  Recent searches
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {recentSearches.map(
                    (term) => (
                      <button
                        key={`recent-${term}`}
                        type="button"
                        onClick={() =>
                          handleSearchTermClick(
                            term,
                          )
                        }
                        className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        {term}
                      </button>
                    ),
                  )}
                </div>
              </div>
            ) : null}

            {trendingSearches.length > 0 ? (
              <div className="px-5 py-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  Trending now
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {trendingSearches.map(
                    (term) => (
                      <button
                        key={`trending-${term}`}
                        type="button"
                        onClick={() =>
                          handleSearchTermClick(
                            term,
                          )
                        }
                        className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        {term}
                      </button>
                    ),
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <header
      className={`glass-nav ${
        isScrolled
          ? 'glass-nav--scrolled'
          : ''
      }`}
    >
      <div className="page-shell w-full px-3 sm:px-5 lg:px-8">
        {/* ---------------------------------------------------------------- */}
        {/* Main header                                                        */}
        {/* ---------------------------------------------------------------- */}

        <div
          className={[
            'flex items-center gap-2 transition-[height] duration-200',
            'h-16',
            isScrolled
              ? 'lg:h-16'
              : 'lg:h-20',
          ].join(' ')}
        >
          {/* Logo */}
          <Link
            to="/"
            className="flex shrink-0 items-center"
            aria-label="LofiMart home"
          >
            <span className="font-display text-lg font-bold text-primary sm:text-xl lg:text-2xl">
              Lofi
              <span className="text-accent">
                Mart
              </span>
            </span>
          </Link>

          {/* -------------------------------------------------------------- */}
          {/* Mobile / tablet search                                           */}
          {/* -------------------------------------------------------------- */}

          <div
            ref={mobileSearchRef}
            className="relative min-w-0 flex-1 lg:hidden"
          >
            <form
              onSubmit={handleSearchSubmit}
              className="w-full"
            >
              <div className="relative">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) =>
                    setSearchQuery(
                      event.target.value,
                    )
                  }
                  onFocus={
                    primeSearchDiscovery
                  }
                  placeholder="Search products..."
                  autoComplete="off"
                  enterKeyHint="search"
                  aria-label="Search products"
                  className="w-full rounded-full border border-black/5 bg-white/95 py-2.5 pl-3.5 pr-11 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 sm:py-3 sm:pl-4"
                />

                <button
                  type="submit"
                  aria-label="Search"
                  disabled={
                    isSearching &&
                    searchQuery.trim()
                      .length < 2
                  }
                  className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSearching ? (
                    <Loader2
                      size={15}
                      className="animate-spin"
                    />
                  ) : (
                    <Search size={15} />
                  )}
                </button>
              </div>
            </form>

            {renderSearchDropdown(true)}
          </div>

          {/* -------------------------------------------------------------- */}
          {/* Desktop search                                                    */}
          {/* -------------------------------------------------------------- */}

          <div
            ref={searchRef}
            className="relative mx-3 hidden min-w-0 flex-1 lg:flex xl:mx-6"
          >
            <form
              onSubmit={handleSearchSubmit}
              className="w-full"
            >
              <div className="relative w-full">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) =>
                    setSearchQuery(
                      event.target.value,
                    )
                  }
                  onFocus={
                    primeSearchDiscovery
                  }
                  placeholder="Search products, brands, categories..."
                  autoComplete="off"
                  aria-label="Search products, brands and categories"
                  className="w-full rounded-full border border-transparent bg-bg-light py-2.5 pl-5 pr-12 text-sm outline-none transition-all focus:border-primary/20 focus:ring-2 focus:ring-primary/20"
                />

                <button
                  type="submit"
                  aria-label="Search"
                  className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary-dark"
                >
                  {isSearching ? (
                    <Loader2
                      size={18}
                      className="animate-spin"
                    />
                  ) : (
                    <AnimatedIcon loop="pulse">
                      <Search size={18} />
                    </AnimatedIcon>
                  )}
                </button>
              </div>
            </form>

            {renderSearchDropdown()}
          </div>

          {/* -------------------------------------------------------------- */}
          {/* Desktop navigation                                               */}
          {/* -------------------------------------------------------------- */}

          <nav
            className="hidden shrink-0 items-center gap-5 xl:flex 2xl:gap-7"
            aria-label="Main navigation"
          >
            <Link
              to="/shop"
              className="whitespace-nowrap text-sm font-bold text-foreground/80 transition-colors hover:text-primary"
            >
              Shop
            </Link>

            <div
              ref={categoryRef}
              className="relative"
              onMouseEnter={() => {
                loadHeaderCategories();
                setCategoryOpen(true);
              }}
              onMouseLeave={() =>
                setCategoryOpen(false)
              }
              onFocusCapture={
                loadHeaderCategories
              }
            >
              <button
                type="button"
                onClick={() => {
                  loadHeaderCategories();
                  setCategoryOpen(
                    (current) => !current,
                  );
                }}
                className="flex items-center gap-1 whitespace-nowrap text-sm font-bold text-foreground/80 transition-colors hover:text-primary focus:outline-none"
                aria-expanded={categoryOpen}
                aria-haspopup="menu"
              >
                Categories

                <ChevronDown
                  size={14}
                  className={`transition-transform ${
                    categoryOpen
                      ? 'rotate-180'
                      : ''
                  }`}
                />
              </button>

              <div
                className={`absolute left-1/2 top-full z-[60] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 pt-2 transition-all ${
                  categoryOpen
                    ? 'visible translate-y-0 opacity-100'
                    : 'invisible -translate-y-1 opacity-0'
                }`}
              >
                <div className="max-h-[min(76vh,31rem)] overflow-y-auto overflow-x-hidden rounded-2xl border border-black/5 bg-white shadow-2xl">
                  <div className="grid gap-0 md:grid-cols-[1.05fr_0.95fr]">
                    {/* Top categories */}
                    <div className="border-b border-slate-100 p-3 md:border-b-0 md:border-r">
                      <div className="mb-2 flex items-center justify-between px-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                          Top categories
                        </p>

                        <Link
                          to="/categories"
                          onClick={() =>
                            setCategoryOpen(
                              false,
                            )
                          }
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          View all
                        </Link>
                      </div>

                      <div className="grid gap-1">
                        {headerCategories
                          .slice(0, 5)
                          .map(
                            (category) => (
                              <Link
                                key={
                                  category.id
                                }
                                to={`/shop?category=${encodeURIComponent(
                                  category.name,
                                )}`}
                                onClick={() =>
                                  setCategoryOpen(
                                    false,
                                  )
                                }
                                className="flex items-center justify-between rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950"
                              >
                                <span className="truncate">
                                  {
                                    category.name
                                  }
                                </span>

                                <ArrowRight
                                  size={14}
                                  className="shrink-0 text-slate-400"
                                />
                              </Link>
                            ),
                          )}
                      </div>
                    </div>

                    {/* Quick picks */}
                    <div className="bg-slate-50/80 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                        Quick picks
                      </p>

                      <div className="mt-2 space-y-2">
                        {headerCategories
                          .slice(0, 2)
                          .map(
                            (category) => (
                              <div
                                key={`${category.id}-sub`}
                                className="rounded-xl border border-slate-200 bg-white p-3"
                              >
                                <Link
                                  to={`/shop?category=${encodeURIComponent(
                                    category.name,
                                  )}`}
                                  onClick={() =>
                                    setCategoryOpen(
                                      false,
                                    )
                                  }
                                  className="text-[13px] font-bold text-slate-950 hover:text-primary"
                                >
                                  {
                                    category.name
                                  }
                                </Link>

                                {category
                                  .subcategories
                                  ?.length ? (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {category.subcategories
                                      .slice(
                                        0,
                                        2,
                                      )
                                      .map(
                                        (
                                          subcategory,
                                        ) => (
                                          <Link
                                            key={
                                              subcategory.id
                                            }
                                            to={`/shop?category=${encodeURIComponent(
                                              category.name,
                                            )}&subcategory=${encodeURIComponent(
                                              subcategory.name,
                                            )}`}
                                            onClick={() =>
                                              setCategoryOpen(
                                                false,
                                              )
                                            }
                                            className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-200"
                                          >
                                            {
                                              subcategory.name
                                            }
                                          </Link>
                                        ),
                                      )}
                                  </div>
                                ) : null}
                              </div>
                            ),
                          )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Link
              to="/flash-sale"
              className="whitespace-nowrap text-sm font-bold text-foreground/80 transition-colors hover:text-primary"
            >
              Flash Sale
            </Link>

            <Link
              to="/blog"
              className="whitespace-nowrap text-sm font-bold text-foreground/80 transition-colors hover:text-primary"
            >
              Blog
            </Link>
          </nav>

          {/* -------------------------------------------------------------- */}
          {/* Actions                                                          */}
          {/* -------------------------------------------------------------- */}

          <div className="ml-auto flex shrink-0 items-center gap-3 sm:gap-4 lg:gap-5">
            {/* Mobile notification */}
            <button
              type="button"
              onClick={
                handleNotificationsClick
              }
              className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-primary/5 hover:text-primary lg:hidden"
              aria-label="Open notifications"
            >
              <AnimatedIcon glow>
                <Bell size={20} />
              </AnimatedIcon>
            </button>

            {/* Desktop wishlist */}
            <Link
              to="/wishlist"
              className="relative hidden h-9 w-9 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-primary/5 hover:text-primary lg:inline-flex"
              aria-label={`Wishlist${
                wishlistItems.length > 0
                  ? `, ${wishlistItems.length} items`
                  : ''
              }`}
            >
              <AnimatedIcon glow>
                <Heart size={22} />
              </AnimatedIcon>

              {wishlistItems.length > 0 ? (
                <AnimatedBadge className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-accent px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                  {wishlistItems.length >
                  99
                    ? '99+'
                    : wishlistItems.length}
                </AnimatedBadge>
              ) : null}
            </Link>

            {/* Cart */}
            <Link
              to="/cart"
              className="relative flex h-9 w-9 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-primary/5 hover:text-primary"
              aria-label={`Cart${
                totalItems > 0
                  ? `, ${totalItems} items`
                  : ''
              }`}
            >
              <AnimatedIcon glow>
                <ShoppingCart
                  size={22}
                />
              </AnimatedIcon>

              {totalItems > 0 ? (
                <AnimatedBadge className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-accent px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                  {totalItems > 99
                    ? '99+'
                    : totalItems}
                </AnimatedBadge>
              ) : null}
            </Link>

            {/* Desktop account */}
            <div
              ref={accountRef}
              className="relative hidden lg:block"
              onMouseEnter={() =>
                setAccountOpen(true)
              }
              onMouseLeave={() =>
                setAccountOpen(false)
              }
              onFocusCapture={() =>
                setAccountOpen(true)
              }
            >
              <button
                type="button"
                onClick={() =>
                  setAccountOpen(
                    (current) =>
                      !current,
                  )
                }
                className="flex h-9 items-center gap-1 rounded-full px-1 text-foreground/70 transition-colors hover:text-primary focus:outline-none"
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                aria-label="Account menu"
              >
                <AnimatedIcon glow>
                  <User size={22} />
                </AnimatedIcon>

                <ChevronDown
                  size={13}
                  className={`transition-transform ${
                    accountOpen
                      ? 'rotate-180'
                      : ''
                  }`}
                />
              </button>

              <div
                className={`absolute right-0 top-full z-[60] w-64 pt-2 transition-all ${
                  accountOpen
                    ? 'visible translate-y-0 opacity-100'
                    : 'invisible -translate-y-1 opacity-0'
                }`}
              >
                <div className="overflow-hidden rounded-2xl border border-black/5 bg-white text-slate-800 shadow-2xl">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="truncate text-sm font-bold text-slate-950">
                      {isAuthenticated
                        ? user?.name ||
                          'My account'
                        : 'Welcome to LofiMart'}
                    </p>

                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {isAuthenticated
                        ? user?.email ||
                          user?.role ||
                          'Account'
                        : 'Sign in or create an account'}
                    </p>
                  </div>

                  <div className="p-2">
                    {accountLinks.map(
                      (item) => (
                        <Link
                          key={item.href}
                          to={item.href}
                          onClick={() =>
                            setAccountOpen(
                              false,
                            )
                          }
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-primary"
                        >
                          {item.icon}
                          {item.label}
                        </Link>
                      ),
                    )}

                    {isAuthenticated ? (
                      <button
                        type="button"
                        onClick={
                          handleLogout
                        }
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
                      >
                        <LogOut
                          size={16}
                        />
                        Logout
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile menu */}
            <button
              type="button"
              onClick={() =>
                setMobileOpen(
                  (current) =>
                    !current,
                )
              }
              className="flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-primary/5 hover:text-primary lg:hidden"
              aria-label={
                mobileOpen
                  ? 'Close menu'
                  : 'Open menu'
              }
              aria-expanded={
                mobileOpen
              }
            >
              <AnimatedIcon>
                {mobileOpen ? (
                  <X size={24} />
                ) : (
                  <Menu size={24} />
                )}
              </AnimatedIcon>
            </button>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* Mobile navigation                                                     */}
      {/* -------------------------------------------------------------------- */}

      <div
        className={`border-t border-border bg-card/98 shadow-xl backdrop-blur lg:hidden ${
          mobileOpen
            ? 'block'
            : 'hidden'
        }`}
      >
        <div className="max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">
          {/* Quick actions */}
          <div className="mb-4 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={
                handleAccountClick
              }
              className="flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-100 bg-white px-2 py-3 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-primary"
            >
              <User size={18} />
              <span>Account</span>
            </button>

            <Link
              to="/wishlist"
              onClick={() =>
                setMobileOpen(false)
              }
              className="flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-100 bg-white px-2 py-3 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-primary"
            >
              <div className="relative">
                <Heart size={18} />

                {wishlistItems.length >
                0 ? (
                  <span className="absolute -right-2 -top-2 min-w-[16px] rounded-full bg-accent px-1 text-center text-[9px] font-bold text-white">
                    {wishlistItems.length >
                    99
                      ? '99+'
                      : wishlistItems.length}
                  </span>
                ) : null}
              </div>

              <span>Wishlist</span>
            </Link>

            <Link
              to="/cart"
              onClick={() =>
                setMobileOpen(false)
              }
              className="flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-100 bg-white px-2 py-3 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-primary"
            >
              <div className="relative">
                <ShoppingCart
                  size={18}
                />

                {totalItems > 0 ? (
                  <span className="absolute -right-2 -top-2 min-w-[16px] rounded-full bg-accent px-1 text-center text-[9px] font-bold text-white">
                    {totalItems > 99
                      ? '99+'
                      : totalItems}
                  </span>
                ) : null}
              </div>

              <span>Cart</span>
            </Link>
          </div>

          {/* Sections */}
          <div className="space-y-3">
            {mobileSections.map(
              (section) => (
                <section
                  key={section.title}
                  className="rounded-2xl border border-slate-100 bg-white p-2.5 shadow-sm"
                >
                  <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    {section.title}
                  </p>

                  <div className="grid grid-cols-2 gap-1">
                    {section.links.map(
                      (item) => (
                        <Link
                          key={`${section.title}-${item.href}`}
                          to={item.href}
                          onClick={() =>
                            setMobileOpen(
                              false,
                            )
                          }
                          className="rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-primary active:bg-slate-100"
                        >
                          {item.label}
                        </Link>
                      ),
                    )}
                  </div>
                </section>
              ),
            )}
          </div>

          {/* Notifications */}
          <button
            type="button"
            onClick={
              handleNotificationsClick
            }
            className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-primary"
          >
            <Bell size={17} />
            Notifications
          </button>

          {/* Logout */}
          {isAuthenticated ? (
            <button
              type="button"
              onClick={
                handleLogout
              }
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-600 transition-colors hover:bg-red-100"
            >
              <LogOut size={16} />
              Logout
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
};

export default Header;