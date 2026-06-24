import { JSX } from "react";
import { PredictiveTab } from "@/components/analytics/PredictiveTab";
import { PermissionGate } from "@/components/PermissionGate";

export default function PredictiveAnalyticsPage(): JSX.Element {
  return (
    <PermissionGate permission="analytics_access">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-semibold">Predictive Analytics</h1>
        <PredictiveTab />
      </div>
    </PermissionGate>
  );
}
