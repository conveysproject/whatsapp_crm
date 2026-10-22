import type { JSX } from "react";
import { DM_Sans, Bricolage_Grotesque } from "next/font/google";
import Link from "next/link";
import { PublicNav } from "@/components/public/PublicNav";
import { SignInForm } from "@/components/auth/SignInForm";
import { AuthLogo } from "@/components/brand/AuthLogo";
import { BrandedShell } from "@/components/brand/BrandedShell";
import type { Brand } from "@/lib/brand";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm", weight: ["400", "500"] });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-br", weight: ["500", "600", "700", "800"] });

/**
 * The sign-in screen. With the default brand it is the WBMSG page as always (public nav, "New to WBMSG?" link).
 * With a brand it shows the brand's logo, no WBMSG nav and no sign-up link (clients are invited), and the forgot
 * password link stays on the branded route. The form and its endpoints are the same in both.
 */
export function SignInScreen({ brand }: { brand: Brand }): JSX.Element {
  const branded = !brand.isDefault;
  return (
    <BrandedShell brand={brand}>
      <div className={`${dmSans.variable} ${bricolage.variable} min-h-screen bg-[#F4F6FC]`}>
        {!branded && <PublicNav active="sign-in" />}

        {/* Content offset below the 68px fixed nav */}
        <div className={branded ? "flex items-center justify-center min-h-screen" : "flex items-center justify-center min-h-screen pt-[68px]"}>
          <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl flex overflow-hidden my-8 mx-4">
            {/* Left: Brand panel */}
            <div className="hidden md:flex flex-col justify-center items-start bg-[#F4F6FC] px-12 py-16 w-1/2 gap-6">
              <div className="mb-4">
                <AuthLogo />
              </div>
              <h2 className="font-br text-3xl font-extrabold text-gray-900 mb-2">
                Welcome back
              </h2>
              <ul className="text-gray-700 text-base space-y-2 pl-5 list-disc">
                <li>Your inbox, contacts &amp; campaigns are waiting</li>
                <li>Pick up exactly where you left off</li>
                <li>Real-time WhatsApp conversations</li>
                <li>AI-powered insights updated daily</li>
              </ul>
              {!branded && (
                <div className="mt-8 text-gray-400 text-xs">
                  {`New to ${brand.name}?`}{" "}
                  <Link href="/sign-up" className="text-[#0BBF77] font-bold hover:underline">
                    Create a free account
                  </Link>
                </div>
              )}
              {branded && brand.supportEmail && (
                <div className="mt-8 text-gray-400 text-xs">
                  Need access?{" "}
                  <a href={`mailto:${brand.supportEmail}`} className="text-brand-600 font-bold hover:underline">
                    Contact {brand.supportEmail}
                  </a>
                </div>
              )}
            </div>

            {/* Right: sign-in form */}
            <div className="flex-1 flex flex-col justify-center items-center px-6 py-12">
              <div className="w-full max-w-md">
                {branded ? <SignInForm forgotHref={`/c/${brand.slug}/forgot-password`} /> : <SignInForm />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </BrandedShell>
  );
}
