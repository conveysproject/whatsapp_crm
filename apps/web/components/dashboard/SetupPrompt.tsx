"use client";

import type { JSX } from "react";
import Link from "next/link";
import { useOnboardingStatusOptional } from "@/app/(dashboard)/onboarding-context";

/** Replaces the layout SetupBanner on the v2 dashboard. Shown whenever onboarding is unfinished; not dismissible. */
export function SetupPrompt(): JSX.Element | null {
  const onboarding = useOnboardingStatusOptional();
  if (!onboarding || onboarding.allDone) return null;
  return (
    <Link
      data-testid="setup-prompt"
      href="/checklist"
      className="block rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 px-4 py-3 text-sm font-medium text-amber-800 dark:text-amber-300 break-words"
    >
      Finish setting up WhatsApp to unlock Inbox and Campaigns.{" "}
      <span className="font-semibold underline underline-offset-2">Complete setup</span>
    </Link>
  );
}
