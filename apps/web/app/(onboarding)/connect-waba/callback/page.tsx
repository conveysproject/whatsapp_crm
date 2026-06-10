"use client";

import { Suspense, useEffect, useState, type JSX } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

function CallbackHandler(): JSX.Element {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { getToken } = useAuth();
  const [error, setError] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    const errorParam = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (errorParam) {
      setError(errorDescription ?? "Connection was cancelled.");
      return;
    }
    if (!code) {
      setError("No authorisation code received from Meta.");
      return;
    }

    let flow: "onboarding" | "reconnect" = "onboarding";
    let isSMB = false;
    try {
      const raw = searchParams.get("state") ?? "{}";
      const state = JSON.parse(raw) as { flow?: string; isSMB?: boolean };
      if (state.flow === "reconnect") flow = "reconnect";
      isSMB = state.isSMB ?? false;
    } catch { /* use defaults */ }

    void (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/v1/whatsapp-account/connect`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token ?? ""}`,
          },
          body: JSON.stringify({ code, isSMB, flow }),
        });

        const body = await res.json() as {
          data?: { phoneNumberId?: string | null };
          error?: { message?: string };
        };

        if (!res.ok) {
          setError(body.error?.message ?? `Error ${res.status}`);
          return;
        }

        if (flow === "onboarding") {
          router.replace(body.data?.phoneNumberId ? "/checklist" : "/provision-number");
        } else {
          router.replace("/settings/whatsapp-account?connected=1");
        }
      } catch {
        setError("Network error — please try again.");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
          <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <p className="text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={() => router.replace("/connect-waba")}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="w-8 h-8 border-4 border-[#1877F2] border-t-transparent rounded-full animate-spin" aria-hidden="true" />
      <p className="text-gray-600 text-sm">Connecting your WhatsApp account…</p>
    </div>
  );
}

export default function ConnectWabaCallbackPage(): JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="w-8 h-8 border-4 border-[#1877F2] border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          <p className="text-gray-600 text-sm">Connecting your WhatsApp account…</p>
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
