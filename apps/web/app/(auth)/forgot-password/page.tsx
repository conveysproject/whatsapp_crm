import type { JSX } from "react";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage(): JSX.Element {
  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 mx-4">
      <ForgotPasswordForm />
    </div>
  );
}
