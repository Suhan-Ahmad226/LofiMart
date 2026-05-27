import Link from 'next/link';

export default async function BkashSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const orderId = typeof params.orderId === 'string' ? params.orderId : '';
  const paymentId = typeof params.paymentId === 'string' ? params.paymentId : '';
  const trxId = typeof params.trxId === 'string' ? params.trxId : '';

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <div className="rounded-[2rem] border border-emerald-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-600">Payment success</p>
        <h1 className="mt-3 text-3xl font-bold text-slate-950">Your bKash payment is confirmed</h1>
        <p className="mt-3 text-sm text-slate-600">
          We verified the payment on the server and updated your order securely before showing this page.
        </p>

        <div className="mt-6 space-y-2 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
          {orderId ? <p><span className="font-semibold">Order:</span> {orderId}</p> : null}
          {paymentId ? <p><span className="font-semibold">Payment ID:</span> {paymentId}</p> : null}
          {trxId ? <p><span className="font-semibold">Transaction ID:</span> {trxId}</p> : null}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={orderId ? `/account/orders/${orderId}` : '/account/orders'} className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white">
            View order
          </Link>
          <Link href="/shop" className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-800">
            Continue shopping
          </Link>
        </div>
      </div>
    </main>
  );
}
