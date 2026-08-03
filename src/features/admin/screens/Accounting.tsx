'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { BookText, Landmark, Loader2, ReceiptText, Scale } from 'lucide-react';
import { useUser } from '../../../features/shared/state/UserContext';
import { formatPrice } from '../../../lib/utils';

type AccountingSummary = {
  assets: number;
  liabilities: number;
  equity: number;
  revenue: number;
  expenses: number;
  accounts: number;
  journal_entries: number;
  net_income: number;
};

type LedgerAccountRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  debit_total: number;
  credit_total: number;
  balance: number;
  line_count: number;
};

type JournalLineRow = {
  id: string;
  account_code: string;
  account_name: string;
  description: string | null;
  debit: number;
  credit: number;
};

type JournalEntryRow = {
  id: string;
  reference: string;
  memo: string | null;
  currency: string;
  created_at: string;
  lines: JournalLineRow[];
};

type AccountingResponse = {
  updatedAt: string;
  summary: AccountingSummary;
  reports: {
    trial_balance: {
      debit_total: number;
      credit_total: number;
      balanced: boolean;
    };
    profit_and_loss: {
      revenue: number;
      expenses: number;
      net_income: number;
    };
    cash_summary: {
      cash_on_hand: number;
      stripe_clearing: number;
      accounts_receivable: number;
    };
    payable_summary: {
      customer_wallet_liability: number;
      seller_payout_payable: number;
      reseller_payout_payable: number;
    };
  };
  accounts: LedgerAccountRow[];
  journalEntries: JournalEntryRow[];
};

const emptySummary: AccountingSummary = {
  assets: 0,
  liabilities: 0,
  equity: 0,
  revenue: 0,
  expenses: 0,
  accounts: 0,
  journal_entries: 0,
  net_income: 0,
};

