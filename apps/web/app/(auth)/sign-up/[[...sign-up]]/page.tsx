import { SignUp } from "@clerk/nextjs";
import type { JSX } from "react";
import { DM_Sans, Bricolage_Grotesque } from "next/font/google";
import Link from "next/link";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm", weight: ["400", "500"] });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-br", weight: ["500", "600", "700", "800"] });

export default function SignUpPage(): JSX.Element {
  return (
    <div className={`${dmSans.variable} ${bricolage.variable} min-h-screen bg-[#F4F6FC] flex items-center justify-center`}>
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl flex overflow-hidden">
        {/* Left: Marketing/Info */}
        <div className="hidden md:flex flex-col justify-center items-start bg-[#F4F6FC] px-12 py-16 w-1/2 gap-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-[#0BBF77] flex items-center justify-center">
              <span className="font-extrabold text-white text-xl">TC</span>
            </div>
            <span className="font-br text-2xl font-extrabold text-gray-900">TrustCRM</span>
          </div>
          <h2 className="font-br text-3xl font-extrabold text-gray-900 mb-2">Turn WhatsApp into your #1 revenue channel</h2>
          <ul className="text-gray-700 text-base space-y-2 pl-5 list-disc">
            <li>Unified WhatsApp inbox for your team</li>
            <li>AI-powered replies and analytics</li>
            <li>Automate campaigns & close more deals</li>
            <li>No credit card required</li>
          </ul>
          <div className="mt-8 text-gray-400 text-xs">Already have an account? <Link href="/sign-in" className="text-[#0BBF77] font-bold hover:underline">Log in</Link></div>
        </div>
        {/* Right: Clerk SignUp */}
        <div className="flex-1 flex flex-col justify-center items-center px-6 py-12">
          <div className="w-full max-w-md">
            <SignUp />
          </div>
        </div>
      </div>
    </div>
  );
}
