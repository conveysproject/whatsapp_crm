import { JSX } from "react";
import DefaultFieldsPanel from "./DefaultFieldsPanel";
import CustomFieldsManager from "./CustomFieldsManager";

export default function FieldsTab(): JSX.Element {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <DefaultFieldsPanel />
      </div>
      <div>
        <CustomFieldsManager />
      </div>
    </div>
  );
}
