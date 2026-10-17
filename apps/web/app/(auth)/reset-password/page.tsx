import type { JSX } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { authProvider } from "@/lib/auth/config";

const wbmsg = authProvider() === "wbmsg";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}): Promise<JSX.Element> {
  // Clerk has its own reset flow on the sign-in page.
  if (!wbmsg) redirect("/sign-in");
  const { email } = await searchParams;
  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 mx-4 space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Reset your password</h1>
      <ResetPasswordForm
        initialEmail={typeof email === "string" ? email : ""}
        note="Enter the 6-digit code we emailed you and choose a new password."
        footer={
          <p className="text-sm text-gray-600">
            <Link href="/forgot-password" className="text-[#0BBF77] font-semibold hover:underline">
              Send a new code
            </Link>
          </p>
        }
      />
    </div>
  );
}
