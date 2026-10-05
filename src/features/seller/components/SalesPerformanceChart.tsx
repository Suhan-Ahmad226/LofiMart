'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatPrice } from '../../../lib/utils';

interface SalesPoint {
  label: string;
  revenue: number;
}

/**
 * The insights endpoint labels each bucket with an ISO timestamp. Raw ISO
 * strings are unreadable on an axis, so anything parseable is reduced to a
 * short day/hour label; non-date labels pass through untouched.
 */
function formatAxisLabel(label: unknown): string {
  if (typeof label !== 'string') return '';
  const parsed = new Date(label);
  if (Number.isNaN(parsed.getTime())) return label;

  return parsed.toLocaleString('en-BD', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    hour12: true,
  });
}

export default function SalesPerformanceChart({ data = [] }: { data?: SalesPoint[] }) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [canRenderChart, setCanRenderChart] = useState(false);
  const safeData = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  useEffect(() => {
    const node = chartRef.current;
    if (!node) return;

    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      setCanRenderChart(rect.width > 1 && rect.height > 1);
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  if (!safeData.length) {
    return (
      <div className="lm-empty flex h-[300px] w-full flex-col items-center justify-center">
        <p className="text-sm font-semibold text-lm-heading">No live sales trend yet</p>
        <p className="mt-2 max-w-sm text-sm text-lm-meta">
          Once orders start flowing, this panel will show revenue momentum, trend direction, and performance spikes.
        </p>
      </div>
    );
  }

  return (
    <div ref={chartRef} className="chart-shell h-[300px] w-full min-w-[1px]">
      {canRenderChart ? (
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={300}>
          <AreaChart data={safeData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0d9488" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#0d9488" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              minTickGap={28}
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={formatAxisLabel}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={64}
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={(value) => formatPrice(Number(value)).replace(/\.00$/, '')}
            />
            <Tooltip
              formatter={(value) => formatPrice(Number(value ?? 0))}
              labelFormatter={formatAxisLabel}
              labelStyle={{ color: '#0f172a', fontWeight: 700 }}
              contentStyle={{
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 20px 25px -5px rgba(15, 23, 42, 0.1)',
              }}
              itemStyle={{ color: '#0f172a' }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#0d9488"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorSales)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, fill: '#ffffff', stroke: '#0d9488' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}
