import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from '../../../lib/navigation';
import {
  ArrowRight,
  ArrowUp,
  Banknote,
  Bell,
  Boxes,
  ChevronDown,
  ClipboardList,
  CircleDollarSign,
  CreditCard,
  Facebook,
  Heart,
  Home,
  Instagram,
  LayoutDashboard,
  LogOut,
  Loader2,
  Mail,
  MapPin,
  Menu,
  Music,
  Package2,
  PackageCheck,
  Phone,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Truck,
  User,
  Wallet,
  X,
  Youtube,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useCart } from '../../../features/shop/state/CartContext';
import { useUser } from '../../../features/shared/state/UserContext';
import { useWishlist } from '../../../features/shop/state/WishlistContext';
import { AnimatedBadge, AnimatedIcon } from '../../../components/ui/AnimatedIcon';
import { filterRoleAwareLinks, type NavigationRole, type RoleAwareLink } from '../../../lib/role-navigation';
import { getCachedClientValue } from '../../../lib/client-cache';
import { usePWAInstall } from '../../../hooks/usePWAInstall';

type HeaderSubcategory = {
  id: string | number;
  name: string;
};

type HeaderCategory = {
  id: string | number;
  name: string;
  subcategories?: HeaderSubcategory[];
};

const headerCategoryFallbacks: HeaderCategory[] = [
  { id: 'fashion', name: 'Fashion', subcategories: [{ id: 'fashion-women', name: 'Women' }, { id: 'fashion-men', name: 'Men' }] },
  { id: 'electronics', name: 'Electronics', subcategories: [{ id: 'electronics-mobile', name: 'Mobiles' }, { id: 'electronics-audio', name: 'Audio' }] },
  { id: 'home', name: 'Home & Living', subcategories: [{ id: 'home-decor', name: 'Decor' }, { id: 'home-kitchen', name: 'Kitchen' }] },
  { id: 'beauty', name: 'Beauty', subcategories: [{ id: 'beauty-skincare', name: 'Skincare' }, { id: 'beauty-makeup', name: 'Makeup' }] },
  { id: 'grocery', name: 'Groceries', subcategories: [{ id: 'grocery-fresh', name: 'Fresh foods' }, { id: 'grocery-pantry', name: 'Pantry' }] },
  { id: 'sports', name: 'Sports', subcategories: [{ id: 'sports-fitness', name: 'Fitness' }, { id: 'sports-outdoor', name: 'Outdoor' }] },
];

const discoverLinks: RoleAwareLink[] = [
  { href: '/explore', label: 'Explore Hub', visibleTo: ['guest', 'customer', 'seller', 'reseller', 'admin'] },
  { href: '/style-quiz', label: 'Style Quiz', visibleTo: ['guest', 'customer', 'seller', 'reseller', 'admin'] },
  { href: '/bazaar', label: 'Bazaar Hub', visibleTo: ['guest', 'customer', 'seller', 'reseller', 'admin'] },
  { href: '/shop', label: 'Shop', visibleTo: ['guest', 'customer', 'seller', 'reseller', 'admin'] },
  { href: '/categories', label: 'Categories', visibleTo: ['guest', 'customer', 'seller', 'reseller', 'admin'] },
  { href: '/flash-sale', label: 'Flash Sale', visibleTo: ['guest', 'customer', 'seller', 'reseller', 'admin'] },
  { href: '/community', label: 'Community', visibleTo: ['guest', 'customer', 'seller', 'reseller', 'admin'] },
  { href: '/wishlist', label: 'Wishlist', visibleTo: ['customer'] },
  { href: '/cart', label: 'Cart', visibleTo: ['customer'] },
  { href: '/checkout', label: 'Checkout', visibleTo: ['customer'] },
  { href: '/ai-features', label: 'AI Features', visibleTo: ['guest', 'customer', 'seller', 'reseller', 'admin'] },
  { href: '/animations', label: 'Motion Library', visibleTo: ['admin', 'seller', 'reseller'] },
  { href: '/product-3d', label: '3D Product Hub', visibleTo: ['guest', 'customer', 'seller', 'reseller', 'admin'] },
  { href: '/ar-tryon', label: 'AR Try-On', visibleTo: ['guest', 'customer', 'seller', 'reseller', 'admin'] },
  { href: '/room-visualizer', label: 'Room Visualizer', visibleTo: ['guest', 'customer', 'seller', 'reseller', 'admin'] },
  { href: '/pwa', label: 'PWA Experience', visibleTo: ['guest', 'customer', 'seller', 'reseller', 'admin'] },
];

const bazaarLinks: RoleAwareLink[] = [
  { href: '/bazaar', label: 'Bazaar Hub', visibleTo: ['guest', 'customer', 'seller', 'reseller', 'admin'] },
  { href: '/bazaar/aigiftfinder', label: 'AI Gift Finder', visibleTo: ['guest', 'customer', 'seller', 'reseller', 'admin'] },
  { href: '/bazaar/liveconcierge', label: 'Live Concierge', visibleTo: ['guest', 'customer', 'seller', 'reseller', 'admin'] },
  { href: '/bazaar/affiliate-catalog', label: 'Affiliate Catalog', visibleTo: ['seller', 'reseller', 'admin'] },
  { href: '/bazaar/reseller-discovery', label: 'Reseller Discovery', visibleTo: ['reseller', 'seller', 'admin'] },
  { href: '/bazaar/loyalty-rewards', label: 'Loyalty Rewards', visibleTo: ['guest', 'customer', 'reseller', 'admin'] },
];

