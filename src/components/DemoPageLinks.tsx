import React from 'react';
import { ArrowRight, Compass } from 'lucide-react';
import { Link } from '@/src/lib/navigation';

type JourneyLink = {
  href: string;
  title: string;
  description: string;
};

type DemoPageLinksProps = {
  eyebrow?: string;
  title: string;
  description: string;
  links: JourneyLink[];
};

export default function DemoPageLinks({
  eyebrow = 'Keep Exploring',
  title,
  description,
  links,
}: DemoPageLinksProps) {
  return (
    <section className="rounded-[2rem] border border-primary/15 bg-gradient-to-br from-primary/5 via-background to-accent/5 p-6 shadow-sm md:p-8">
      <div className="mb-6 flex items-start gap-4">
        <div className="rounded-2xl bg-primary/10 p-3 text-primary">
          <Compass className="h-6 w-6" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-bold text-foreground">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {links.map((link) => (
          <Link
            key={link.href}
            to={link.href}
            className="group rounded-2xl border border-border/70 bg-card/95 p-5 transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
          >
            <h3 className="text-base font-semibold text-card-foreground transition group-hover:text-primary">
              {link.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{link.description}</p>
            <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary">
              Open page
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
