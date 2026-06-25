import { JSX } from "react";
import { PermissionGate } from "@/components/PermissionGate";
import { BusinessHoursCard } from "./business-hours-card";

export default function BasicAutomationPage(): JSX.Element {
  return (
    <PermissionGate permission="automation_access">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Basic Automation</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Out of office, welcome messages, and delayed response settings
          </p>
        </div>
        <BusinessHoursCard />
      </div>
    </PermissionGate>
  );
}
