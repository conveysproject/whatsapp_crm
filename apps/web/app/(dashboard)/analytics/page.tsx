import { JSX, Suspense } from "react";
import { AnalyticsShell } from "@/components/analytics/AnalyticsShell";
import { PermissionGate } from "@/components/PermissionGate";

export default function AnalyticsPage(): JSX.Element {
  return (
    <PermissionGate permission="analytics_access">
      <Suspense fallback={<div className="h-8 bg-gray-100 rounded animate-pulse w-48" />}>
        <AnalyticsShell />
      </Suspense>
    </PermissionGate>
  );
}
