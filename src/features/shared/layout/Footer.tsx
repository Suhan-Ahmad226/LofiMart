import React, { useState } from 'react';
import { Link } from '../../../lib/navigation';
import {
  ArrowRight,
  Facebook,
  Instagram,
  Loader2,
  Mail,
  Music,
  ShieldCheck,
  ShoppingBag,
  Youtube,
} from 'lucide-react';
import toast from '@/lib/toast';

export const Footer = () => {
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterError, setNewsletterError] = useState('');
  const [newsletterSubmitting, setNewsletterSubmitting] = useState(false);

  const submitNewsletter = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = newsletterEmail.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setNewsletterError('Please enter a valid email address.');
      return;
    }

    setNewsletterError('');
    setNewsletterSubmitting(true);

    try {
      await toast.promise(
        fetch('/api/newsletter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, source: 'footer' }),
        }).then(async (response) => {
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload?.error || 'Could not join the newsletter right now.');
          }
          return payload;
        }),
        {
          loading: 'Saving your newsletter signup…',
          success: (payload: { alreadySubscribed?: boolean } | unknown) =>
            payload && typeof payload === 'object' && 'alreadySubscribed' in payload && Boolean((payload as { alreadySubscribed?: boolean }).alreadySubscribed)
              ? 'You are already on the list.'
              : 'Newsletter subscription saved.',
          error: (error) => (error instanceof Error ? error.message : 'Could not join the newsletter right now.'),
        },
      );

      setNewsletterEmail('');
    } catch {
      // Error is handled by toast
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
      {/* Main Footer Grid */}
      <div className="w-full px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16 py-8 sm:py-12 md:py-16">
        <div className="max-w-[1280px] mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 sm:gap-8">
            {/* Brand - Takes full width on small screens */}
            <div className="col-span-1 sm:col-span-2 lg:col-span-1 xl:col-span-1 flex flex-col gap-4">
              <div className="text-2xl font-bold text-primary mb-2 flex items-center gap-2">
                <ShoppingBag size={24} className="text-secondary flex-shrink-0" />
                <span>LofiMart</span>
              </div>
              <p className="text-sm text-[#43474d] leading-relaxed">
                Happy Shoping
              </p>
              <div className="flex items-center gap-2 mt-auto pt-4 flex-wrap">
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

            {/* About LofiMart */}
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-bold text-primary mb-2 uppercase tracking-wider">About LofiMart</h3>
              <nav className="flex flex-col gap-2">
                <Link to="/about" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max text-sm">
                  About
                </Link>
                <Link to="/blog" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max text-sm">
                  Blog
                </Link>
                <Link to="/community" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max text-sm">
                  Community
                </Link>
                <Link to="/contact" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max text-sm">
                  Contact Us
                </Link>
              </nav>
            </div>

            {/* Shop */}
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-bold text-primary mb-2 uppercase tracking-wider">Shop</h3>
              <nav className="flex flex-col gap-2">
                <Link to="/shop" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max text-sm">
                  All Products
                </Link>
                <Link to="/categories" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max text-sm">
                  Categories
                </Link>
                <Link to="/shop?sort=newest" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max text-sm">
                  New Arrivals
                </Link>
                <Link to="/flash-sale" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max text-sm">
                  Flash Sale
                </Link>
              </nav>
            </div>

            {/* Help & Support */}
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-bold text-primary mb-2 uppercase tracking-wider">Help &amp; Support</h3>
              <nav className="flex flex-col gap-2">
                <Link to="/help" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max text-sm">
                  Help Center
                </Link>
                <Link to="/track" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max text-sm">
                  Track Order
                </Link>
                <Link to="/returns" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max text-sm">
                  Returns &amp; Refunds
                </Link>
                <Link to="/contact" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max text-sm">
                  Contact Us
                </Link>
              </nav>
            </div>

            {/* Sell With Us */}
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-bold text-primary mb-2 uppercase tracking-wider">Sell With Us</h3>
              <nav className="flex flex-col gap-2">
                <Link
                  to="/register?role=seller"
                  className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max text-sm"
                >
                  Become a Seller
                </Link>
                <Link to="/seller" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max text-sm">
                  Seller Center
                </Link>
                <Link to="/reseller" className="text-[#43474d] hover:text-primary hover:translate-x-1 transition-all duration-300 footer-link-hover w-max text-sm">
                  Become a Reseller
                </Link>
              </nav>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-[#c4c6ce]/20 bg-[#f7fafd]">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-4">
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-xs text-[#43474d] text-center sm:text-left">
              <span>&copy; {new Date().getFullYear()} LofiMart. All rights reserved.</span>
              <span className="hidden sm:inline text-[#c4c6ce]">|</span>
              <span>Made with ❤️ by LofiMart Team</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-xs text-[#43474d]">
              <Link to="/privacy" className="hover:text-primary transition-colors">
                Privacy Policy
              </Link>
              <Link to="/terms" className="hover:text-primary transition-colors">
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};