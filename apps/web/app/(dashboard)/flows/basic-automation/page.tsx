import { JSX } from "react";
import { PermissionGate } from "@/components/PermissionGate";

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
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <span className="text-5xl">⚙️</span>
          <p className="text-gray-500 text-sm">Basic automation settings coming soon.</p>
        </div>
      </div>
    </PermissionGate>
  );
}
