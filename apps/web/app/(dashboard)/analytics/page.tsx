import { JSX, Suspense } from "react";
import { AnalyticsShell } from "@/components/analytics/AnalyticsShell";

export default function AnalyticsPage(): JSX.Element {
  return (
    <Suspense fallback={<div className="h-8 bg-gray-100 rounded animate-pulse w-48" />}>
      <AnalyticsShell />
    </Suspense>
  );
}
