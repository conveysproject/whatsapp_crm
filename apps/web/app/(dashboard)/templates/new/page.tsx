import type { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { TemplateForm } from "./TemplateForm";

export default async function NewTemplatePage(): Promise<JSX.Element> {
  await auth.protect();
  return <TemplateForm />;
}
