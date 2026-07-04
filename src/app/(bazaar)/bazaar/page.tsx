'use client';

import { useMemo } from 'react';
import { Bot, Gift, Link2, Share2, Sparkles, Users } from 'lucide-react';
import { Link } from '@/src/lib/navigation';
import { useUser } from '@/src/context/UserContext';
import { filterRoleAwareLinks, type NavigationRole, type RoleAwareLink } from '@/src/lib/role-navigation';

type Tool = RoleAwareLink & {
  description: string;
  icon: typeof Gift;
  tone: string;
};

const tools: Tool[] = [
  {
    href: '/bazaar/aigiftfinder',
    label: 'AI Gift Finder',
    description: 'Find personalized gift ideas with AI-assisted suggestions.',
    icon: Gift,
    tone: 'bg-primary/10 text-primary',
    visibleTo: ['guest', 'customer', 'seller', 'reseller', 'admin'],
  },
  {
    href: '/bazaar/liveconcierge',
    label: 'Live Concierge',
    description: 'Explore a guided shopping experience with instant assistance.',
    icon: Bot,
    tone: 'bg-accent/10 text-accent',
    visibleTo: ['guest', 'customer', 'seller', 'reseller', 'admin'],
  },
  {
    href: '/bazaar/affiliate-catalog',
    label: 'Affiliate Catalog',
    description: 'Browse shareable products and affiliate-friendly promotions.',
    icon: Link2,
    tone: 'bg-secondary text-foreground',
    visibleTo: ['seller', 'reseller', 'admin'],
  },
  {
    href: '/bazaar/reseller-discovery',
    label: 'Reseller Discovery',
    description: 'Discover products and partner opportunities for resellers.',
    icon: Users,
    tone: 'bg-primary/10 text-primary',
    visibleTo: ['reseller', 'seller', 'admin'],
  },
  {
    href: '/bazaar/loyalty-rewards',
    label: 'Loyalty Rewards',
    description: 'See retention offers, rewards, and repeat-purchase programs.',
    icon: Sparkles,
    tone: 'bg-accent/10 text-accent',
    visibleTo: ['guest', 'customer', 'reseller', 'admin'],
  },
  {
    href: '/reseller-dashboard/catalog',
    label: 'Reseller Catalog',
    description: 'Open the catalog of products a reseller can add to their shop.',
    icon: Share2,
    tone: 'bg-secondary text-foreground',
    visibleTo: ['reseller', 'admin'],
  },
];

export default function BazaarIndexPage() {
  const { isAuthenticated, user } = useUser();
  const role: NavigationRole = isAuthenticated ? (user?.role ?? 'customer') : 'guest';
  const visibleTools = useMemo(() => filterRoleAwareLinks(tools, role), [role]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-12 space-y-10">
      <section className="rounded-[2rem] border border-border bg-[linear-gradient(135deg,rgba(255,76,76,0.08),rgba(40,167,69,0.10))] p-8 md:p-12">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent mb-3">Bazaar Hub</p>
        <h1 className="text-4xl md:text-5xl font-bold mb-4">Explore every Bazaar experience from one place</h1>
        <p className="text-muted-foreground max-w-2xl">
          Bazaar now adapts to your role, so customers, sellers, resellers, and admins each see the right growth and discovery tools first.
        </p>
      </section>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {visibleTools.map(({ href, label, description, icon: Icon, tone }) => (
          <Link
            key={href}
            to={href}
            className="group rounded-[1.75rem] border border-border bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
          >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${tone}`}>
              <Icon size={22} />
            </div>
            <h2 className="text-xl font-bold mt-5 mb-2 group-hover:text-primary transition-colors">{label}</h2>
            <p className="text-sm text-muted-foreground">{description}</p>
            <div className="mt-5 text-sm font-semibold text-primary">Open page</div>
          </Link>
        ))}
      </section>
    </div>
  );
}
