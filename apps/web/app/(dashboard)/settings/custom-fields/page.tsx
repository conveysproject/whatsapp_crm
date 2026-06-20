import { redirect } from "next/navigation";

export default function CustomFieldsRedirect(): never {
  redirect("/settings/contact-settings?tab=fields");
}
