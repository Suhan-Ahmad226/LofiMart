'use client';

import React, { useEffect, useRef, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DataPoint {
  label: string;
  revenue: number;
  orders?: number;
}

interface SalesChartProps {
  title?: string;
  data?: DataPoint[];
}

const SalesChart: React.FC<SalesChartProps> = ({ title = 'Sales (recent hours)', data = [] }) => {
  const chartBodyRef = useRef<HTMLDivElement | null>(null);
  const [canRenderChart, setCanRenderChart] = useState(false);
  const safeData = Array.isArray(data) ? data : [];

  useEffect(() => {
    const node = chartBodyRef.current;
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

  return (
    <div className="chart-shell h-72 w-full rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:h-80">
      <h3 className="font-bold mb-2">{title}</h3>
      {safeData.length === 0 ? (
        <div className="flex h-[calc(100%-2rem)] min-h-0 items-center justify-center text-sm text-gray-500">
          No live sales data has been collected yet.
        </div>
      ) : (
        <div ref={chartBodyRef} className="h-[calc(100%-2rem)] min-h-[180px] min-w-[1px] w-full">
          {canRenderChart ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={180}>
              <LineChart data={safeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="revenue" stroke="#8884d8" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default SalesChart;
