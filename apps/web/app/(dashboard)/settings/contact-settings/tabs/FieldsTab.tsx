import { JSX } from "react";
import DefaultFieldsPanel from "./DefaultFieldsPanel";
import CustomFieldsManager from "./CustomFieldsManager";

export default function FieldsTab(): JSX.Element {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-3">
        <DefaultFieldsPanel />
      </div>
      <div className="lg:col-span-2">
        <CustomFieldsManager />
      </div>
    </div>
  );
}
