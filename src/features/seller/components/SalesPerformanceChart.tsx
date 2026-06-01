'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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
      <div className="flex h-[300px] w-full items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
        No live seller sales data has been collected yet.
      </div>
    );
  }

  return (
    <div ref={chartRef} className="chart-shell h-[300px] w-full min-w-[1px]">
      {canRenderChart ? (
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={300}>
          <AreaChart data={safeData}>
            <defs>
              <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#71717a' }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#71717a' }} />
            <Tooltip
              contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
            />
            <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
          </AreaChart>
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}
