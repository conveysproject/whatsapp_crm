import { JSX } from "react";

interface MetricCardProps {
  label: string;
  value: number | string;
  trend?: string;
  trendUp?: boolean;
}

export function MetricCard({ label, value, trend, trendUp }: MetricCardProps): JSX.Element {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-card">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
      {trend && (
        <p className={`text-xs mt-1 ${trendUp ? "text-green-600" : "text-red-500"}`}>
          {trendUp ? "↑" : "↓"} {trend}
        </p>
      )}
    </div>
  );
}