export const AdminAccountingPage = () => {
  const { token } = useUser();
  const [data, setData] = useState<AccountingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const [entrySearch, setEntrySearch] = useState('');

  useEffect(() => {
    const loadAccounting = async () => {
      if (!token) {
        setError('Please log in as an admin to view accounting data.');
        setData(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');
        const response = await fetch('/api/admin/accounting', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load accounting data');
        }

        setData(payload);
      } catch (requestError) {
        setData(null);
        setError(requestError instanceof Error ? requestError.message : 'Failed to load accounting data');
      } finally {
        setLoading(false);
      }
    };

    void loadAccounting();
  }, [token]);

  const summary = data?.summary || emptySummary;
  const reports = data?.reports || {
    trial_balance: { debit_total: 0, credit_total: 0, balanced: true },
    profit_and_loss: { revenue: 0, expenses: 0, net_income: 0 },
    cash_summary: { cash_on_hand: 0, stripe_clearing: 0, accounts_receivable: 0 },
    payable_summary: { customer_wallet_liability: 0, seller_payout_payable: 0, reseller_payout_payable: 0 },
  };

  const visibleAccounts = useMemo(() => {
    const needle = accountSearch.trim().toLowerCase();
    if (!needle) return data?.accounts || [];

    return (data?.accounts || []).filter((account) =>
      [account.code, account.name, account.type].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [accountSearch, data?.accounts]);

  const visibleEntries = useMemo(() => {
    const needle = entrySearch.trim().toLowerCase();
    if (!needle) return data?.journalEntries || [];

    return (data?.journalEntries || []).filter((entry) => {
      const lineMatch = entry.lines.some((line) =>
        [line.account_code, line.account_name, line.description || ''].some((value) =>
          value.toLowerCase().includes(needle),
        ),
      );

      return [entry.reference, entry.memo || '', entry.currency].some((value) => value.toLowerCase().includes(needle)) || lineMatch;
    });
  }, [data?.journalEntries, entrySearch]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Accounting</h1>
          <p className="mt-1 text-sm text-gray-500">
            Ledger balances and recent journal activity from the accounting foundation.
          </p>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {data?.updatedAt ? `Updated ${new Date(data.updatedAt).toLocaleString()}` : 'Awaiting data'}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Assets</p>
          <p className="mt-2 text-xl font-bold text-slate-950 md:text-2xl">{formatPrice(summary.assets)}</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Liabilities</p>
          <p className="mt-2 text-xl font-bold text-slate-950 md:text-2xl">{formatPrice(summary.liabilities)}</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Revenue</p>
          <p className="mt-2 text-xl font-bold text-emerald-700 md:text-2xl">{formatPrice(summary.revenue)}</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Net income</p>
          <p className={`mt-2 text-xl font-bold md:text-2xl ${summary.net_income >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {formatPrice(summary.net_income)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:p-5">
          <div className="flex items-center gap-3">
            <Landmark className="text-slate-700" size={18} />
            <div>
              <p className="text-sm font-bold text-slate-900">Chart of accounts</p>
              <p className="text-xs text-slate-600">{summary.accounts} ledger account{summary.accounts === 1 ? '' : 's'}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:p-5">
          <div className="flex items-center gap-3">
            <ReceiptText className="text-slate-700" size={18} />
            <div>
              <p className="text-sm font-bold text-slate-900">Recent journals</p>
              <p className="text-xs text-slate-600">{summary.journal_entries} latest entries loaded</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:p-5">
          <div className="flex items-center gap-3">
            <BookText className="text-slate-700" size={18} />
            <div>
              <p className="text-sm font-bold text-slate-900">Expenses</p>
              <p className="text-xs text-slate-600">{formatPrice(summary.expenses)} posted expense balance</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:p-5">
          <div className="flex items-center gap-3">
            <Scale className="text-slate-700" size={18} />
            <div>
              <p className="text-sm font-bold text-slate-900">Equity</p>
              <p className="text-xs text-slate-600">{formatPrice(summary.equity)} retained in the books</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-[32px] border border-gray-100 bg-white p-6 shadow-sm">
          <h3 className="font-bold text-slate-950">Trial Balance</h3>
          <p className="mt-1 text-sm text-gray-500">Quick control view to ensure debits and credits stay aligned.</p>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total debit</p>
              <p className="mt-2 text-xl font-bold text-slate-950">{formatPrice(reports.trial_balance.debit_total)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total credit</p>
              <p className="mt-2 text-xl font-bold text-slate-950">{formatPrice(reports.trial_balance.credit_total)}</p>
            </div>
          </div>
          <div className={`mt-4 rounded-2xl px-4 py-3 text-sm font-semibold ${
            reports.trial_balance.balanced
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-rose-50 text-rose-700'
          }`}>
            {reports.trial_balance.balanced ? 'Books are balanced.' : 'Debits and credits are out of balance.'}
          </div>
        </div>

        <div className="rounded-[32px] border border-gray-100 bg-white p-6 shadow-sm">
          <h3 className="font-bold text-slate-950">Profit & Loss</h3>
          <p className="mt-1 text-sm text-gray-500">Simple operating view from recorded revenue and expense entries.</p>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm">
              <span className="font-medium text-slate-600">Revenue</span>
              <span className="font-bold text-emerald-700">{formatPrice(reports.profit_and_loss.revenue)}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm">
              <span className="font-medium text-slate-600">Expenses</span>
              <span className="font-bold text-rose-700">{formatPrice(reports.profit_and_loss.expenses)}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-950 px-4 py-3 text-sm text-white">
              <span className="font-medium">Net income</span>
              <span className="font-bold">{formatPrice(reports.profit_and_loss.net_income)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-[32px] border border-gray-100 bg-white p-6 shadow-sm">
          <h3 className="font-bold text-slate-950">Cash Summary</h3>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm">
              <span className="text-slate-600">Cash on hand</span>
              <span className="font-bold text-slate-950">{formatPrice(reports.cash_summary.cash_on_hand)}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm">
              <span className="text-slate-600">Stripe clearing</span>
              <span className="font-bold text-slate-950">{formatPrice(reports.cash_summary.stripe_clearing)}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm">
              <span className="text-slate-600">Accounts receivable</span>
              <span className="font-bold text-slate-950">{formatPrice(reports.cash_summary.accounts_receivable)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-[32px] border border-gray-100 bg-white p-6 shadow-sm">
          <h3 className="font-bold text-slate-950">Payable Summary</h3>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm">
              <span className="text-slate-600">Customer wallet liability</span>
              <span className="font-bold text-slate-950">{formatPrice(reports.payable_summary.customer_wallet_liability)}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm">
              <span className="text-slate-600">Seller payout payable</span>
              <span className="font-bold text-slate-950">{formatPrice(reports.payable_summary.seller_payout_payable)}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm">
              <span className="text-slate-600">Reseller payout payable</span>
              <span className="font-bold text-slate-950">{formatPrice(reports.payable_summary.reseller_payout_payable)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[32px] border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-50 bg-gray-50/50 p-4 md:flex-row md:items-center md:justify-between md:p-6">
          <div>
            <h3 className="font-bold">Ledger accounts</h3>
            <p className="mt-1 text-sm text-gray-500">Current balance snapshot per account code.</p>
          </div>
          <input
            type="text"
            value={accountSearch}
            onChange={(event) => setAccountSearch(event.target.value)}
            placeholder="Search account code or name..."
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20 md:max-w-xs md:py-2"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-50 text-[10px] uppercase tracking-widest text-gray-400">
                <th className="px-6 py-4 font-bold">Code</th>
                <th className="px-6 py-4 font-bold">Account</th>
                <th className="px-6 py-4 font-bold">Type</th>
                <th className="px-6 py-4 font-bold">Debit</th>
                <th className="px-6 py-4 font-bold">Credit</th>
                <th className="px-6 py-4 font-bold">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visibleAccounts.length > 0 ? (
                visibleAccounts.map((account) => (
                  <tr key={account.id} className="text-sm">
                    <td className="px-6 py-4 font-mono font-semibold text-slate-900">{account.code}</td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{account.name}</div>
                      <div className="text-xs text-gray-500">{account.line_count} journal line(s)</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-700">
                        {account.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-700">{formatPrice(account.debit_total)}</td>
                    <td className="px-6 py-4 text-slate-700">{formatPrice(account.credit_total)}</td>
                    <td className="px-6 py-4 font-bold text-slate-950">{formatPrice(account.balance)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-400">
                    No ledger accounts matched this search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-[32px] border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-50 bg-gray-50/50 p-4 md:flex-row md:items-center md:justify-between md:p-6">
          <div>
            <h3 className="font-bold">Recent journal entries</h3>
            <p className="mt-1 text-sm text-gray-500">Latest posted accounting entries and line details.</p>
          </div>
          <input
            type="text"
            value={entrySearch}
            onChange={(event) => setEntrySearch(event.target.value)}
            placeholder="Search reference, memo, account..."
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20 md:max-w-xs md:py-2"
          />
        </div>
        <div className="divide-y divide-gray-100">
          {visibleEntries.length > 0 ? (
            visibleEntries.map((entry) => (
              <div key={entry.id} className="p-6">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-bold text-slate-950">{entry.reference}</p>
                    <p className="mt-1 text-sm text-gray-500">{entry.memo || 'No memo added'}</p>
                  </div>
                  <div className="text-sm text-gray-500">
                    {new Date(entry.created_at).toLocaleString()} â€¢ {entry.currency}
                  </div>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-widest text-gray-400">
                        <th className="py-2 pr-4 font-bold">Account</th>
                        <th className="py-2 pr-4 font-bold">Description</th>
                        <th className="py-2 pr-4 font-bold">Debit</th>
                        <th className="py-2 font-bold">Credit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {entry.lines.map((line) => (
                        <tr key={line.id} className="text-sm">
                          <td className="py-3 pr-4">
                            <div className="font-semibold text-slate-900">{line.account_name}</div>
                            <div className="font-mono text-xs text-gray-500">{line.account_code}</div>
                          </td>
                          <td className="py-3 pr-4 text-gray-600">{line.description || 'â€”'}</td>
                          <td className="py-3 pr-4 text-slate-700">{line.debit ? formatPrice(line.debit) : 'â€”'}</td>
                          <td className="py-3 text-slate-700">{line.credit ? formatPrice(line.credit) : 'â€”'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          ) : (
            <div className="px-6 py-12 text-center text-sm text-gray-400">
              No journal entries matched this search.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
