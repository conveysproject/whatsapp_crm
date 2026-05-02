"use client";

import { JSX, useEffect, useState } from "react";
import Link from "next/link";
import { useOnboardingStatus } from "@/app/(dashboard)/onboarding-context";

const DISMISSED_KEY = "setup_banner_dismissed";

export function SetupBanner(): JSX.Element | null {
  const { allDone } = useOnboardingStatus();
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDismissed(localStorage.getItem(DISMISSED_KEY) === "1");
  }, []);

  useEffect(() => {
    if (allDone) {
      localStorage.removeItem(DISMISSED_KEY);
    }
  }, [allDone]);

  if (!mounted || allDone || dismissed) return null;

  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-sm">
      <p className="text-amber-800">
        Finish setting up WhatsApp to unlock Inbox and Campaigns.{" "}
        <Link href="/checklist" className="font-semibold underline underline-offset-2 hover:text-amber-900">
          Complete setup →
        </Link>
      </p>
      <button
        aria-label="Dismiss setup banner"
        onClick={() => {
          localStorage.setItem(DISMISSED_KEY, "1");
          setDismissed(true);
        }}
        className="ml-4 text-amber-600 hover:text-amber-800 focus:outline-none"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}
