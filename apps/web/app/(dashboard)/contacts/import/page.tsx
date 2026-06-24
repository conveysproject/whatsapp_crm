import { JSX } from "react";
import { ImportWizard } from "./ImportWizard";
import { PermissionGate } from "@/components/PermissionGate";

export default function ContactsImportPage(): JSX.Element {
  return (
    <PermissionGate permission="contacts_access">
      <ImportWizard />
    </PermissionGate>
  );
}
