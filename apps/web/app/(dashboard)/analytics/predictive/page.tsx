import { JSX } from "react";
import { PredictiveTab } from "@/components/analytics/PredictiveTab";

export default function PredictiveAnalyticsPage(): JSX.Element {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Predictive Analytics</h1>
      <PredictiveTab />
    </div>
  );
}
