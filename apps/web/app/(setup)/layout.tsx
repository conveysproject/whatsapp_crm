import { auth } from "@clerk/nextjs/server";
import type { JSX, ReactNode } from "react";

/**
 * Setup layout — post-signup flows that require auth but not full onboarding.
 * Routes: /business-details, and any future profile-setup steps.
 */
export default async function SetupLayout({ children }: { children: ReactNode }): Promise<JSX.Element> {
  await auth.protect();
  return <>{children}</>;
}