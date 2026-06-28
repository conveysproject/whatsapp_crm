import { Suspense, type JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { TemplateForm } from "./TemplateForm";
import { PermissionGate } from "@/components/PermissionGate";
import { getLibraryTemplate } from "@/data/template-library";
import type { TemplateFormState } from "./templateFormTypes";
import { INITIAL_STATE } from "./templateFormTypes";

function buildInitialStateFromLibrary(libId: string): Partial<TemplateFormState> {
  const tpl = getLibraryTemplate(libId);
  if (!tpl) return {};
  return {
    name: tpl.name,
    category: tpl.metaCategory,
    bodyText: tpl.body,
    buttons: tpl.buttons.map((btn, i) => ({
      id: String(i + 1),
      type: btn.type,
      text: btn.text,
      url: "",
      urlIsDynamic: false,
      urlExample: "",
      phone: "",
      couponExample: "",
    })),
  };
}

export default async function NewTemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ lib?: string }>;
}): Promise<JSX.Element> {
  await auth.protect();
  const { lib } = await searchParams;

  const initialState: TemplateFormState = lib
    ? { ...INITIAL_STATE, ...buildInitialStateFromLibrary(lib) }
    : INITIAL_STATE;

  return (
    <PermissionGate permission="templates_access" sub="templates_create">
      <Suspense>
        <TemplateForm initialState={initialState} />
      </Suspense>
    </PermissionGate>
  );
}
