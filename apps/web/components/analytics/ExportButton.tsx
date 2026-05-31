"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";

interface ExportButtonProps {
  tab: string;
  days: number;
  disabled?: boolean;
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function ExportButton({ tab, days, disabled }: ExportButtonProps): JSX.Element {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/v1/analytics/export?tab=${tab}&days=${days}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) {
        setError("Export failed. Please try again.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analytics-${tab}-${days}d.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Export failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => { void handleExport(); }}
        disabled={disabled || loading}
        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Exporting..." : "Export CSV"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
