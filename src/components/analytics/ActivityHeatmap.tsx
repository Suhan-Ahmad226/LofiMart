import React from 'react';

const intensityColors = ['#f3f4f6', '#dcfce7', '#bbf7d0', '#86efac', '#16a34a'];

type HeatmapDay = {
  day: string;
  hours: Array<{ hour: number; count: number }>;
};

function getColor(count: number, maxCount: number) {
  if (maxCount <= 0) return intensityColors[0];
  const ratio = count / maxCount;
  if (ratio <= 0.2) return intensityColors[1];
  if (ratio <= 0.4) return intensityColors[2];
  if (ratio <= 0.7) return intensityColors[3];
  return intensityColors[4];
}

const ActivityHeatmap: React.FC<{ data?: HeatmapDay[] }> = ({ data = [] }) => {
  const safeData = Array.isArray(data)
    ? data.map((day) => ({
        ...day,
        hours: Array.isArray(day?.hours) ? day.hours : [],
      }))
    : [];
  const maxCount = Math.max(0, ...safeData.flatMap((day) => day.hours.map((hour) => Number(hour.count || 0))));

  return (
    <div className="min-h-64 min-w-0 rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
      <h3 className="font-bold mb-2">Order Activity Heatmap</h3>
      {safeData.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-gray-500">
          No recent order activity data is available yet.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1">
            {safeData.map((day) => (
              <div key={day.day} className="flex flex-col space-y-0.5">
                {day.hours.map((hour) => (
                  <div
                    key={`${day.day}-${hour.hour}`}
                    className="h-4 w-4 rounded-[3px]"
                    style={{ backgroundColor: getColor(hour.count, maxCount) }}
                    title={`${day.day} ${hour.hour}:00 - ${hour.count} orders`}
                  />
                ))}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Higher intensity cells indicate stronger live order activity windows across the week.
          </p>
        </>
      )}
    </div>
  );
};

export default ActivityHeatmap;
