import type { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { TemplateForm } from "./TemplateForm";
import { PermissionGate } from "@/components/PermissionGate";

export default async function NewTemplatePage(): Promise<JSX.Element> {
  await auth.protect();
  return (
    <PermissionGate permission="templates_access" sub="templates_create">
      <TemplateForm />
    </PermissionGate>
  );
}
