'use client';

import { useMemo } from 'react';
import { ArrowRight, Boxes, LayoutDashboard, ShoppingBag, Sparkles, Wand2 } from 'lucide-react';
import { Link } from '../../../lib/navigation';
import { useUser } from '../../../features/shared/state/UserContext';
import { filterRoleAwareLinks, type NavigationRole, type RoleAwareLink } from '../../../lib/role-navigation';

type Section = {
  title: string;
  icon: typeof ShoppingBag;
  links: RoleAwareLink[];
};

const sections: Section[] = [
  {
    title: 'Storefront',
    icon: ShoppingBag,
    links: [
      { href: '/shop', label: 'Shop', visibleTo: ['guest', 'customer', 'seller', 'reseller', 'admin'] },
      { href: '/categories', label: 'Categories', visibleTo: ['guest', 'customer', 'seller', 'reseller', 'admin'] },
      { href: '/flash-sale', label: 'Flash Sale', visibleTo: ['guest', 'customer', 'seller', 'reseller', 'admin'] },
      { href: '/wishlist', label: 'Wishlist', visibleTo: ['customer'] },
      { href: '/cart', label: 'Cart', visibleTo: ['customer'] },
      { href: '/checkout', label: 'Checkout', visibleTo: ['customer'] },
    ],
  },
  {
    title: 'Interactive Experiences',
    icon: Wand2,
    links: [
      { href: '/ai-features', label: 'AI Features', visibleTo: ['guest', 'customer', 'seller', 'reseller', 'admin'] },
      { href: '/animations', label: 'Motion Library', visibleTo: ['admin', 'seller', 'reseller'] },
      { href: '/product-3d', label: '3D Product Hub', visibleTo: ['guest', 'customer', 'seller', 'reseller', 'admin'] },
      { href: '/ar-tryon', label: 'AR Try-On', visibleTo: ['guest', 'customer', 'seller', 'reseller', 'admin'] },
      { href: '/room-visualizer', label: 'Room Visualizer', visibleTo: ['guest', 'customer', 'seller', 'reseller', 'admin'] },
      { href: '/pwa', label: 'PWA Experience', visibleTo: ['guest', 'customer', 'seller', 'reseller', 'admin'] },
    ],
  },
  {
    title: 'Bazaar Tools',
    icon: Sparkles,
    links: [
      { href: '/bazaar', label: 'Bazaar Hub', visibleTo: ['guest', 'customer', 'seller', 'reseller', 'admin'] },
      { href: '/bazaar/affiliate-catalog', label: 'Affiliate Catalog', visibleTo: ['seller', 'reseller', 'admin'] },
      { href: '/bazaar/aigiftfinder', label: 'AI Gift Finder', visibleTo: ['guest', 'customer', 'seller', 'reseller', 'admin'] },
      { href: '/bazaar/liveconcierge', label: 'Live Concierge', visibleTo: ['guest', 'customer', 'seller', 'reseller', 'admin'] },
      { href: '/bazaar/reseller-discovery', label: 'Reseller Discovery', visibleTo: ['reseller', 'seller', 'admin'] },
      { href: '/bazaar/loyalty-rewards', label: 'Loyalty Rewards', visibleTo: ['guest', 'customer', 'reseller', 'admin'] },
    ],
  },
  {
    title: 'Dashboards',
    icon: LayoutDashboard,
    links: [
      { href: '/account/dashboard', label: 'Customer Dashboard', visibleTo: ['customer'] },
      { href: '/seller/dashboard', label: 'Seller Dashboard', visibleTo: ['seller', 'admin'] },
      { href: '/reseller-dashboard/overview', label: 'Reseller Dashboard', visibleTo: ['reseller', 'admin'] },
      { href: '/reseller-dashboard/catalog', label: 'Reseller Catalog', visibleTo: ['reseller', 'admin'] },
      { href: '/admin/dashboard', label: 'Admin Dashboard', visibleTo: ['admin'] },
    ],
  },
];

export default function ExplorePage() {
  const { isAuthenticated, user } = useUser();
  const role: NavigationRole = isAuthenticated ? (user?.role ?? 'customer') : 'guest';

  const visibleSections = useMemo(
    () =>
      sections
        .map((section) => ({
          ...section,
          links: filterRoleAwareLinks(section.links, role),
        }))
        .filter((section) => section.links.length > 0),
    [role],
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-12 space-y-10">
      <section className="rounded-[2rem] border border-border bg-[linear-gradient(135deg,rgba(40,167,69,0.08),rgba(255,76,76,0.06))] p-8 md:p-12">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-primary mb-3">Site Explorer</p>
        <h1 className="text-4xl md:text-5xl font-bold mb-4">Open every important page from one navigation hub</h1>
        <p className="text-muted-foreground max-w-2xl">
          This explorer now adapts to your role, so you only see the shopping, Bazaar, and dashboard paths that matter to you.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        {visibleSections.map(({ title, icon: Icon, links }) => (
          <div key={title} className="rounded-[1.75rem] border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-2xl bg-secondary flex items-center justify-center text-primary">
                <Icon size={22} />
              </div>
              <h2 className="text-2xl font-bold">{title}</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {links.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className="flex items-center justify-between rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold transition-all hover:border-primary/30 hover:bg-secondary/50 hover:text-primary"
                >
                  <span>{link.label}</span>
                  <ArrowRight size={16} />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-[1.75rem] border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-accent/10 flex items-center justify-center text-accent">
            <Boxes size={22} />
          </div>
          <h2 className="text-2xl font-bold">Suggested Navigation Flow</h2>
        </div>
        <p className="text-muted-foreground">
          Your explorer keeps the journey focused: customers move from discovery to checkout, sellers move into operations, resellers move into growth tools, and admins see the full control layer.
        </p>
      </section>
    </div>
  );
}
