import type { JSX } from "react";
import { SignInScreen } from "@/components/auth/SignInScreen";
import { DEFAULT_BRAND } from "@/lib/brand";

export default function SignInPage(): JSX.Element {
  return <SignInScreen brand={DEFAULT_BRAND} />;
}
