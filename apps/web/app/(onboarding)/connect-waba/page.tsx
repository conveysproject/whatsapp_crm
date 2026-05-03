"use client";

import { useState, useEffect, useRef, type JSX } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Script from "next/script";

const APP_ID = process.env["NEXT_PUBLIC_META_APP_ID"] ?? "";
const CONFIG_ID = process.env["NEXT_PUBLIC_META_CONFIG_ID"] ?? "";
const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

declare global {
  interface Window {
    FB: {
      init: (params: object) => void;
      login: (
        callback: (response: { authResponse?: { code: string } }) => void,
        params: object
      ) => void;
    };
    fbAsyncInit: () => void;
    launchWhatsAppSignup: () => void;
  }
}

export default function ConnectWabaPage(): JSX.Element {
  const { getToken } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);

  // Captured from the WA_EMBEDDED_SIGNUP FINISH event
  const sessionRef = useRef<{ phoneNumberId: string; wabaId: string }>({
    phoneNumberId: "",
    wabaId: "",
  });

  useEffect(() => {
    // Listen for session info from Meta's popup
    const sessionInfoListener = (event: MessageEvent) => {
      if (event.origin !== "https://www.facebook.com") return;
      try {
        const data = JSON.parse(event.data as string) as {
          type?: string;
          event?: string;
          data?: { phone_number_id?: string; waba_id?: string };
        };
        if (data.type === "WA_EMBEDDED_SIGNUP" && data.event === "FINISH") {
          sessionRef.current = {
            phoneNumberId: data.data?.phone_number_id ?? "",
            wabaId: data.data?.waba_id ?? "",
          };
        }
      } catch {
        // non-JSON message — ignore
      }
    };

    window.addEventListener("message", sessionInfoListener);
    return () => window.removeEventListener("message", sessionInfoListener);
  }, []);

  useEffect(() => {
    window.fbAsyncInit = function () {
      window.FB.init({
        appId: APP_ID,
        autoLogAppEvents: true,
        xfbml: true,
        version: "v22.0",
      });
      setSdkReady(true);
    };
  }, []);

  async function handleConnect(): Promise<void> {
    if (!sdkReady) return;
    setStatus("loading");
    setErrorMsg(null);
    sessionRef.current = { phoneNumberId: "", wabaId: "" };

    console.log("[WA Signup] APP_ID:", APP_ID, "CONFIG_ID:", CONFIG_ID);

    window.FB.login(
      (response) => {
        if (!response.authResponse?.code) {
          setStatus("error");
          setErrorMsg("Connection cancelled or failed. Please try again.");
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
              body: JSON.stringify({
                code: response.authResponse!.code,
                embedded: true,
                phoneNumberId: sessionRef.current.phoneNumberId,
                wabaId: sessionRef.current.wabaId,
              }),
            });

            if (res.ok) {
              // Phone number provisioned in the popup — skip straight to invite
              const hasPhone = !!sessionRef.current.phoneNumberId;
              router.replace(hasPhone ? "/invite-team" : "/provision-number");
            } else {
              const body = await res.json().catch(() => ({})) as {
                error?: { message?: string } | string;
                detail?: { error?: { message?: string } };
              };
              const msg =
                body?.detail?.error?.message ??
                (typeof body?.error === "string" ? body.error : (body?.error as { message?: string })?.message) ??
                "Server error. Please try again.";
              setErrorMsg(msg);
              setStatus("error");
            }
          } catch {
            setErrorMsg("Network error. Please try again.");
            setStatus("error");
          }
        })();
      },
      {
        config_id: CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: { sessionInfoVersion: 2, setup: {} },
      }
    );
  }

  if (!APP_ID || !CONFIG_ID) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Connect WhatsApp Business</h2>
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4 mb-6">
          <p className="text-sm text-yellow-800 font-medium">Meta configuration incomplete</p>
          <p className="text-xs text-yellow-700 mt-1">
            Set{" "}
            <code className="bg-yellow-100 px-1 rounded">NEXT_PUBLIC_META_APP_ID</code> and{" "}
            <code className="bg-yellow-100 px-1 rounded">NEXT_PUBLIC_META_CONFIG_ID</code> in your
            environment variables.
          </p>
        </div>
        <Link
          href="/checklist"
          className="block w-full text-center border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-sm"
        >
          Back to checklist
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* @ts-expect-error -- next/script ScriptProps type mismatch with Next.js 15 */}
      <Script src="https://connect.facebook.net/en_US/sdk.js" strategy="afterInteractive" />
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Connect WhatsApp Business</h2>
        <p className="text-sm text-gray-500 mb-6">
          A guided setup will open in a popup — connect your WhatsApp Business Account and phone
          number in one flow.
        </p>

        {status === "error" && errorMsg && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-4">
            <p className="text-sm text-red-600">{errorMsg}</p>
          </div>
        )}

        <button
          onClick={() => { void handleConnect(); }}
          disabled={status === "loading" || !sdkReady}
          className="block w-full text-center bg-[#1877F2] hover:bg-[#166fe5] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors"
        >
          {status === "loading" ? "Connecting…" : !sdkReady ? "Loading…" : "Connect with Meta"}
        </button>

        <p className="mt-4 text-center text-xs text-gray-400">
          Already connected?{" "}
          <Link href="/checklist" className="text-green-600 hover:underline">
            Skip to checklist
          </Link>
        </p>
      </div>
    </>
  );
}
