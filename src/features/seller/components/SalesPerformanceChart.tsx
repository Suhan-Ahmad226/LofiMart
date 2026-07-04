'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatPrice } from '@/src/lib/utils';

interface SalesPoint {
  label: string;
  revenue: number;
}

export default function SalesPerformanceChart({ data = [] }: { data?: SalesPoint[] }) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [canRenderChart, setCanRenderChart] = useState(false);
  const safeData = Array.isArray(data) ? data : [];

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
      <div className="flex h-[300px] w-full flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-border bg-secondary/20 px-6 text-center">
        <p className="text-sm font-semibold text-slate-700">No live sales trend yet</p>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
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
                <stop offset="5%" stopColor="#16a34a" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#16a34a" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e4e4e7" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(value) => formatPrice(Number(value)).replace(/\.00$/, '')} />
            <Tooltip
              formatter={(value) => formatPrice(Number(value ?? 0))}
              labelStyle={{ color: '#0f172a', fontWeight: 700 }}
              contentStyle={{
                borderRadius: '18px',
                border: '1px solid rgba(148, 163, 184, 0.18)',
                boxShadow: '0 18px 30px -20px rgb(15 23 42 / 0.35)',
              }}
              itemStyle={{ color: '#0f172a' }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#16a34a"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#colorSales)"
              dot={{ r: 3, strokeWidth: 2, fill: '#ffffff', stroke: '#16a34a' }}
              activeDot={{ r: 5, strokeWidth: 2, fill: '#ffffff', stroke: '#16a34a' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}
