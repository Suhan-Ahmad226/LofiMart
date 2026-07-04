import { useEffect, useState } from 'react';
import { useInventoryDispatch } from '@/src/context/InventoryContext';

type SyncStatus = 'idle' | 'connecting' | 'live' | 'local' | 'error';

// Lightweight real-time sync helper.
// In Next.js, client-exposed env vars must be prefixed with NEXT_PUBLIC_.
// If NEXT_PUBLIC_INVENTORY_WS isn't set, we fall back to a small runtime endpoint.
export function useInventorySync(enabled: boolean = true) {
  const dispatch = useInventoryDispatch();
  const [status, setStatus] = useState<SyncStatus>('idle');

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return;
    }

    let cancelled = false;
    let hadError = false;

    const resolveWsUrl = async (): Promise<string | null> => {
      const fromEnv = process.env.NEXT_PUBLIC_INVENTORY_WS;
      if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim();

      try {
        const res = await fetch('/api/config/public', {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        if (!res.ok) return null;
        const data = (await res.json()) as
          | { inventoryWs?: unknown }
          | { ok?: boolean; data?: { inventoryWs?: unknown } };
        const inventoryWs =
          typeof (data as { inventoryWs?: unknown }).inventoryWs === 'string'
            ? (data as { inventoryWs?: string }).inventoryWs
            : (data as { data?: { inventoryWs?: unknown } }).data?.inventoryWs;

        return typeof inventoryWs === 'string' && inventoryWs.trim()
          ? inventoryWs.trim()
          : null;
      } catch {
        return null;
      }
    };

    // When no WS endpoint is configured, keep local state responsive without pretending a live feed exists.
    let timer: ReturnType<typeof setInterval> | undefined;
    let ws: WebSocket | undefined;

    (async () => {
      const wsUrl = await resolveWsUrl();

      if (cancelled) return;

      if (!wsUrl) {
        setStatus('local');
        timer = setInterval(() => {
          // keep reducers warm; no data mutation to avoid test flakiness
          dispatch({ type: 'SET_LOADING', payload: false });
        }, 15000);
        return;
      }

      setStatus('connecting');
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (!cancelled) setStatus('live');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          switch (message.type) {
            case 'inventory_update':
              dispatch({ type: 'UPDATE_INVENTORY_ITEM', payload: message.payload });
              break;
            case 'warehouse_update':
              dispatch({ type: 'UPDATE_WAREHOUSE', payload: message.payload });
              break;
            case 'supplier_update':
              dispatch({ type: 'UPDATE_SUPPLIER', payload: message.payload });
              break;
            case 'purchase_order_update':
              dispatch({ type: 'UPDATE_PO', payload: message.payload });
              break;
            case 'stock':
              dispatch({
                type: 'UPDATE_INVENTORY_ITEM',
                payload: { id: message.productId, stock: message.stock } as any,
              });
              break;
            default:
              break;
          }
        } catch (err) {
          console.error('Failed to parse inventory sync message', err);
          hadError = true;
          setStatus('error');
        }
      };

      ws.onerror = (err) => {
        console.error('Inventory sync error', err);
        hadError = true;
        setStatus('error');
      };

      ws.onclose = () => {
        if (!cancelled && !hadError) setStatus('idle');
      };
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      try {
        ws?.close();
      } catch {
        // ignore
      }
    };
  }, [dispatch, enabled]);

  return { status };
}
