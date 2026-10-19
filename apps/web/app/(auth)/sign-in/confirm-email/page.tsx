import { Suspense } from "react";
import type { JSX } from "react";
import Image from "next/image";
import { PublicNav } from "@/components/public/PublicNav";
import { OAuthConfirmEmail } from "@/components/auth/OAuthConfirmEmail";

/** Own-auth only: finishing a Google/Facebook sign-in that still needs an email code. */
export default function ConfirmEmailPage(): JSX.Element {
  return (
    <div className="min-h-screen bg-[#F4F6FC]">
      <PublicNav active="sign-in" />
      <div className="flex items-center justify-center min-h-screen pt-[68px]">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl my-8 mx-4 px-6 py-10 space-y-6">
          <Image src="/wbmsg_logo.png" alt="WBMSG" width={200} height={56} style={{ height: "36px", width: "auto" }} />
          <Suspense fallback={null}>
            <OAuthConfirmEmail />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
