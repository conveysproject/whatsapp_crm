"use client";

import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import Script from "next/script";

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export const TURNSTILE_ENABLED = Boolean(process.env["NEXT_PUBLIC_TURNSTILE_SITE_KEY"]);

/** Renders only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set. Tokens are single-use: bump resetKey after each request. */
export function Turnstile({
  onToken,
  resetKey = 0,
}: {
  onToken: (token: string | null) => void;
  resetKey?: number;
}): JSX.Element | null {
  const siteKey = process.env["NEXT_PUBLIC_TURNSTILE_SITE_KEY"];
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  cb.current = onToken;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!siteKey || !ready || !box.current || !window.turnstile) return;
    cb.current(null);
    const id = window.turnstile.render(box.current, {
      sitekey: siteKey,
      callback: (t: string) => cb.current(t),
      "expired-callback": () => cb.current(null),
      "error-callback": () => cb.current(null),
    });
    return () => window.turnstile?.remove(id);
  }, [siteKey, ready, resetKey]);

  if (!siteKey) return null;
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setReady(true)}
      />
      <div ref={box} />
    </>
  );
}
