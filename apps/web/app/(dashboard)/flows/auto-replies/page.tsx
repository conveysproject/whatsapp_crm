import { JSX } from "react";
import { PermissionGate } from "@/components/PermissionGate";
import { AutoRepliesSection } from "../auto-replies-section";

export default function AutoRepliesPage(): JSX.Element {
  return (
    <PermissionGate permission="automation_access">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Auto-Replies</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Keyword-triggered automatic reply rules
          </p>
        </div>
        <AutoRepliesSection />
      </div>
    </PermissionGate>
  );
}
