"use client";

import { useEffect, useState } from "react";
import type { JSX } from "react";
import { NO_METHODS, PROVIDER_LABEL, parseMethods, type AuthMethods, type OAuthProviderId } from "@/lib/auth/oauth";
import type { Theme } from "./fields";

let cached: Promise<AuthMethods> | null = null;

/** Optional sign-in methods switched on in the API (WhatsApp, Google, Facebook). All off until known. */
export function useAuthMethods(): AuthMethods {
  const [methods, setMethods] = useState<AuthMethods>(NO_METHODS);
  useEffect(() => {
    let alive = true;
    cached ??= fetch("/api/auth/methods", { cache: "no-store" })
      .then(async (r) => parseMethods(r.ok ? await r.json() : null))
      .catch(() => {
        cached = null;
        return NO_METHODS;
      });
    void cached.then((m) => {
      if (alive) setMethods(m);
    });
    return () => {
      alive = false;
    };
  }, []);
  return methods;
}

const BUTTON = {
  light: "w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50",
  brand: "w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50",
  dark: "w-full rounded-lg border border-gray-600 bg-gray-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-700",
} as const;

/**
 * "Continue with Google / Facebook": a plain same-origin form post to the BFF, which redirects to the
 * provider. intent "link" connects the provider to the signed-in account (Settings → Security).
 */
export function ProviderButton({
  provider,
  intent,
  redirectUrl,
  label,
  className,
}: {
  provider: OAuthProviderId;
  intent: "signin" | "link";
  redirectUrl?: string;
  label?: string;
  className?: string;
}): JSX.Element {
  return (
    <form method="post" action={`/api/auth/oauth/${provider}/start`}>
      <input type="hidden" name="intent" value={intent} />
      {redirectUrl && <input type="hidden" name="redirect_url" value={redirectUrl} />}
      <button type="submit" className={className ?? BUTTON.light}>
        {label ?? `Continue with ${PROVIDER_LABEL[provider]}`}
      </button>
    </form>
  );
}

export function SocialButtons({
  methods,
  redirectUrl,
  theme = "light",
}: {
  methods: AuthMethods;
  redirectUrl?: string;
  theme?: Theme;
}): JSX.Element | null {
  const providers = (["google", "facebook"] as const).filter((p) => methods[p]);
  if (providers.length === 0) return null;
  return (
    <div className="space-y-3 pt-2">
      <div className={`flex items-center gap-3 text-xs ${theme === "dark" ? "text-gray-500" : "text-gray-400"}`}>
        <span className="h-px flex-1 bg-current opacity-40" />
        or
        <span className="h-px flex-1 bg-current opacity-40" />
      </div>
      {providers.map((p) => (
        <ProviderButton key={p} provider={p} intent="signin" redirectUrl={redirectUrl} className={BUTTON[theme]} />
      ))}
    </div>
  );
}

/** Self-loading variant for server-rendered pages (sign-up). */
export function SocialSignInSection(): JSX.Element | null {
  const methods = useAuthMethods();
  return <SocialButtons methods={methods} />;
}
