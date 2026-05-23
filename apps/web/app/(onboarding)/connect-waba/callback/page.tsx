"use client";

import { Suspense, useEffect, useState, type JSX } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
const REDIRECT_URI = process.env["NEXT_PUBLIC_META_REDIRECT_URI"] ?? "";

const Spinner = (
  <div className="text-center">
    <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
    <p className="text-sm text-gray-600">Connecting your WhatsApp account…</p>
  </div>
);

function WabaCallbackContent(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getToken } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const oauthError = searchParams.get("error");

    if (oauthError || !code) {
      setError(oauthError ?? "No code returned from Meta.");
      return;
    }

    void (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/v1/onboarding/waba-callback`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token ?? ""}`,
          },
          body: JSON.stringify({ code, embedded: true, redirectUri: REDIRECT_URI }),
        });

        if (res.ok) {
          router.replace("/provision-number");
          return;
        }

        const body = await res.json().catch(() => ({})) as {
          detail?: { error?: { message?: string } };
          error?: { message?: string } | string;
        };
        const msg =
          body?.detail?.error?.message ??
          (typeof body?.error === "string" ? body.error : body?.error?.message) ??
          `Server error (HTTP ${res.status})`;
        setError(msg);
      } catch {
        setError("Network error. Please try again.");
      }
    })();
  }, [searchParams, getToken, router]);

  if (error) {
    return (
      <div className="text-center">
        <p className="text-red-600 font-medium mb-4">Connection failed.</p>
        <p className="text-xs text-gray-500 mb-6 font-mono">{error}</p>
        <Link
          href="/connect-waba"
          className="block w-full text-center bg-[#1877F2] text-white font-medium py-2.5 rounded-lg"
        >
          Try again
        </Link>
      </div>
    );
  }

  return Spinner;
}

export default function WabaCallbackPage(): JSX.Element {
  return (
    <Suspense fallback={Spinner}>
      <WabaCallbackContent />
    </Suspense>
  );
}
