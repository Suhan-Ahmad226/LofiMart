import React from 'react';
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
  return (
    <div className="h-64 min-w-0 w-full rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
      <h3 className="font-bold mb-2">{title}</h3>
      {data.length === 0 ? (
        <div className="flex h-[calc(100%-2rem)] min-h-0 items-center justify-center text-sm text-gray-500">
          No live sales data has been collected yet.
        </div>
      ) : (
        <div className="h-[calc(100%-2rem)] min-h-[180px] min-w-0 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="revenue" stroke="#8884d8" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default SalesChart;
