'use client';

import { CheckCircle2, Package, ArrowRight } from 'lucide-react';
import { Link } from '@/src/lib/navigation';

export default function OrderSuccessPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <div className="bg-card border border-border rounded-3xl shadow-sm p-8 md:p-12 text-center space-y-6">
        <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <CheckCircle2 size={40} />
        </div>

        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-primary">Order Confirmed</p>
          <h1 className="text-3xl md:text-4xl font-bold">Thank you for your purchase</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Your order has been placed successfully. We are preparing it now and you can track progress from your account.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 text-left">
          <div className="rounded-2xl bg-secondary/60 border border-border p-5">
            <div className="flex items-center gap-3 mb-2 text-primary">
              <Package size={18} />
              <span className="font-semibold">What happens next</span>
            </div>
            <p className="text-sm text-muted-foreground">
              You will see the order in your dashboard, and our team will update shipping and delivery status as it moves.
            </p>
          </div>

          <div className="rounded-2xl bg-secondary/60 border border-border p-5">
            <div className="flex items-center gap-3 mb-2 text-accent">
              <CheckCircle2 size={18} />
              <span className="font-semibold">Need anything else?</span>
            </div>
            <p className="text-sm text-muted-foreground">
              You can continue shopping now or open your orders page to review the purchase details.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link to="/account/orders" className="btn-primary inline-flex items-center gap-2">
            View My Orders
            <ArrowRight size={16} />
          </Link>
          <Link
            to="/shop"
            className="inline-flex items-center gap-2 px-6 py-2 rounded-lg font-semibold border border-border bg-card hover:bg-secondary transition-colors"
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