export const Header = () => {
  const RECENT_SEARCHES_KEY = 'amarshop_recent_searches';
  const { totalItems } = useCart();
  const { user, isAuthenticated, logout } = useUser();
  const { items: wishlistItems } = useWishlist();
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [trendingSearches, setTrendingSearches] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearchInteracted, setHasSearchInteracted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [headerCategories, setHeaderCategories] = useState<HeaderCategory[]>(headerCategoryFallbacks);
  const [headerCategoriesLoaded, setHeaderCategoriesLoaded] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const categoryRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const suggestionsCacheRef = useRef<Map<string, any[]>>(new Map());
  const navigate = useNavigate();
  const location = useLocation();
  const navigationRole: NavigationRole = isAuthenticated ? (user?.role ?? 'customer') : 'guest';
  const visibleBazaarLinks = useMemo(() => filterRoleAwareLinks(bazaarLinks, navigationRole), [navigationRole]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
      if (categoryRef.current && !categoryRef.current.contains(event.target as Node)) {
        setCategoryOpen(false);
      }
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 12);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setCategoryOpen(false);
    setAccountOpen(false);
    setMobileOpen(false);
    setShowSuggestions(false);
  }, [location.pathname]);

  const primeSearchDiscovery = React.useCallback(() => {
    setHasSearchInteracted(true);
    setShowSuggestions(true);
  }, []);

  useEffect(() => {
    if (!hasSearchInteracted || typeof window === 'undefined') return;

    try {
      const stored = window.localStorage.getItem(RECENT_SEARCHES_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setRecentSearches(parsed.filter((item): item is string => typeof item === 'string').slice(0, 6));
      }
    } catch {
      setRecentSearches([]);
    }
  }, [hasSearchInteracted]);

  useEffect(() => {
    if (!hasSearchInteracted || trendingSearches.length > 0) return;

    let cancelled = false;

    const loadDiscovery = async () => {
      try {
        const payload = await getCachedClientValue('header-search-discovery:v1', 10 * 60 * 1000, async () => {
          const response = await fetch('/api/search/discovery', { cache: 'no-store' });
          if (!response.ok) {
            throw new Error('Failed to load search discovery');
          }
          return response.json().catch(() => null);
        });
        if (!cancelled && Array.isArray(payload?.trending)) {
          setTrendingSearches(payload.trending.filter((item: unknown): item is string => typeof item === 'string').slice(0, 8));
        }
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
  }, [hasSearchInteracted, trendingSearches.length]);

  const loadHeaderCategories = React.useCallback(() => {
    if (headerCategoriesLoaded) {
      return;
    }

    setHeaderCategoriesLoaded(true);
    let cancelled = false;

    const loadCategories = async () => {
      try {
        const payload = await getCachedClientValue('header-categories-tree:v1', 15 * 60 * 1000, async () => {
          const response = await fetch('/api/categories/tree', { cache: 'no-store' });
          if (!response.ok) {
            throw new Error('Failed to load category tree');
          }
          return response.json().catch(() => null);
        });
        if (!cancelled && Array.isArray(payload) && payload.length > 0) {
          setHeaderCategories(
            payload
              .filter((category: unknown): category is HeaderCategory => {
                return typeof category === 'object' && category !== null && 'name' in category;
              })
              .slice(0, 8),
          );
        }
      } catch {
        // Keep the curated fallback categories in the header menu.
      }
    };

    void loadCategories();

    return () => {
      cancelled = true;
    };
  }, [headerCategoriesLoaded]);

  const saveRecentSearch = (term: string) => {
    const normalized = term.trim();
    if (!normalized || typeof window === 'undefined') return;

    const next = [normalized, ...recentSearches.filter((item) => item.toLowerCase() !== normalized.toLowerCase())].slice(0, 6);
    setRecentSearches(next);
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  };

  useEffect(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (normalizedQuery.length < 2) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    const cached = suggestionsCacheRef.current.get(normalizedQuery);
    if (cached) {
      setSuggestions(cached);
      setShowSuggestions(true);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();

    const fetchSuggestions = async () => {
      setIsSearching(true);

      try {
        const data = await getCachedClientValue(`search-suggestions:${normalizedQuery}`, 2 * 60 * 1000, async () => {
          const res = await fetch(`/api/products/suggestions?q=${encodeURIComponent(normalizedQuery)}`, {
            signal: controller.signal,
            cache: 'no-store',
          });

          if (!res.ok) {
            throw new Error('Failed to fetch suggestions');
          }

          return res.json();
        });
        suggestionsCacheRef.current.set(normalizedQuery, data);
        setSuggestions(data);
        setShowSuggestions(true);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      } finally {
        setIsSearching(false);
      }
    };

    const debounceTimer = setTimeout(fetchSuggestions, 300);
    return () => {
      controller.abort();
      clearTimeout(debounceTimer);
    };
  }, [searchQuery]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      saveRecentSearch(searchQuery);
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (slug: string) => {
    navigate(`/product/${slug}`);
    setSearchQuery('');
    setShowSuggestions(false);
  };

  const getDashboardPath = () => {
    if (user?.role === 'admin') return '/admin/dashboard';
    if (user?.role === 'seller') return '/seller/dashboard';
    if (user?.role === 'reseller') return '/reseller-dashboard/overview';
    return '/account/dashboard';
  };

  const handleAccountClick = () => {
    if (isAuthenticated) {
      navigate(getDashboardPath());
    } else {
      navigate('/login');
    }
    setMobileOpen(false);
  };

  const handleLogout = () => {
    logout();
    setAccountOpen(false);
    setMobileOpen(false);
    navigate('/');
  };

  const handleMobileNotificationsClick = () => {
    if (isAuthenticated) {
      navigate('/account/notifications');
    } else {
      navigate('/login?redirect=/account/notifications');
    }
  };

  const accountLinks = isAuthenticated
    ? [
        { label: 'Dashboard', href: getDashboardPath(), icon: <LayoutDashboard size={16} /> },
        { label: 'Orders', href: user?.role === 'seller' ? '/seller/orders' : user?.role === 'admin' ? '/admin/orders' : '/account/orders', icon: <ClipboardList size={16} /> },
        { label: 'Wishlist', href: '/wishlist', icon: <Heart size={16} /> },
        { label: 'Settings', href: user?.role === 'seller' ? '/seller/settings' : user?.role === 'admin' ? '/admin/settings' : '/account/settings', icon: <Settings size={16} /> },
      ]
    : [
        { label: 'Login', href: '/login', icon: <User size={16} /> },
        { label: 'Create account', href: '/register', icon: <ArrowRight size={16} /> },
      ];

  const mobileSections = [
    {
      title: 'Shopping',
      links: [
        { label: 'Shop all', href: '/shop' },
        { label: 'Categories', href: '/categories' },
        { label: 'Cart', href: '/cart' },
        { label: 'Wishlist', href: '/wishlist' },
      ],
    },
    {
      title: 'Account',
      links: accountLinks.map((item) => ({ label: item.label, href: item.href })),
    },
    {
      title: 'Offers',
      links: [
        { label: 'Flash Sale', href: '/flash-sale' },
        ...visibleBazaarLinks.slice(0, 2).map((item) => ({ label: item.label, href: item.href })),
      ],
    },
    {
      title: 'Support',
      links: [
        { label: 'Track order', href: '/track' },
        { label: 'Help Center', href: '/help' },
        { label: 'Contact', href: '/contact' },
      ],
    },
  ];

  return (
    <header className={`glass-nav ${isScrolled ? 'glass-nav--scrolled' : ''}`}>
      <div className="page-shell sm:px-6 lg:px-8">
        <div className={`flex h-16 items-center justify-between gap-3 transition-[height] duration-200 ${isScrolled ? 'md:h-16' : 'md:h-20'}`}>
          <Link to="/" className="flex flex-shrink-0 items-center">
            <span className="font-display text-lg font-bold text-primary sm:text-xl md:text-2xl">
              Lofi<span className="text-accent">Mart</span>
            </span>
          </Link>

          <div className="mx-1 flex min-w-0 flex-1 md:hidden">
            <form onSubmit={handleSearch} className="w-full">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={primeSearchDiscovery}
                  placeholder="Search products..."
                  className="w-full rounded-2xl border border-black/5 bg-white/95 py-2.5 pl-3.5 pr-10 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
                <button
                  type="submit"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-xl bg-primary p-1.5 text-white transition-colors hover:bg-primary-dark"
                >
                  {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                </button>
              </div>
            </form>
          </div>

          <div ref={searchRef} className="relative mx-4 hidden min-w-0 max-w-lg flex-1 md:flex lg:mx-8">
            <form onSubmit={handleSearch} className="w-full">
              <div className="relative w-full">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={primeSearchDiscovery}
                  placeholder="Search products, brands, categories..."
                  className="w-full rounded-full border-none bg-bg-light py-2.5 pl-5 pr-12 transition-all focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-primary p-1.5 text-white transition-colors hover:bg-primary-dark"
                >
                  {isSearching ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <AnimatedIcon loop="pulse">
                      <Search size={18} />
                    </AnimatedIcon>
                  )}
                </button>
              </div>
            </form>

            {showSuggestions && searchQuery.trim().length >= 2 && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-black/5 bg-white shadow-xl">
                <div className="max-h-[min(72vh,28rem)] overflow-y-auto py-2">
                  {suggestions.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleSuggestionClick(item.slug)}
                      className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/60"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        {item.image || item.image_url || item.thumbnail || item.thumbnail_url ? (
                          <img
                            src={item.image || item.image_url || item.thumbnail || item.thumbnail_url}
                            alt=""
                            className="h-11 w-11 shrink-0 rounded-xl border border-slate-100 object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <Search size={16} />
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-foreground">{item.name}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.category || 'Product'}</span>
                            {item.price || item.sale_price ? (
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                                ৳{Number(item.sale_price || item.price).toLocaleString('en-BD')}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <AnimatedIcon
                        loop="none"
                        className="-translate-x-2 text-muted-foreground/50 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
                      >
                        <ArrowRight size={14} />
                      </AnimatedIcon>
                    </button>
                  ))}
                  <button
                    onClick={handleSearch}
                    className="w-full bg-primary/5 px-5 py-3 text-left text-xs font-bold text-primary transition-colors hover:bg-primary/10"
                  >
                    View all results for "{searchQuery}"
                  </button>
                </div>
              </div>
            )}

            {showSuggestions && searchQuery.trim().length < 2 && (recentSearches.length > 0 || trendingSearches.length > 0) && (
              <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-black/5 bg-white shadow-xl">
                {recentSearches.length > 0 ? (
                  <div className="border-b border-slate-100 px-5 py-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Recent searches</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {recentSearches.map((term) => (
                        <button
                          key={term}
                          onClick={() => {
                            setSearchQuery(term);
                            saveRecentSearch(term);
                            navigate(`/search?q=${encodeURIComponent(term)}`);
                            setShowSuggestions(false);
                          }}
                          className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                        >
                          {term}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {trendingSearches.length > 0 ? (
                  <div className="px-5 py-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Trending now</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {trendingSearches.map((term) => (
                        <button
                          key={term}
                          onClick={() => {
                            setSearchQuery(term);
                            saveRecentSearch(term);
                            navigate(`/search?q=${encodeURIComponent(term)}`);
                            setShowSuggestions(false);
                          }}
                          className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/15"
                        >
                          {term}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <nav className="mr-8 hidden items-center space-x-8 lg:flex">
            <Link to="/shop" className="text-sm font-bold text-foreground/80 transition-colors hover:text-primary">
              Shop
            </Link>
            <div
              ref={categoryRef}
              className="group relative"
              onMouseEnter={() => {
                loadHeaderCategories();
                setCategoryOpen(true);
              }}
              onMouseLeave={() => setCategoryOpen(false)}
              onFocusCapture={loadHeaderCategories}
            >
              <button
                type="button"
                onClick={() => {
                  loadHeaderCategories();
                  setCategoryOpen((current) => !current);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setCategoryOpen(false);
                }}
                className="flex items-center gap-1 text-sm font-bold text-foreground/80 transition-colors hover:text-primary"
                aria-expanded={categoryOpen}
                aria-haspopup="menu"
              >
                Categories
                <AnimatedIcon loop="none" className={`transition-transform ${categoryOpen ? 'rotate-180' : ''}`}>
                  <ChevronDown size={14} />
                </AnimatedIcon>
              </button>
              <div className={`header-category-menu absolute left-1/2 top-full z-50 mt-2 max-h-[min(76vh,31rem)] -translate-x-1/2 overflow-y-auto overflow-x-hidden rounded-2xl border border-black/5 bg-white shadow-2xl transition-all ${categoryOpen ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-1 opacity-0'}`}>
                <div className="grid gap-0 xl:grid-cols-[1.05fr_0.95fr]">
                  <div className="border-b border-slate-100 p-2.5 xl:border-b-0 xl:border-r">
                    <div className="mb-1.5 flex items-center justify-between px-2 py-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Top categories</p>
                      <Link to="/categories" className="text-xs font-semibold text-primary hover:underline">
                        View all
                      </Link>
                    </div>
                    <div className="grid gap-1">
                      {headerCategories.slice(0, 5).map((category) => (
                        <Link
                          key={category.id}
                          to={`/shop?category=${encodeURIComponent(category.name)}`}
                          onClick={() => setCategoryOpen(false)}
                          className="flex items-center justify-between rounded-xl px-2.5 py-2 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
                        >
                          <span>{category.name}</span>
                          <AnimatedIcon loop="none" className="text-slate-400">
                            <ArrowRight size={14} />
                          </AnimatedIcon>
                        </Link>
                      ))}
                    </div>
                  </div>
                  <div className="bg-slate-50/80 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Quick picks</p>
                    <div className="mt-2 space-y-2">
                      {headerCategories.slice(0, 2).map((category) => (
                        <div key={`${category.id}-sub`} className="rounded-xl border border-slate-200 bg-white p-2.5">
                          <Link
                            to={`/shop?category=${encodeURIComponent(category.name)}`}
                            onClick={() => setCategoryOpen(false)}
                            className="text-[13px] font-bold text-slate-950 hover:text-primary"
                          >
                            {category.name}
                          </Link>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {(category.subcategories || []).slice(0, 2).map((subcategory) => (
                              <Link
                                key={subcategory.id}
                                to={`/shop?category=${encodeURIComponent(category.name)}&subcategory=${encodeURIComponent(subcategory.name)}`}
                                onClick={() => setCategoryOpen(false)}
                                className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-200"
                              >
                                {subcategory.name}
                              </Link>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <Link to="/flash-sale" className="text-sm font-bold text-foreground/80 transition-colors hover:text-primary">
              Flash Sale
            </Link>
            <Link to="/blog" className="text-sm font-bold text-foreground/80 transition-colors hover:text-primary">
              Blog
            </Link>
          </nav>

          <div className="flex items-center gap-2 md:space-x-5">
            <div className="flex items-center gap-2 md:space-x-4">
              <button
                onClick={handleMobileNotificationsClick}
                className="text-foreground/70 transition-colors hover:text-primary md:hidden"
                aria-label="Open notifications"
              >
                <AnimatedIcon glow>
                  <Bell size={20} />
                </AnimatedIcon>
              </button>
              <Link to="/cart" className="relative text-foreground/70 transition-colors hover:text-primary md:hidden">
                <AnimatedIcon glow>
                  <ShoppingCart size={22} />
                </AnimatedIcon>
                {totalItems > 0 && (
                  <AnimatedBadge className="absolute -right-2 -top-2 min-w-[18px] rounded-full bg-accent px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                    {totalItems}
                  </AnimatedBadge>
                )}
              </Link>
              <Link to="/wishlist" className="relative hidden text-foreground/70 transition-colors hover:text-primary md:inline-flex">
                <AnimatedIcon glow>
                  <Heart size={24} />
                </AnimatedIcon>
                {wishlistItems.length > 0 && (
                  <AnimatedBadge className="absolute -right-2 -top-2 min-w-[18px] rounded-full bg-accent px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                    {wishlistItems.length}
                  </AnimatedBadge>
                )}
              </Link>
              <Link to="/cart" className="relative hidden text-foreground/70 transition-colors hover:text-primary md:inline-flex">
                <AnimatedIcon glow>
                  <ShoppingCart size={22} />
                </AnimatedIcon>
                {totalItems > 0 && (
                  <AnimatedBadge className="absolute -right-2 -top-2 min-w-[18px] rounded-full bg-accent px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                    {totalItems}
                  </AnimatedBadge>
                )}
              </Link>
              <div
                ref={accountRef}
                className="relative hidden md:block"
                onMouseEnter={() => setAccountOpen(true)}
                onMouseLeave={() => setAccountOpen(false)}
                onFocusCapture={() => setAccountOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setAccountOpen(false);
                }}
              >
                <button
                  type="button"
                  onClick={() => setAccountOpen((current) => !current)}
                  className="flex items-center space-x-1 text-foreground/70 transition-colors hover:text-primary"
                  aria-haspopup="menu"
                  aria-expanded={accountOpen}
                >
                  <AnimatedIcon glow>
                    <User size={22} />
                  </AnimatedIcon>
                  <ChevronDown size={13} className={`transition-transform ${accountOpen ? 'rotate-180' : ''}`} />
                </button>
                <div className={`absolute right-0 top-full z-50 mt-3 w-64 overflow-hidden rounded-2xl border border-black/5 bg-white text-slate-800 shadow-2xl transition-all ${accountOpen ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-1 opacity-0'}`}>
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="text-sm font-bold text-slate-950">{isAuthenticated ? user?.name || 'My account' : 'Welcome to LofiMart'}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{isAuthenticated ? user?.email || user?.role : 'Sign in or create an account'}</p>
                  </div>
                  <div className="p-2">
                    {accountLinks.map((item) => (
                      <Link
                        key={item.href}
                        to={item.href}
                        onClick={() => setAccountOpen(false)}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-primary"
                      >
                        {item.icon}
                        {item.label}
                      </Link>
                    ))}
                    {isAuthenticated ? (
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50"
                      >
                        <LogOut size={16} />
                        Logout
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

            </div>

            <button
              className="text-black md:hidden"
              onClick={() => setMobileOpen((state) => !state)}
              aria-label="Toggle menu"
            >
              <AnimatedIcon>
                {mobileOpen ? <X size={24} /> : <Menu size={24} />}
              </AnimatedIcon>
            </button>
          </div>
        </div>

      </div>

        <div
        className={`overflow-hidden border-t border-border bg-card/98 shadow-xl backdrop-blur transition-all duration-200 md:hidden ${
          mobileOpen ? 'max-h-[min(70vh,32rem)] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="max-h-[min(76vh,36rem)] space-y-4 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-3 gap-2">
            <button onClick={handleAccountClick} className="mobile-action-chip justify-center px-2 py-3 text-xs">
              <AnimatedIcon loop="none">
                <User size={17} />
              </AnimatedIcon>
              Account
            </button>
            <Link to="/wishlist" onClick={() => setMobileOpen(false)} className="mobile-action-chip justify-center px-2 py-3 text-xs">
              <AnimatedIcon loop="none">
                <Heart size={17} />
              </AnimatedIcon>
              Wishlist ({wishlistItems.length})
            </Link>
            <Link to="/cart" onClick={() => setMobileOpen(false)} className="mobile-action-chip justify-center px-2 py-3 text-xs">
              <AnimatedIcon loop="none">
                <ShoppingCart size={17} />
              </AnimatedIcon>
              Cart ({totalItems})
            </Link>
          </div>
          {mobileSections.map((section) => (
            <div key={section.title} className="rounded-2xl border border-slate-100 bg-white p-2.5 shadow-sm">
              <p className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{section.title}</p>
              <div className="grid grid-cols-2 gap-1">
                {section.links.map((item) => (
                  <Link
                    key={`${section.title}-${item.href}`}
                    to={item.href}
                    onClick={() => setMobileOpen(false)}
                    className="rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-primary"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
          {isAuthenticated ? (
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-600"
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

export const MobileBottomNav = () => {
  const { totalItems } = useCart();
  const { user, isAuthenticated } = useUser();
  const { items: wishlistItems } = useWishlist();
  const location = useLocation();
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let lastY = window.scrollY;

    const handleScroll = () => {
      const currentY = window.scrollY;
      const viewportHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const nearBottom = currentY + viewportHeight >= documentHeight - 96;
      const scrollingUp = currentY < lastY;
      const nearTop = currentY < 24;

      setIsVisible(nearTop || nearBottom || scrollingUp);
      lastY = currentY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const mobileQuickLinks = useMemo(() => {
    if (location.pathname.startsWith('/admin')) {
      return [
        { label: 'Dashboard', path: '/admin/dashboard', icon: <LayoutDashboard size={18} /> },
        { label: 'Orders', path: '/admin/orders', icon: <ClipboardList size={18} /> },
        { label: 'Inventory', path: '/admin/inventory', icon: <Boxes size={18} /> },
        { label: 'POS', path: '/admin/pos', icon: <CircleDollarSign size={18} /> },
        { label: 'Settings', path: '/admin/settings', icon: <Settings size={18} /> },
      ];
    }

    if (location.pathname.startsWith('/seller')) {
      return [
        { label: 'Overview', path: '/seller/dashboard', icon: <LayoutDashboard size={18} /> },
        { label: 'Products', path: '/seller/products', icon: <Package2 size={18} /> },
        { label: 'Orders', path: '/seller/orders', icon: <ClipboardList size={18} /> },
        { label: 'Courier', path: '/seller/courier', icon: <Truck size={18} /> },
        { label: 'Earnings', path: '/seller/earnings', icon: <Wallet size={18} /> },
      ];
    }

    if (location.pathname.startsWith('/reseller-dashboard')) {
      return [
        { label: 'Overview', path: '/reseller-dashboard/overview', icon: <LayoutDashboard size={18} /> },
        { label: 'Shop', path: '/reseller-dashboard/shop', icon: <Package2 size={18} /> },
        { label: 'Orders', path: '/reseller-dashboard/manual-orders', icon: <ClipboardList size={18} /> },
        { label: 'Earnings', path: '/reseller-dashboard/earnings', icon: <Wallet size={18} /> },
        { label: 'Settings', path: '/reseller-dashboard/settings', icon: <Settings size={18} /> },
      ];
    }

    if (location.pathname.startsWith('/account')) {
      return [
        { label: 'Home', path: '/account/dashboard', icon: <LayoutDashboard size={18} /> },
        { label: 'Orders', path: '/account/orders', icon: <ClipboardList size={18} /> },
        { label: 'Wishlist', path: '/account/wishlist', icon: <Heart size={18} /> },
        { label: 'Wallet', path: '/account/wallet', icon: <Wallet size={18} /> },
        { label: 'Settings', path: '/account/settings', icon: <Settings size={18} /> },
      ];
    }

    return [
      { label: 'Home', path: '/', icon: <Home size={18} /> },
      { label: 'Shop', path: '/shop', icon: <Package2 size={18} /> },
      { label: 'Wishlist', path: '/wishlist', icon: <Heart size={18} /> },
      { label: 'Cart', path: '/cart', icon: <ShoppingCart size={18} /> },
      {
        label: 'Account',
        path: isAuthenticated
          ? user?.role === 'admin'
            ? '/admin/dashboard'
            : user?.role === 'seller'
              ? '/seller/dashboard'
              : user?.role === 'reseller'
                ? '/reseller-dashboard/overview'
                : '/account/dashboard'
          : '/login',
        icon: <User size={18} />,
      },
    ];
  }, [isAuthenticated, location.pathname, user?.role]);

  return (
    <nav
      className={`app-bottom-nav md:hidden ${isVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-24 opacity-0'}`}
      aria-label="Mobile bottom navigation"
    >
      <div className="grid grid-cols-5 gap-1 px-2 py-2">
        {mobileQuickLinks.map((item) => {
          const active = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);
          const badgeCount =
            item.path === '/wishlist' || item.path === '/account/wishlist'
              ? wishlistItems.length
              : item.path === '/cart'
                ? totalItems
                : 0;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={active ? 'app-bottom-nav__item app-bottom-nav__item--active' : 'app-bottom-nav__item'}
            >
              <span className={active ? 'app-bottom-nav__active-dot' : 'app-bottom-nav__active-dot opacity-0'} />
              <span className={active ? 'app-bottom-nav__icon-wrap app-bottom-nav__icon-wrap--active' : 'app-bottom-nav__icon-wrap'}>
                {item.icon}
                {badgeCount > 0 ? (
                  <span className="app-bottom-nav__badge">
                    {badgeCount}
                  </span>
                ) : null}
              </span>
              <span className="app-bottom-nav__label">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

const customerServiceLinks = [
  { href: '/help', label: 'Help Center' },
  { href: '/track', label: 'Track Order' },
  { href: '/returns', label: 'Returns & Refunds' },
  { href: '/contact', label: 'Contact Us' },
];

const quickFooterLinks = [
  { href: '/about', label: 'About Us' },
  { href: '/shop', label: 'Shop All' },
  { href: '/flash-sale', label: 'Flash Sale' },
  { href: '/blog', label: 'Blog' },
  { href: '/reseller', label: 'Reseller Program', emphasis: true },
  { href: '/terms', label: 'Terms of Service' },
  { href: '/privacy', label: 'Privacy Policy' },
];

const footerSocialLinks = [
  { href: 'https://facebook.com/lofimart', label: 'Facebook', icon: <Facebook size={16} /> },
  { href: 'https://instagram.com/lofimart', label: 'Instagram', icon: <Instagram size={16} /> },
  { href: 'https://youtube.com/@lofimart', label: 'YouTube', icon: <Youtube size={16} /> },
  { href: 'https://t.me/lofimart_bot', label: 'Telegram', icon: <Send size={16} /> },
];

const paymentBadges = [
  { label: 'COD', icon: <Banknote size={14} /> },
  { label: 'bKash' },
  { label: 'Nagad' },
  { label: 'Visa' },
  { label: 'Mastercard' },
  { label: 'SSLCommerz', icon: <ShieldCheck size={14} /> },
];

const deliveryPartners = [
  { label: 'Pathao', detail: 'fast city delivery' },
  { label: 'Steadfast', detail: 'nationwide courier' },
  { label: 'RedX ready', detail: 'optional integration' },
];

const contactItems = [
  { label: 'support@lofimart.com', href: 'mailto:support@lofimart.com', icon: <Mail size={15} /> },
  { label: '+880 1700-000000', href: 'tel:+8801700000000', icon: <Phone size={15} /> },
  { label: 'Dhaka, Bangladesh', href: '/contact', icon: <MapPin size={15} /> },
];

type FooterSectionProps = {
  id: string;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
};

const FooterSection = ({ id, title, isOpen, onToggle, children }: FooterSectionProps) => (
  <section className="border-b border-white/10 py-4 md:border-b-0 md:py-0">
    <button
      type="button"
      className="flex w-full items-center justify-between text-left font-semibold text-white md:pointer-events-none md:mb-4"
      aria-expanded={isOpen}
      aria-controls={`footer-section-${id}`}
      onClick={onToggle}
    >
      <span>{title}</span>
      <ChevronDown
        size={18}
        className={`transition-transform md:hidden ${isOpen ? 'rotate-180' : ''}`}
        aria-hidden="true"
      />
    </button>
    <div id={`footer-section-${id}`} className={`${isOpen ? 'block' : 'hidden'} pt-4 md:block md:pt-0`}>
      {children}
    </div>
  </section>
);

export const Footer = () => {
  const { user, isAuthenticated } = useUser();
  const { install, isInstallable, isInstalled } = usePWAInstall();
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterSubmitting, setNewsletterSubmitting] = useState(false);
  const [openMobileSections, setOpenMobileSections] = useState<Record<string, boolean>>({
    service: true,
  });
  const navigationRole: NavigationRole = isAuthenticated ? (user?.role ?? 'customer') : 'guest';
  const visibleDiscoverLinks = filterRoleAwareLinks(discoverLinks, navigationRole).filter((item) =>
    ['/explore', '/style-quiz', '/bazaar'].includes(item.href),
  );

  const toggleFooterSection = (section: string) => {
    setOpenMobileSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  };

  const submitNewsletter = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = newsletterEmail.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Please enter a valid email address.');
      return;
    }

    setNewsletterSubmitting(true);

    try {
      const response = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'footer' }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || 'Could not join the newsletter right now.');
      }

      setNewsletterEmail('');
      toast.success(payload?.alreadySubscribed ? 'You are already on the list.' : 'Newsletter subscription saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not join the newsletter right now.');
    } finally {
      setNewsletterSubmitting(false);
    }
  };

  const footerSocialLinksNew = [
    { href: 'https://facebook.com/lofimart', label: 'Facebook', icon: <Facebook size={20} /> },
    { href: 'https://youtube.com/@lofimart', label: 'YouTube', icon: <Youtube size={20} /> },
    { href: 'https://instagram.com/lofimart', label: 'Instagram', icon: <Instagram size={20} /> },
    { href: 'https://tiktok.com/@lofimart', label: 'TikTok', icon: <Music size={20} /> },
  ];

  return (
    <footer className="w-full border-t border-[#c4c6ce]/30 bg-white mt-auto relative z-10">
      <div className="w-full px-6 md:px-16 py-16 grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-6 max-w-[1280px] mx-auto">
        {/* Brand */}
        <div className="flex flex-col gap-4 lg:col-span-1">
          <div className="text-2xl font-bold text-primary mb-2 flex items-center gap-2">
            <ShoppingBag size={24} className="text-secondary" />
            LofiMart
          </div>
          <p className="text-sm text-[#43474d]">Elevating commerce through design and technology. The premium destination for modern retail.</p>
          <div className="flex items-center gap-2 mt-auto pt-4">
            {footerSocialLinksNew.map((item) => (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                aria-label={item.label}
                className="w-10 h-10 rounded-full bg-[#e0e3e6] flex items-center justify-center text-[#43474d] hover:bg-primary hover:text-white hover:-translate-y-1 transition-all duration-300"
              >
                {item.icon}
              </a>
            ))}
          </div>
        </div>

        {/* Shop */}
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-bold text-primary mb-2 uppercase tracking-wider">Shop</h3>
          <nav className="flex flex-col gap-2">
            <Link to="/shop?category=Electronics" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max">Electronics</Link>
            <Link to="/shop?category=Fashion" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max">Fashion</Link>
            <Link to="/shop?category=Home+%26+Living" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max">Home &amp; Living</Link>
            <Link to="/shop" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max flex items-center gap-2">
              Top Brands
              <span className="bg-[#80E9FF]/20 text-[#314865] text-[10px] px-2 py-0.5 rounded-full font-bold">HOT</span>
            </Link>
            <Link to="/shop?sort=newest" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max">New Arrivals</Link>
          </nav>
        </div>

        {/* Company */}
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-bold text-primary mb-2 uppercase tracking-wider">Company</h3>
          <nav className="flex flex-col gap-2">
            <Link to="/about" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max">About</Link>
            <Link to="/blog" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max">Blog</Link>
            <Link to="/bazaar/loyalty-rewards" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max">Investors</Link>
            <Link to="/reseller" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max">Affiliate Program</Link>
          </nav>
        </div>

        {/* Support */}
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-bold text-primary mb-2 uppercase tracking-wider">Support</h3>
          <nav className="flex flex-col gap-2">
            <Link to="/help" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max">Help Center</Link>
            <Link to="/track" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max">Track Order</Link>
            <Link to="/returns" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max">Shipping</Link>
            <Link to="/returns" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max">Returns</Link>
            <Link to="/contact" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max">Contact</Link>
          </nav>
        </div>

        {/* Seller Center */}
        <div className="flex flex-col gap-2 lg:col-span-1">
          <h3 className="text-xs font-bold text-primary mb-2 uppercase tracking-wider">Seller Center</h3>
          <nav className="flex flex-col gap-4">
            <Link
              to="/register?role=seller"
              className="bg-primary text-white text-sm font-semibold py-2 px-4 rounded-lg flex items-center justify-between hover:bg-primary-dark transition-colors shadow-sm group"
            >
              Become a Seller
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <div className="flex flex-col gap-2 mt-2">
              <Link to="/seller/dashboard" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max">Seller Dashboard</Link>
              <Link to="/help" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max">Seller Policy</Link>
            </div>
          </nav>
        </div>

        {/* Newsletter */}
        <div className="flex flex-col gap-2 lg:col-span-1">
          <h3 className="text-xs font-bold text-primary mb-2 uppercase tracking-wider">Stay Updated</h3>
          <p className="text-xs text-[#43474d] mb-2">Subscribe to get special offers, free giveaways, and once-in-a-lifetime deals.</p>
          <form onSubmit={submitNewsletter} className="flex flex-col gap-2">
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#c4c6ce]" />
              <input
                type="email"
                value={newsletterEmail}
                onChange={(event) => setNewsletterEmail(event.target.value)}
                placeholder="Enter your email"
                autoComplete="email"
                className="w-full bg-[#e0e3e6] border border-[#c4c6ce]/50 rounded-lg py-2 pl-10 pr-4 text-[#181c1e] focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={newsletterSubmitting}
              className="w-full bg-primary text-white text-sm font-semibold py-2 px-4 rounded-lg hover:opacity-90 transition-opacity shadow-sm flex items-center justify-center gap-2"
            >
              {newsletterSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
              Subscribe
            </button>
          </form>
          <div className="flex items-center gap-1 text-[10px] text-[#74777e] mt-2">
            <ShieldCheck size={12} />
            Secure &amp; Spam-free
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-[#c4c6ce]/20 bg-[#f7fafd]">
        <div className="max-w-[1280px] mx-auto px-6 md:px-16 py-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex flex-col md:flex-row items-center gap-4 text-xs text-[#43474d]">
            <span>&copy; {new Date().getFullYear()} LofiMart. All rights reserved. Your trust is our currency.</span>
            <div className="flex gap-4">
              <Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
              <Link to="/terms" className="hover:text-primary transition-colors">Terms of Service</Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export const ScrollToTopButton = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleScroll = () => {
      const currentY = window.scrollY;
      const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
      const nextProgress = documentHeight > 0 ? Math.min(1, Math.max(0, currentY / documentHeight)) : 0;

      setIsVisible(currentY > 420);
      setScrollProgress(nextProgress);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    if (typeof window === 'undefined') return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const progressDegrees = `${Math.round(scrollProgress * 360)}deg`;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Scroll to top"
      className={`scroll-top-button ${isVisible ? 'scroll-top-button--visible' : 'scroll-top-button--hidden'}`}
      style={{ ['--scroll-progress' as string]: progressDegrees }}
    >
      <span className="scroll-top-button__progress-ring">
        <span className="scroll-top-button__icon">
          <ArrowUp size={18} />
        </span>
      </span>
      <span className="scroll-top-button__tooltip">Back to top</span>
    </button>
  );
};
