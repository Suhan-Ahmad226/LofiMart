"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { Bot, CheckCircle2, Copy, ExternalLink, Loader2, RefreshCcw, Send, Unlink } from 'lucide-react';
import toast from 'react-hot-toast';
import { useUser } from '@/src/context/UserContext';

type TelegramStatus = {
  configured: boolean;
  linked: boolean;
  linked_at: string | null;
  chat_id_masked: string | null;
  deep_link: string | null;
  store_name: string;
};

export default function TelegramConnectPanel() {
  const { token } = useUser();
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [unlinking, setUnlinking] = useState(false);
  const [testing, setTesting] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    try {
      const response = await fetch('/api/seller/telegram/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load Telegram status');
      }
      setStatus(payload as TelegramStatus);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load Telegram status.');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const copyLink = async () => {
    if (!status?.deep_link) return;
    await navigator.clipboard.writeText(status.deep_link);
    toast.success('Telegram connect link copied.');
  };

  const unlinkTelegram = async () => {
    if (!token) return;
    setUnlinking(true);
    try {
      const response = await fetch('/api/seller/telegram/status', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to unlink Telegram');
      }
      toast.success('Telegram chat unlinked.');
      await loadStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not unlink Telegram.');
    } finally {
      setUnlinking(false);
    }
  };

  const sendTestMessage = async () => {
    if (!token) return;
    setTesting(true);
    try {
      const response = await fetch('/api/seller/telegram/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to send Telegram test');
      }
      toast.success('Telegram test message sent.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send Telegram test.');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-3xl border border-border bg-white p-5">
        <div className="flex items-center gap-3 text-sm font-semibold text-muted-foreground">
          <Loader2 className="animate-spin" size={18} />
          Loading Telegram connection...
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-violet-100 bg-[linear-gradient(135deg,rgba(124,58,237,0.08),rgba(6,182,212,0.08))] p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white">
            <Bot size={20} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-700">Telegram control panel</p>
            <h3 className="mt-1 text-lg font-bold text-slate-950">
              {status?.linked ? 'Telegram is connected' : 'Connect Telegram bot'}
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Receive new orders, low stock alerts, payment updates, and seller action buttons directly in Telegram.
            </p>
          </div>
        </div>

        <span
          className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${
            status?.linked ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          {status?.linked ? <CheckCircle2 size={14} /> : null}
          {status?.linked ? 'Linked' : 'Not linked'}
        </span>
      </div>

      {!status?.configured ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Telegram env is not configured yet. Add <code>TELEGRAM_BOT_TOKEN</code> and <code>TELEGRAM_BOT_USERNAME</code> in production env.
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Store</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{status?.store_name || 'Seller'}</p>
        </div>
        <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Telegram chat</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {status?.chat_id_masked || 'Not connected yet'}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {status?.deep_link ? (
          <>
            <a
              href={status.deep_link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <ExternalLink size={16} />
              Open Telegram
            </a>
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
            >
              <Copy size={16} />
              Copy link
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={loadStatus}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
        >
          <RefreshCcw size={16} />
          Refresh
        </button>
        {status?.linked ? (
          <button
            type="button"
            onClick={sendTestMessage}
            disabled={testing}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
          >
            {testing ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
            Send test
          </button>
        ) : null}
        {status?.linked ? (
          <button
            type="button"
            onClick={unlinkTelegram}
            disabled={unlinking}
            className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
          >
            {unlinking ? <Loader2 className="animate-spin" size={16} /> : <Unlink size={16} />}
            Unlink
          </button>
        ) : null}
      </div>
    </div>
  );
}
