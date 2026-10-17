import type { JSX } from "react";
import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { authProvider } from "@/lib/auth/config";

const wbmsg = authProvider() === "wbmsg";

export default function ForgotPasswordPage(): JSX.Element {
  // Clerk has its own reset flow on the sign-in page.
  if (!wbmsg) redirect("/sign-in");
  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 mx-4">
      <ForgotPasswordForm />
    </div>
  );
}
