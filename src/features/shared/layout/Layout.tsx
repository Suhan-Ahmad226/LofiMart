import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from '@/src/lib/navigation';
import {
  ArrowRight,
  ArrowUp,
  Bell,
  Boxes,
  ChevronDown,
  ClipboardList,
  CircleDollarSign,
  Heart,
  Home,
  LayoutDashboard,
  Loader2,
  Menu,
  Package2,
  Search,
  Settings,
  ShoppingCart,
  Truck,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { useCart } from '@/src/context/CartContext';
import { useUser } from '@/src/context/UserContext';
import { useWishlist } from '@/src/context/WishlistContext';
import { AnimatedBadge, AnimatedIcon } from '@/src/components/ui/AnimatedIcon';
import { filterRoleAwareLinks, type NavigationRole, type RoleAwareLink } from '@/src/lib/role-navigation';
import { getCachedClientValue } from '@/src/lib/client-cache';

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
  const { user, isAuthenticated } = useUser();
  const { items: wishlistItems } = useWishlist();
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [trendingSearches, setTrendingSearches] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearchInteracted, setHasSearchInteracted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [headerCategories, setHeaderCategories] = useState<HeaderCategory[]>(headerCategoryFallbacks);
  const [headerCategoriesLoaded, setHeaderCategoriesLoaded] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const suggestionsCacheRef = useRef<Map<string, any[]>>(new Map());
  const navigate = useNavigate();
  const location = useLocation();
  const navigationRole: NavigationRole = isAuthenticated ? (user?.role ?? 'customer') : 'guest';
  const visibleDiscoverLinks = useMemo(() => filterRoleAwareLinks(discoverLinks, navigationRole), [navigationRole]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const handleAccountClick = () => {
    if (isAuthenticated) {
      if (user?.role === 'admin') navigate('/admin/dashboard');
      else if (user?.role === 'seller') navigate('/seller/dashboard');
      else if (user?.role === 'reseller') navigate('/reseller-dashboard/overview');
      else navigate('/account/dashboard');
    } else {
      navigate('/login');
    }
    setMobileOpen(false);
  };

  const handleMobileNotificationsClick = () => {
    if (isAuthenticated) {
      navigate('/account/notifications');
    } else {
      navigate('/login?redirect=/account/notifications');
    }
  };

  return (
    <header className="glass-nav">
      <div className="page-shell sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-3 md:h-20">
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
                <div className="py-2">
                  {suggestions.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleSuggestionClick(item.slug)}
                      className="group flex w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-secondary/60"
                    >
                      <div className="flex items-center space-x-3">
                        <AnimatedIcon loop="none" className="text-muted-foreground group-hover:text-primary">
                          <Search size={14} />
                        </AnimatedIcon>
                        <div>
                          <p className="text-sm font-bold text-foreground">{item.name}</p>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.category}</p>
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
              className="group relative"
              onMouseEnter={loadHeaderCategories}
              onFocusCapture={loadHeaderCategories}
            >
              <Link to="/categories" className="flex items-center gap-1 text-sm font-bold text-foreground/80 transition-colors hover:text-primary">
                Categories
                <AnimatedIcon loop="none" className="transition-transform group-hover:rotate-180">
                  <ChevronDown size={14} />
                </AnimatedIcon>
              </Link>
              <div className="invisible absolute left-1/2 top-full z-50 mt-2 max-h-[min(76vh,31rem)] w-[min(24rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] -translate-x-1/2 overflow-y-auto overflow-x-hidden rounded-2xl border border-black/5 bg-white opacity-0 shadow-2xl transition-all group-hover:visible group-hover:opacity-100 xl:w-[min(28rem,calc(100vw-2rem))]">
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
                            className="text-[13px] font-bold text-slate-950 hover:text-primary"
                          >
                            {category.name}
                          </Link>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {(category.subcategories || []).slice(0, 2).map((subcategory) => (
                              <Link
                                key={subcategory.id}
                                to={`/shop?category=${encodeURIComponent(category.name)}&subcategory=${encodeURIComponent(subcategory.name)}`}
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
              <button
                onClick={handleAccountClick}
                className="hidden items-center space-x-1 text-foreground/70 transition-colors hover:text-primary md:flex"
              >
                <AnimatedIcon glow>
                  <User size={22} />
                </AnimatedIcon>
              </button>

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
        <div className="space-y-2 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Link to="/shop" onClick={() => setMobileOpen(false)} className="block rounded-2xl bg-secondary/40 px-4 py-3 font-semibold text-slate-900">
            Shop
          </Link>
          <Link to="/flash-sale" onClick={() => setMobileOpen(false)} className="block rounded-2xl px-4 py-3 text-sm font-medium text-slate-700">
            Flash Sale
          </Link>
          <Link to="/categories" onClick={() => setMobileOpen(false)} className="block rounded-2xl px-4 py-3 text-sm font-medium text-slate-700">
            Categories
          </Link>
          {visibleDiscoverLinks.slice(0, 4).map((item) => (
            <Link key={item.href} to={item.href} onClick={() => setMobileOpen(false)} className="block rounded-2xl px-4 py-3 text-sm font-medium text-slate-700">
              {item.label}
            </Link>
          ))}
          <div className="grid grid-cols-1 gap-2 border-t border-border pt-3 sm:grid-cols-3">
            <button onClick={handleAccountClick} className="mobile-action-chip justify-center px-3 py-3 text-sm">
              <AnimatedIcon loop="none">
                <User size={18} />
              </AnimatedIcon>
              {isAuthenticated ? user?.name?.split(' ')[0] : 'Account'}
            </button>
            <Link to="/wishlist" onClick={() => setMobileOpen(false)} className="mobile-action-chip justify-center px-3 py-3 text-sm">
              <AnimatedIcon loop="none">
                <Heart size={18} />
              </AnimatedIcon>
              ({wishlistItems.length})
            </Link>
            <Link to="/cart" onClick={() => setMobileOpen(false)} className="mobile-action-chip justify-center px-3 py-3 text-sm">
              <AnimatedIcon loop="none">
                <ShoppingCart size={18} />
              </AnimatedIcon>
              ({totalItems})
            </Link>
          </div>
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

export const Footer = () => {
  const { user, isAuthenticated } = useUser();
  const navigationRole: NavigationRole = isAuthenticated ? (user?.role ?? 'customer') : 'guest';
  const visibleDiscoverLinks = filterRoleAwareLinks(discoverLinks, navigationRole).filter((item) =>
    ['/explore', '/style-quiz', '/bazaar'].includes(item.href),
  );

  return (
    <footer className="bg-[linear-gradient(135deg,#102418_0%,#163322_55%,#1a1a1a_100%)] pb-8 pt-12 text-white/85 md:pt-16">
      <div className="page-shell sm:px-6 lg:px-8">
        <div className="mb-10 grid grid-cols-1 gap-8 md:grid-cols-5 md:gap-12">
          <div className="space-y-4 md:col-span-2">
            <h3 className="font-display text-xl font-bold text-white">Lofi<span className="text-accent">Mart</span></h3>
            <p className="text-sm leading-relaxed">
              Your trusted destination for quality products in Bangladesh. Fast delivery, easy returns, and 100% genuine products.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/80">Mobile-first shopping</span>
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/80">Trusted sellers</span>
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/80">Fast delivery</span>
            </div>
          </div>
          <div>
            <h4 className="mb-4 font-semibold text-white">Customer Service</h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link to="/help" className="transition-colors hover:text-primary">
                  Help Center
                </Link>
              </li>
              <li>
                <Link to="/track" className="transition-colors hover:text-primary">
                  Track Order
                </Link>
              </li>
              <li>
                <Link to="/returns" className="transition-colors hover:text-primary">
                  Returns & Refunds
                </Link>
              </li>
              <li>
                <Link to="/contact" className="transition-colors hover:text-primary">
                  Contact Us
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="mb-4 font-semibold text-white">Quick Links</h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link to="/about" className="transition-colors hover:text-primary">
                  About Us
                </Link>
              </li>
              <li>
                <Link to="/shop" className="transition-colors hover:text-primary">
                  Shop All
                </Link>
              </li>
              <li>
                <Link to="/flash-sale" className="transition-colors hover:text-primary">
                  Flash Sale
                </Link>
              </li>
              <li>
                <Link to="/blog" className="transition-colors hover:text-primary">
                  Blog
                </Link>
              </li>
              <li>
                <Link to="/reseller" className="font-bold text-accent transition-colors hover:text-primary">
                  Reseller Program
                </Link>
              </li>
              <li>
                <Link to="/terms" className="transition-colors hover:text-primary">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="transition-colors hover:text-primary">
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="mb-4 font-semibold text-white">Discover</h4>
            <ul className="space-y-2.5 text-sm">
              {visibleDiscoverLinks.map((item) => (
                <li key={item.href}>
                  <Link to={item.href} className="transition-colors hover:text-primary">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="mb-4 font-semibold text-white">Newsletter</h4>
            <p className="mb-4 text-sm">Get exclusive deals and updates.</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-0">
              <input
                type="email"
                placeholder="Your email"
                className="w-full rounded-xl border-none bg-white/10 px-4 py-3 text-sm focus:ring-1 focus:ring-primary sm:rounded-r-none"
              />
              <button className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark sm:rounded-l-none">
                Join
              </button>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 pt-6 text-center text-xs">
          <p>&copy; {new Date().getFullYear()} LofiMart. All rights reserved.</p>
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
